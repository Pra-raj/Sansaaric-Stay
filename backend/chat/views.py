import json
import logging
from datetime import timedelta

from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Count
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import Conversation, Message
from .services import (
    NO_DOCUMENTS_MESSAGE,
    answer_question,
    build_context,
    cache_answer,
    cached_answer,
    citation_list,
    is_no_answer,
    retrieve,
    stream_answer_text,
)

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 4000
RATE_LIMIT_PER_MINUTE = 12
RATE_LIMIT_WINDOW_SECONDS = 60


def _ensure_session(request):
    """Touch the session so anonymous users get a stable key for their threads."""
    session = request.session
    if not session.session_key:
        session.save()
    return session.session_key


def health_check(request):
    """Liveness probe for orchestration/load balancers."""
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        logger.exception("Health check failed (database unreachable)")
        return JsonResponse(
            {"status": "error", "database": "unreachable"},
            status=503,
        )
    return JsonResponse({"status": "ok", "database": "ok"})


def _identity(request):
    """Return (user, session_key) describing who owns conversations on this request."""
    if request.user.is_authenticated:
        return request.user, ""
    return None, _ensure_session(request)


def _current_conversation(request, conversation_id=None):
    """Fetch the conversation the current identity is allowed to use."""
    user, session_key = _identity(request)

    qs = Conversation.objects.all()
    if user:
        qs = qs.filter(user=user)
    elif session_key:
        qs = qs.filter(session_key=session_key, user__isnull=True)
    else:
        return None

    if conversation_id:
        return qs.filter(pk=conversation_id).first()
    return qs.first()


def _create_conversation(request, title):
    user, session_key = _identity(request)
    return Conversation.objects.create(
        user=user,
        session_key=session_key,
        title=title[:255],
    )


TURN_HISTORY_MAX_MESSAGES = 20  # ~10 turns, enough for reformulation


def _turn_history(conversation):
    """Pair user questions with their assistant replies, newest N messages only.

    Returns history as [{"question": ..., "answer": ...}, ...]. A user turn
    without an assistant reply (in-flight or failed) is dropped so later turns
    never align with the wrong question.
    """
    latest = list(
        conversation.messages.order_by("-pk")[:TURN_HISTORY_MAX_MESSAGES]
    )
    latest.reverse()
    history = []
    pending_question = None
    for message in latest:
        if message.role == "user":
            pending_question = message
        elif message.role == "assistant" and pending_question is not None:
            history.append(
                {"question": pending_question.content, "answer": message.content}
            )
            pending_question = None
    return history


def chat_page(request):
    if request.GET.get("new"):
        # Explicit "start fresh" — don't resume the most recent conversation.
        # The conversation itself is created lazily on the first message so a
        # GET can't litter the database with empty threads.
        return render(request, "chat/chat.html", {"conversation": None, "thread": []})
    conversation = _current_conversation(request, request.GET.get("conversation"))
    messages = conversation.messages.all() if conversation else []
    return render(
        request,
        "chat/chat.html",
        {"conversation": conversation, "thread": messages},
    )


def _parse_chat_body(request):
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None, {"error": "Invalid JSON body."}
    message = (body.get("message") or "").strip()
    if not message:
        return None, {"error": "message is required."}
    if len(message) > MAX_MESSAGE_LENGTH:
        return None, {
            "error": f"message must be at most {MAX_MESSAGE_LENGTH} characters."
        }
    return {
        "message": message,
        "conversation_id": body.get("conversation_id"),
        "new": bool(body.get("new")),
    }, None


def _rate_limited(request):
    """True when the identity has already sent its per-minute quota of chats.

    DB-backed so it works across processes without a broker. Blocks anonymous
    scraping and runaway Groq/Cohere spend while staying friendly to real users.
    """
    user, session_key = _identity(request)
    if user is None and not session_key:
        return False
    since = timezone.now() - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)
    qs = Message.objects.filter(
        role="user",
        created_at__gte=since,
        conversation__isnull=False,
    )
    if user:
        qs = qs.filter(conversation__user=user)
    else:
        qs = qs.filter(
            conversation__session_key=session_key,
            conversation__user__isnull=True,
        )
    return qs.count() >= RATE_LIMIT_PER_MINUTE


def _open_conversation(request, payload):
    if payload.get("new"):
        # Explicit "start fresh" from /?new=1: don't resume the latest thread.
        conversation = _create_conversation(request, payload["message"])
    else:
        conversation = _current_conversation(request, payload["conversation_id"])
        if payload["conversation_id"] and conversation is None:
            return None, {"error": "Conversation not found."}, 404
        if conversation is None:
            conversation = _create_conversation(request, payload["message"])
    history = _turn_history(conversation)
    Message.objects.create(conversation=conversation, role="user", content=payload["message"])
    return conversation, history, 200


@staff_member_required(login_url="/accounts/login/")
def docadmin_chats(request):
    conversations = (
        Conversation.objects.select_related("user")
        .annotate(message_count=Count("messages"))
        .order_by("-updated_at")[:50]
    )
    return render(
        request,
        "documents/docadmin_chats.html",
        {"conversations": conversations},
    )


@staff_member_required(login_url="/accounts/login/")
def docadmin_chat_thread(request, pk):
    conversation = get_object_or_404(
        Conversation.objects.select_related("user"),
        pk=pk,
    )
    return render(
        request,
        "documents/docadmin_chat_thread.html",
        {"conversation": conversation},
    )


@require_POST
def api_chat(request):
    """Non-streaming fallback: returns the complete answer as JSON."""
    payload, error = _parse_chat_body(request)
    if error:
        return JsonResponse(error, status=400)

    if _rate_limited(request):
        return JsonResponse(
            {"error": "Too many requests. Please try again in a minute."},
            status=429,
        )

    conversation, history, status = _open_conversation(request, payload)
    if status != 200:
        return JsonResponse(history, status=status)

    try:
        # History-free questions (FAQ-style) can be served from the answer
        # cache; follow-up turns are context-dependent and bypass it.
        cacheable = not history
        cached = cached_answer(payload["message"]) if cacheable else None
        if cached is not None:
            answer, citations = cached
        else:
            answer, citations = answer_question(payload["message"], history)
            if cacheable and not is_no_answer(answer):
                cache_answer(payload["message"], answer, citations)
    except Exception:
        logger.exception("Chat generation failed")
        return JsonResponse(
            {"error": "Something went wrong while generating the answer."},
            status=500,
        )

    Message.objects.create(
        conversation=conversation,
        role="assistant",
        content=answer,
        citations=citations,
    )
    conversation.save(update_fields=["updated_at"])

    return JsonResponse(
        {
            "conversation_id": conversation.pk,
            "answer": answer,
            "citations": citations,
        }
    )


@require_POST
def api_chat_stream(request):
    """Streams the answer as SSE-style events (text/event-stream via fetch).

    Each event is a `data:` line: {"type": "token"|"done"|"error", ...}.
    """
    payload, error = _parse_chat_body(request)
    if error:
        return JsonResponse(error, status=400)

    if _rate_limited(request):
        return JsonResponse(
            {"error": "Too many requests. Please try again in a minute."},
            status=429,
        )

    if payload.get("new"):
        conversation = _create_conversation(request, payload["message"])
    else:
        conversation = _current_conversation(request, payload["conversation_id"])
        if payload["conversation_id"] and conversation is None:
            return JsonResponse({"error": "Conversation not found."}, status=404)
        if conversation is None:
            conversation = _create_conversation(request, payload["message"])
    history = _turn_history(conversation)

    conversation_id = conversation.pk
    question = payload["message"]
    # Persist the user turn upfront (same as api_chat) so a failed stream still
    # records the customer's question instead of leaving an empty conversation.
    Message.objects.create(
        conversation=conversation,
        role="user",
        content=question,
    )

    def sse(event):
        return f"data: {json.dumps(event)}\n\n"

    def event_stream():
        answer = None
        citations = []

        def persist():
            # Persist the assistant turn. The connection is intentionally left
            # for Django's request_finished lifecycle (closing it here would
            # abort any later DB access that shares the same connection).
            if answer is not None:
                Message.objects.create(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=answer,
                    citations=citations,
                )
                Conversation.objects.filter(pk=conversation_id).update(
                    updated_at=timezone.now(),
                )

        try:
            from document_ingestion.models import Chunk

            if not Chunk.objects.exists():
                answer = NO_DOCUMENTS_MESSAGE
                yield sse(
                    {
                        "type": "done",
                        "conversation_id": conversation_id,
                        "answer": answer,
                        "citations": citations,
                    }
                )
                return

            # History-free questions can be answered straight from the cache.
            cacheable = not history
            cached = cached_answer(question) if cacheable else None
            if cached is not None:
                answer, citations = cached
                yield sse(
                    {
                        "type": "done",
                        "conversation_id": conversation_id,
                        "answer": answer,
                        "citations": citations,
                    }
                )
                return

            _, docs = retrieve(question, history)
            context = build_context(docs)

            parts = []
            for delta in stream_answer_text(question, context):
                parts.append(delta)
                yield sse({"type": "token", "delta": delta})
            answer = "".join(parts)

            citations = (
                []
                if is_no_answer(answer)
                else citation_list(docs)
            )
            if cacheable and not is_no_answer(answer):
                cache_answer(question, answer, citations)
            yield sse(
                {
                    "type": "done",
                    "conversation_id": conversation_id,
                    "answer": answer,
                    "citations": citations,
                }
            )
        except Exception:
            logger.exception("Streaming chat failed")
            yield sse(
                {
                    "type": "error",
                    "message": "Something went wrong while generating the answer.",
                }
            )
        finally:
            persist()

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response