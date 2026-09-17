import json

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
    citation_list,
    is_no_answer,
    retrieve,
    stream_answer_text,
)


def _ensure_session(request):
    """Touch the session so anonymous users get a stable key for their threads."""
    session = request.session
    if not session.session_key:
        session.save()
    return session.session_key


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


def _turn_history(conversation):
    return [
        {"question": speaker.content, "answer": answer.content}
        for speaker, answer in zip(
            conversation.messages.filter(role="user").all(),
            conversation.messages.filter(role="assistant").all(),
        )
    ]


def chat_page(request):
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
    return {"message": message, "conversation_id": body.get("conversation_id")}, None


def _open_conversation(request, payload):
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

    conversation, history, status = _open_conversation(request, payload)
    if status != 200:
        return JsonResponse(history, status=status)

    try:
        answer, citations = answer_question(payload["message"], history)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=500)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=500)

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

    conversation = _current_conversation(request, payload["conversation_id"])
    if payload["conversation_id"] and conversation is None:
        return JsonResponse({"error": "Conversation not found."}, status=404)
    if conversation is None:
        conversation = _create_conversation(request, payload["message"])
    history = _turn_history(conversation)

    conversation_id = conversation.pk
    question = payload["message"]

    def sse(event):
        return f"data: {json.dumps(event)}\n\n"

    def event_stream():
        answer = None
        citations = []

        def persist():
            from django.db import connections

            try:
                if answer is not None:
                    Message.objects.create(
                        conversation_id=conversation_id,
                        role="user",
                        content=question,
                    )
                    Message.objects.create(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=answer,
                        citations=citations,
                    )
                    Conversation.objects.filter(pk=conversation_id).update(
                        updated_at=timezone.now(),
                    )
            finally:
                connections.close_all()

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
            yield sse(
                {
                    "type": "done",
                    "conversation_id": conversation_id,
                    "answer": answer,
                    "citations": citations,
                }
            )
        except Exception as exc:
            yield sse({"type": "error", "message": str(exc)[:500]})
        finally:
            persist()

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response