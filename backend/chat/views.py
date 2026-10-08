import json
import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Max, OuterRef, Q, Subquery
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsStaff
from api.serializers import DetailErrorSerializer

from .models import Conversation, Message
from .router import RAG, classify, concierge_reply
from .serializers import (
    InboxContactUpdateSerializer,
    InboxCreateSerializer,
    InboxMessageSerializer,
    InboxReplySerializer,
    InboxThreadSerializer,
)
from .services import (
    NO_DOCUMENTS_MESSAGE,
    answer_question,
    build_context,
    cache_answer,
    cached_answer,
    citation_list,
    is_no_answer,
    normalize_answer,
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


_health_is_ok = True


def health_check(request):
    """Liveness probe for orchestration/load balancers.

    Returns a generic payload; the DB probe result only drives the status code
    (compose healthcheck consumes it). Downtime is logged on state transitions
    only, not once per probe.
    """
    global _health_is_ok
    from django.db import connection

    healthy = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        healthy = False
        if _health_is_ok:
            logger.warning("Health check transition: up -> down (database unreachable)")
    else:
        if not _health_is_ok:
            logger.info("Health check transition: down -> up")
    _health_is_ok = healthy
    return JsonResponse(
        {"status": "ok" if healthy else "error"},
        status=200 if healthy else 503,
    )


def _identity(request):
    """Return (user, session_key) describing who owns conversations on this request."""
    if request.user.is_authenticated:
        return request.user, ""
    return None, _ensure_session(request)


def _claim_guest_conversation(request, user, conversation_id):
    """Adopt a guest thread (same browser session) as the current user.

    Lets a guest who later logs in continue the exact conversation they started
    anonymously, and surfaces their account details in the unified inbox. The
    unguessable session key is the ownership proof: a user can only claim a
    guest thread created on their own session, never by guessing ids.
    """
    session_key = _ensure_session(request)
    guest = (
        Conversation.objects.select_related("user")
        .filter(pk=conversation_id, user__isnull=True, session_key=session_key)
        .first()
    )
    if guest is None:
        return None
    guest.user = user
    guest.title = (user.get_full_name() or user.email or "Guest")[:255]
    guest.email = user.email or guest.email
    guest.session_key = ""
    guest.save(update_fields=["user", "title", "email", "session_key", "updated_at"])
    return guest


def _current_conversation(request, conversation_id=None):
    """Fetch the conversation the current identity is allowed to use."""
    user, session_key = _identity(request)

    qs = Conversation.objects.select_related("user").all()
    if user:
        qs = qs.filter(user=user)
    elif session_key:
        qs = qs.filter(session_key=session_key, user__isnull=True)
    else:
        return None

    if conversation_id:
        found = qs.filter(pk=conversation_id).first()
        if found is None and user:
            # Guest thread on this session: claim it so login continues the
            # same chat and the inbox shows the account instead of "Guest".
            found = _claim_guest_conversation(request, user, conversation_id)
        return found
    return qs.first()


def _create_conversation(request, payload):
    user, session_key = _identity(request)
    name = (payload.get("name") or "").strip()[:255]
    if not name and user:
        name = (user.get_full_name() or user.email or "Guest")[:255]
    email = (payload.get("email") or "").strip()[:254]
    if not email and user:
        email = user.email or ""
    return Conversation.objects.create(
        user=user,
        session_key=session_key,
        title=name or "Guest",
        email=email,
        phone=(payload.get("phone") or "").strip()[:32],
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
    conversation_id = body.get("conversation_id")
    if conversation_id not in (None, ""):
        if not str(conversation_id).isdigit() or int(conversation_id) <= 0:
            return None, {"error": "conversation_id must be a positive integer."}
    return {
        "message": message,
        "conversation_id": body.get("conversation_id"),
        "new": bool(body.get("new")),
        "name": (body.get("name") or "").strip()[:255],
        "email": (body.get("email") or "").strip()[:254],
        "phone": (body.get("phone") or "").strip()[:32],
    }, None


def _rate_limited(request, conversation):
    """True when the identity already sent its per-minute quota of chats.

    DB-backed so it works across processes without a broker. Callers must hold
    the conversation row's row lock (S6) so the count below and their subsequent
    user-turn insert serialize per identity.
    """
    since = timezone.now() - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)
    qs = Message.objects.filter(role="user", created_at__gte=since)
    if conversation.user_id:
        qs = qs.filter(conversation__user_id=conversation.user_id)
    else:
        qs = qs.filter(
            conversation__session_key=conversation.session_key,
            conversation__user__isnull=True,
        )
    return qs.count() >= RATE_LIMIT_PER_MINUTE


def _open_conversation(request, payload, *, lock=False):
    """Fetch or create the conversation the current identity may use.

    Does not persist any message; callers insert the user turn themselves.
    With lock=True an existing row is SELECT ... FOR UPDATE so a rate-limit
    count + insert is serialized per identity (S6). A conversation created in
    this transaction is confined to it and needs no extra lock.
    """
    if payload.get("new"):
        # Explicit "start fresh" from /?new=1: don't resume the latest thread.
        conversation = _create_conversation(request, payload)
    else:
        conversation = _current_conversation(request, payload["conversation_id"])
        if payload["conversation_id"] and conversation is None:
            return None, {"error": "Conversation not found."}, 404
        if conversation is None:
            conversation = _create_conversation(request, payload)
        elif lock:
            Conversation.objects.select_for_update().only("pk").get(pk=conversation.pk)
    history = _turn_history(conversation)
    return conversation, history, 200


INBOX_MAX_ROWS = 100


def inbox_rows(queryset):
    """Conversations with the annotations InboxMessageSerializer expects.

    Computed in SQL so listing or updating one row never triggers an N+1
    over the message history.
    """
    last = Message.objects.filter(conversation=OuterRef("pk"))
    return queryset.select_related("user").annotate(
        last_message_content=Subquery(last.order_by("-created_at").values("content")[:1]),
        last_message_at=Subquery(last.order_by("-created_at").values("created_at")[:1]),
    )


class InboxListView(APIView):
    """Conversations, newest activity first, optionally filtered."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Inbox"],
        parameters=[
            OpenApiParameter("q", str, OpenApiParameter.QUERY, description="Search name/email/phone."),
            OpenApiParameter(
                "channel",
                str,
                OpenApiParameter.QUERY,
                description="Filter by channel; defaults to all.",
            ),
        ],
        responses={200: InboxMessageSerializer(many=True), 403: DetailErrorSerializer},
    )
    def get(self, request):
        queryset = inbox_rows(Conversation.objects.all())

        query = (request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query) | Q(email__icontains=query) | Q(phone__icontains=query)
            )

        channel = (request.query_params.get("channel") or "").strip()
        if channel:
            queryset = queryset.filter(channel=channel)

        # The inbox is a live 3-pane view, not an archive browser, so a single
        # capped page beats pagination here. Revisit if conversations grow past
        # a few hundred.
        return Response(
            InboxMessageSerializer(queryset[:INBOX_MAX_ROWS], many=True).data
        )

    @extend_schema(
        tags=["Admin / Inbox"],
        request=InboxCreateSerializer,
        responses={
            201: InboxThreadSerializer,
            400: DetailErrorSerializer,
            403: DetailErrorSerializer,
        },
    )
    def post(self, request):
        serializer = InboxCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()
        return Response(
            InboxThreadSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


class InboxView(APIView):
    """GET the full thread, or PUT contact/handoff edits."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Inbox"],
        responses={
            200: InboxThreadSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        return Response(InboxThreadSerializer(conversation).data)

    @extend_schema(
        tags=["Admin / Inbox"],
        request=InboxContactUpdateSerializer,
        responses={
            200: InboxThreadSerializer,
            400: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def put(self, request, conversation_id):
        """Edit contact details."""
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        serializer = InboxContactUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        changed = [
            field
            for field, value in serializer.validated_data.items()
            if getattr(conversation, field) != value
        ]
        if changed:
            for field in changed:
                setattr(conversation, field, serializer.validated_data[field])
            conversation.save(update_fields=[*changed, "updated_at"])

        return Response(InboxThreadSerializer(conversation).data)


class InboxReplyView(APIView):
    """Post a staff reply."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Inbox"],
        request=InboxReplySerializer,
        responses={
            201: InboxThreadSerializer,
            400: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def post(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, pk=conversation_id)
        serializer = InboxReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        Message.objects.create(
            conversation=conversation,
            role="assistant",
            content=serializer.validated_data["content"],
        )
        # C9: the inbox orders on Conversation.updated_at, which auto_now only
        # touches on a save of the row itself. Without this the replied thread
        # stays where it was and never rises to the top of the list.
        conversation.save(update_fields=["updated_at"])

        return Response(
            InboxThreadSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


@csrf_exempt
@require_POST
def api_chat(request):
    """Non-streaming fallback: returns the complete answer as JSON."""
    payload, error = _parse_chat_body(request)
    if error:
        return JsonResponse(error, status=400)

    conversation = None
    try:
        # Per-identity rate limit and the user-turn insert share one transaction
        # that holds the conversation row lock, so concurrent requests for the
        # same identity serialize on the count+insert (S6).
        with transaction.atomic():
            conversation, history, conv_status = _open_conversation(
                request, payload, lock=True
            )
            if conv_status != 200:
                return JsonResponse(history, status=conv_status)
            if _rate_limited(request, conversation):
                return JsonResponse(
                    {"error": "Too many requests. Please try again in a minute."},
                    status=429,
                )
            Message.objects.create(
                conversation=conversation,
                role="user",
                content=payload["message"],
            )

        # Greetings, thanks, booking nudges, etc. resolve deterministically —
        # no retrieval or LLM call, and never cached (replies are personalized).
        intent = classify(payload["message"])
        if intent != RAG:
            answer = concierge_reply(intent, conversation)
            citations = []
        else:
            # History-free questions (FAQ-style) can be served from the answer
            # cache; follow-up turns are context-dependent and bypass it. The
            # corpus existence check runs first so a "no documents" message is
            # never cached (or served stale after training).
            cacheable = not history
            cached = None
            if cacheable:
                from document_ingestion.models import Chunk

                if Chunk.objects.filter(document__status="ready").exists():
                    cached = cached_answer(payload["message"])
            if cached is not None:
                answer, citations = cached
            else:
                answer, citations = answer_question(payload["message"], history)
                if cacheable and answer != NO_DOCUMENTS_MESSAGE and not is_no_answer(answer):
                    cache_answer(payload["message"], answer, citations)

        Message.objects.create(
            conversation=conversation,
            role="assistant",
            content=answer,
            citations=citations,
        )
        conversation.save(update_fields=["updated_at"])
    except Exception:
        logger.exception("Chat generation failed")
        return JsonResponse(
            {
                "conversation_id": conversation.pk if conversation else None,
                "error": "Something went wrong while generating the answer.",
            },
            status=500,
        )

    return JsonResponse(
        {
            "conversation_id": conversation.pk,
            "answer": answer,
            "citations": citations,
        }
    )


@csrf_exempt
@require_POST
def api_chat_stream(request):
    """Streams the answer as SSE-style events (text/event-stream via fetch).

    Each event is a `data:` line: {"type": "token"|"done"|"error", ...}.
    """
    payload, error = _parse_chat_body(request)
    if error:
        return JsonResponse(error, status=400)

    try:
        # Per-identity rate limit and the user-turn insert share one transaction
        # that holds the conversation row lock (S6).
        with transaction.atomic():
            conversation, history, conv_status = _open_conversation(
                request, payload, lock=True
            )
            if conv_status != 200:
                return JsonResponse(history, status=conv_status)
            if _rate_limited(request, conversation):
                return JsonResponse(
                    {"error": "Too many requests. Please try again in a minute."},
                    status=429,
                )
            # Persist the user turn here (same as api_chat) so a failed stream
            # still records the customer's question.
            Message.objects.create(
                conversation=conversation,
                role="user",
                content=payload["message"],
            )
    except Exception:
        logger.exception("Chat rate-limit check failed")
        return JsonResponse(
            {"error": "Something went wrong while generating the answer."},
            status=500,
        )

    conversation_id = conversation.pk
    question = payload["message"]

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
            intent = classify(question)
            if intent != RAG:
                answer = concierge_reply(intent, conversation)
                yield sse(
                    {
                        "type": "done",
                        "conversation_id": conversation_id,
                        "answer": answer,
                        "citations": citations,
                    }
                )
                return

            from document_ingestion.models import Chunk

            if not Chunk.objects.filter(document__status="ready").exists():
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
                # §5 SSE contract: the token payload key is "text".
                yield sse({"type": "token", "text": delta})
            answer = normalize_answer("".join(parts))

            citations = (
                []
                if is_no_answer(answer)
                else citation_list(docs)
            )
            if (
                cacheable
                and answer != NO_DOCUMENTS_MESSAGE
                and not is_no_answer(answer)
            ):
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
                    "conversation_id": conversation_id,
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


EVENT_POLL_INTERVAL_SECONDS = 1.0
EVENT_IDLE_TIMEOUT_SECONDS = 25.0


def _history_payload(conversation):
    messages = conversation.messages.order_by("created_at")
    return {
        "conversation_id": conversation.pk,
        "messages": [
            {
                "id": m.pk,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@csrf_exempt
def api_chat_history(request):
    """Return the full thread the current identity may read ({messages:[...]}).

    Guaranteed same ownership rules as a send (session key for guests, the
    account after a login claims it), so a logged-out browser can no longer
    read a thread that was claimed by an account.
    """
    conversation_id = request.GET.get("conversation_id")
    if not str(conversation_id or "").isdigit() or int(conversation_id) <= 0:
        return JsonResponse({"error": "conversation_id must be a positive integer."}, status=400)
    conversation = _current_conversation(request, int(conversation_id))
    if conversation is None:
        return JsonResponse({"error": "Conversation not found."}, status=404)
    return JsonResponse(_history_payload(conversation))


@csrf_exempt
def api_chat_events(request):
    """Stream new thread messages as they are posted (SSE via fetch).

    The public widget subscribes while open. Frames are
    `data: {"type":"message","message":{...}}`. The connection is held for a
    bounded idle window so stray sockets from closed widgets die on their own;
    the client reconnects for the next message.
    """
    conversation_id = request.GET.get("conversation_id")
    if not str(conversation_id or "").isdigit() or int(conversation_id) <= 0:
        return JsonResponse({"error": "conversation_id must be a positive integer."}, status=400)
    since_id = request.GET.get("since_id")
    since_id = int(since_id) if str(since_id or "").isdigit() else 0
    conversation = _current_conversation(request, int(conversation_id))
    if conversation is None:
        return JsonResponse({"error": "Conversation not found."}, status=404)

    def sse(event):
        return f"data: {json.dumps(event)}\n\n"

    def event_stream():
        import time

        last_id = since_id
        idle_for = 0.0
        while True:
            try:
                new = list(
                    conversation.messages.filter(pk__gt=last_id).order_by("created_at")
                )
            except Exception:
                logger.exception("Chat event poll failed")
                yield sse({"type": "error", "message": "Connection lost."})
                return
            if new:
                for message in new:
                    yield sse(
                        {
                            "type": "message",
                            "message": {
                                "id": message.pk,
                                "role": message.role,
                                "content": message.content,
                                "created_at": message.created_at.isoformat(),
                            },
                        }
                    )
                    last_id = message.pk
                idle_for = 0.0
            else:
                idle_for += EVENT_POLL_INTERVAL_SECONDS
                if idle_for >= EVENT_IDLE_TIMEOUT_SECONDS:
                    yield sse({"type": "done"})
                    return
            time.sleep(EVENT_POLL_INTERVAL_SECONDS)

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@csrf_exempt
def api_admin_inbox_events(request):
    """Stream one `refresh` signal whenever any inbox conversation gains a message.

    Staff-only. Unlike the per-thread public events view, this watches the whole
    inbox: the watermark is the newest message timestamp across all
    conversations. The client drops its fixed poll and re-fetches the list and
    selected thread on every `refresh` frame (no cleanup in the generator; the
    connection is left for Django's request_finished lifecycle).
    """
    user = request.user
    if not (user and user.is_authenticated and user.is_staff):
        return JsonResponse({"error": "Forbidden."}, status=403)

    def sse(event):
        return f"data: {json.dumps(event)}\n\n"

    def event_stream():
        import time

        try:
            baseline = Message.objects.aggregate(watermark=Max("created_at"))["watermark"]
        except Exception:
            logger.exception("Admin inbox event baseline failed")
            yield sse({"type": "error", "message": "Connection lost."})
            return
        idle_for = 0.0
        while True:
            try:
                latest = Message.objects.aggregate(watermark=Max("created_at"))["watermark"]
            except Exception:
                logger.exception("Admin inbox event poll failed")
                yield sse({"type": "error", "message": "Connection lost."})
                return
            if latest is not None and (baseline is None or latest > baseline):
                baseline = latest
                idle_for = 0.0
                yield sse({"type": "refresh", "since": latest.isoformat()})
            else:
                idle_for += EVENT_POLL_INTERVAL_SECONDS
                if idle_for >= EVENT_IDLE_TIMEOUT_SECONDS:
                    yield sse({"type": "done"})
                    return
            time.sleep(EVENT_POLL_INTERVAL_SECONDS)

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
    """Stream new thread messages as they are posted (SSE via fetch).

    The public widget subscribes while open. Frames are
    `data: {"type":"message","message":{...}}`. The connection is held for a
    bounded idle window so stray sockets from closed widgets die on their own;
    the client reconnects for the next message.
    """
    conversation_id = request.GET.get("conversation_id")
    if not str(conversation_id or "").isdigit() or int(conversation_id) <= 0:
        return JsonResponse({"error": "conversation_id must be a positive integer."}, status=400)
    since_id = request.GET.get("since_id")
    since_id = int(since_id) if str(since_id or "").isdigit() else 0
    conversation = _current_conversation(request, int(conversation_id))
    if conversation is None:
        return JsonResponse({"error": "Conversation not found."}, status=404)

    def sse(event):
        return f"data: {json.dumps(event)}\n\n"

    def event_stream():
        import time

        last_id = since_id
        idle_for = 0.0
        while True:
            try:
                new = list(
                    conversation.messages.filter(pk__gt=last_id).order_by("created_at")
                )
            except Exception:
                logger.exception("Chat event poll failed")
                yield sse({"type": "error", "message": "Connection lost."})
                return
            if new:
                for message in new:
                    yield sse(
                        {
                            "type": "message",
                            "message": {
                                "id": message.pk,
                                "role": message.role,
                                "content": message.content,
                                "created_at": message.created_at.isoformat(),
                            },
                        }
                    )
                    last_id = message.pk
                idle_for = 0.0
            else:
                idle_for += EVENT_POLL_INTERVAL_SECONDS
                if idle_for >= EVENT_IDLE_TIMEOUT_SECONDS:
                    yield sse({"type": "done"})
                    return
            time.sleep(EVENT_POLL_INTERVAL_SECONDS)

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response