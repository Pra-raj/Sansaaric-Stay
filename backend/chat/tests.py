"""Tests for the chat API: RAG helpers, cache, streaming, rate limits.

Run:  .venv/bin/python manage.py test chat
"""

import datetime
import json
import threading
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import Client, SimpleTestCase, TestCase, TransactionTestCase
from django.urls import reverse
from django.utils import timezone

from langchain_core.documents import Document

from document_ingestion.models import Chunk, ReferenceDocument

from .models import Conversation, Message
from .serializers import InboxEntrySerializer, InboxMessageSerializer
from .services import (
    NO_INFO_PREFIX,
    NO_INFO_MESSAGE,
    NO_DOCUMENTS_MESSAGE,
    _answer_cache,
    _cache_lock,
    cache_answer,
    cached_answer,
    citation_list,
    extract_text,
    is_no_answer,
    normalize_answer,
    rerank,
    rrf_fuse,
)
from . import router, services, views


def _fake_chunk(pk, content):
    return type("FakeChunk", (), {"pk": pk, "content": content})()


def _clear_cache():
    with _cache_lock:
        _answer_cache.clear()


def _sse_events(response):
    raw = b"".join(response.streaming_content).decode()
    return [
        json.loads(line[6:])
        for line in raw.splitlines()
        if line.startswith("data: {")
    ]


class ServicesUnitTests(SimpleTestCase):
    def test_is_no_answer(self):
        self.assertTrue(is_no_answer(""))
        self.assertTrue(is_no_answer(NO_INFO_PREFIX))
        self.assertTrue(is_no_answer("   " + NO_INFO_PREFIX))
        self.assertTrue(is_no_answer(services.GEN_ERROR))
        self.assertTrue(is_no_answer(services.GEN_UNAVAILABLE))
        self.assertFalse(is_no_answer("Checkout is at 11:00 AM."))

    def test_normalize_answer_exact_copy(self):
        self.assertEqual(
            normalize_answer(""),
            NO_INFO_MESSAGE,
        )
        self.assertEqual(
            normalize_answer("  " + NO_INFO_PREFIX),
            NO_INFO_MESSAGE,
        )
        self.assertEqual(
            normalize_answer("Checkout is at 11:00 AM."),
            "Checkout is at 11:00 AM.",
        )

    def test_rerank_keeps_full_context_when_scores_low(self):
        def fake_chunk(pk):
            return type(
                "FakeChunk",
                (),
                {"pk": pk, "content": f"chunk {pk}", "metadata": {"source": f"{pk}.txt"}},
            )()

        # 8 chunks, none exceeding the relevance floor -> must not shrink to one.
        chunks = [fake_chunk(pk) for pk in range(1, 9)]

        class LowReranker:
            def rerank(self, docs, question, top_n=len(chunks)):
                return [
                    {"index": i, "relevance_score": 0.05}
                    for i in range(len(docs))
                ]

        with patch("chat.services.get_reranker", return_value=LowReranker()):
            kept = rerank(chunks, "any question")

        self.assertGreaterEqual(len(kept), 5)
        self.assertEqual(
            [d.metadata["chunk_pk"] for d in kept],
            list(range(1, 6)),
        )

    def test_extract_text_string_and_blocks(self):
        self.assertEqual(extract_text("hello"), "hello")
        blocks = [
            {"type": "text", "text": "a"},
            {"type": "image", "image_url": "x"},
            {"type": "text", "text": "b"},
        ]
        self.assertEqual(extract_text(blocks), "a\nb")
        self.assertEqual(extract_text(123), "123")

    def test_rrf_fuse_orders_by_score(self):
        a = _fake_chunk(1, "one")
        b = _fake_chunk(2, "two")
        c = _fake_chunk(3, "three")
        fused = rrf_fuse([[a, b, c], [a, b]])
        self.assertEqual([chunk.pk for chunk in fused], [1, 2, 3])

    def test_citation_list_dedupes_sources(self):
        docs = [
            Document(page_content="first chunk", metadata={"source": "a.txt", "chunk_pk": 1}),
            Document(page_content="second chunk", metadata={"source": "a.txt", "chunk_pk": 2}),
            Document(page_content="other", metadata={"title": "b.pdf", "chunk_pk": 3}),
        ]
        citations = citation_list(docs, top_n=5)
        self.assertEqual([c["source"] for c in citations], ["a.txt", "b.pdf"])

    def test_answer_cache_roundtrip_and_normalization(self):
        _clear_cache()
        try:
            self.assertIsNone(cached_answer("What  is   checkout time?"))
            cache_answer(" What is checkout time? ", "11 AM", [{"source": "a.txt"}])
            answer, citations = cached_answer("what is checkout time?")
            self.assertEqual(answer, "11 AM")
            self.assertEqual(citations, [{"source": "a.txt"}])
        finally:
            _clear_cache()

    def test_answer_cache_evicts_expired(self):
        _clear_cache()
        try:
            cache_answer("q?", "old", [])
            key = services._cache_key("q?")
            with _cache_lock:
                _answer_cache[key] = (
                    timezone.now().timestamp() - services.ANSWER_CACHE_TTL_SECONDS - 10,
                    "old",
                    [],
                )
            self.assertIsNone(cached_answer("q?"))
            with _cache_lock:
                self.assertNotIn(key, _answer_cache)
        finally:
            _clear_cache()


class RetrievalFilterTests(TestCase):
    """Only chunks of `ready` documents are searchable (failed/re-training excluded)."""

    VECTOR = [0.5] * 384

    def _document(self, status, name):
        doc = ReferenceDocument.objects.create(
            file_name=name,
            file_type="txt",
            file_size=10,
            status=status,
        )
        tokens = ["aaa", "bbb"] if status == "ready" else ["ccc"]
        for index, token in enumerate(tokens, start=1):
            Chunk.objects.create(
                document=doc,
                content=f"{token} content",
                embedding=self.VECTOR,
                chunk_index=index,
            )
        return doc

    def test_vector_search_skips_failed_documents(self):
        ready = self._document("ready", "guide.txt")
        self._document("failed", "broken.txt")
        query = self.VECTOR

        hits = services.vector_search(query, k=5)
        self.assertTrue(hits)
        self.assertEqual({h.document_id for h in hits}, {ready.pk})

    def test_answer_question_with_only_nonready_docs_returns_no_documents(self):
        self._document("failed", "broken.txt")
        answer, citations = services.answer_question("What time is checkout?", [])
        self.assertEqual(answer, NO_DOCUMENTS_MESSAGE)
        self.assertEqual(citations, [])


class RouterTests(SimpleTestCase):
    def test_greetings_short_only(self):
        self.assertEqual(router.classify("hi"), router.GREETING)
        self.assertEqual(router.classify("hello there"), router.GREETING)
        self.assertEqual(router.classify("namaste"), router.GREETING)
        self.assertEqual(router.classify("how are you?"), router.GREETING)
        self.assertEqual(router.classify("k xa"), router.GREETING)
        # A greeting that leads into a real ask must not swallow the intent.
        self.assertEqual(
            router.classify("Hi, I want to book a night at Sunrise Lodge"),
            router.BOOKING,
        )
        self.assertEqual(router.classify("hello there"), router.GREETING)

    def test_social_and_identity_intents(self):
        self.assertEqual(router.classify("thank you so much"), router.THANKS)
        self.assertEqual(router.classify("dhanyabad"), router.THANKS)
        self.assertEqual(router.classify("bye"), router.FAREWELL)
        self.assertEqual(router.classify("who are you?"), router.IDENTITY)
        self.assertEqual(router.classify("help"), router.IDENTITY)

    def test_booking_and_out_of_scope(self):
        self.assertEqual(
            router.classify("is the mountain lodge available for 2 nights"),
            router.BOOKING,
        )
        self.assertEqual(
            router.classify("I'd like to book a stay."), router.BOOKING
        )
        self.assertEqual(
            router.classify("may I book the sunrise lodge for two nights"),
            router.BOOKING,
        )
        self.assertEqual(
            router.classify("checking in on Friday for two nights"),
            router.BOOKING,
        )
        self.assertEqual(
            router.classify("do you arrange flights to Pokhara?"),
            router.OUT_OF_SCOPE,
        )

    def test_doc_questions_stay_rag(self):
        for question in (
            "What is your booking policy?",
            "Do you need a deposit to book?",
            "What time is check-in at the lodge?",
            "How does the cancellation process work?",
        ):
            self.assertEqual(router.classify(question), router.RAG, question)

    def test_rag_fallthrough(self):
        for question in (
            "What time is checkout?",
            "",
            "Is breakfast included at Sunrise Lodge?",
            "hippopotamus",
        ):
            self.assertEqual(router.classify(question), router.RAG, question)

    def test_concierge_reply_is_none_for_rag(self):
        self.assertIsNone(router.concierge_reply(router.RAG))

    def test_greeting_uses_conversation_name(self):
        conv = type("FakeConv", (), {"title": "Amya"})()
        reply = router.concierge_reply(router.GREETING, conv)
        self.assertIn("Amya", reply)
        self.assertIn("Sansaaric", reply)
        anonymous = router.concierge_reply(router.GREETING)
        self.assertNotIn("Amya", anonymous)


class RequestLoggingMiddlewareTests(SimpleTestCase):
    def test_cors_preflight_short_circuit_does_not_500(self):
        # CorsMiddleware answers the preflight itself, so Session/Auth
        # middleware inside it never run and request.user is never set.
        response = self.client.options(
            "/api/auth/login",
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        )
        self.assertEqual(response.status_code, 200)


class ContactCaptureTests(TestCase):
    """api_chat must name conversations after the contact, not the question."""

    def setUp(self):
        _clear_cache()

    def tearDown(self):
        _clear_cache()

    def test_anonymous_chat_titles_conversation_guest(self):
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "What time is checkout?", "new": True}),
            content_type="application/json",
        )
        conversation = Conversation.objects.latest("pk")
        self.assertEqual(conversation.title, "Guest")
        self.assertEqual(conversation.email, "")
        self.assertEqual(conversation.phone, "")
        self.assertIsNone(conversation.user)

    def test_payload_contact_info_is_stored(self):
        self.client.post(
            reverse("api_chat"),
            data=json.dumps(
                {
                    "message": "Hi",
                    "new": True,
                    "name": "Jane Doe",
                    "email": "jane@example.com",
                    "phone": "9800000000",
                }
            ),
            content_type="application/json",
        )
        conversation = Conversation.objects.latest("pk")
        self.assertEqual(conversation.title, "Jane Doe")
        self.assertEqual(conversation.email, "jane@example.com")
        self.assertEqual(conversation.phone, "9800000000")

    def test_account_details_used_when_no_payload_contact(self):
        from django.contrib.auth.models import User

        user = User.objects.create_user(
            username="jane", email="jane@example.com", first_name="Jane"
        )
        self.client.force_login(user)
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Hi", "new": True}),
            content_type="application/json",
        )
        conversation = Conversation.objects.latest("pk")
        self.assertEqual(conversation.user, user)
        self.assertEqual(conversation.title, "Jane")
        self.assertEqual(conversation.email, "jane@example.com")


class BackfillMigrationTests(TestCase):
    def test_question_titles_are_replaced(self):
        import importlib

        from django.apps import apps
        from django.contrib.auth.models import User

        migration = importlib.import_module("chat.migrations.0005_backfill_conversation_titles")

        anon = Conversation.objects.create(
            session_key="s", title="What time is checkout?"
        )
        Message.objects.create(
            conversation=anon, role="user", content="What time is checkout?"
        )

        user = User.objects.create_user(
            username="jane", email="jane@example.com", first_name="Jane"
        )
        owned = Conversation.objects.create(user=user, title="Book a room?")
        Message.objects.create(conversation=owned, role="user", content="Book a room?")

        named = Conversation.objects.create(session_key="t", title="Riya")
        Message.objects.create(conversation=named, role="user", content="Hi")

        migration.backfill_question_titles(apps, None)

        anon.refresh_from_db()
        self.assertEqual(anon.title, "Guest")
        owned.refresh_from_db()
        self.assertEqual(owned.title, "Jane")
        self.assertEqual(owned.email, "jane@example.com")
        named.refresh_from_db()
        self.assertEqual(named.title, "Riya")


class ChatApiTests(TestCase):
    def setUp(self):
        _clear_cache()

    def tearDown(self):
        _clear_cache()

    def _post_chat(self, payload=None):
        return self.client.post(
            reverse("api_chat"),
            data=json.dumps(payload or {"message": "What time is checkout?"}),
            content_type="application/json",
        )

    def _client_session_key(self):
        session = self.client.session
        session["client"] = True
        session.save()
        return session.session_key

    def test_body_validation(self):
        response = self.client.post(
            reverse("api_chat"),
            data="not-json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        response = self._post_chat({"message": "   "})
        self.assertEqual(response.status_code, 400)

        response = self._post_chat({"message": "x" * (views.MAX_MESSAGE_LENGTH + 1)})
        self.assertEqual(response.status_code, 400)

    @patch("chat.views.answer_question", return_value=("Checkout is at 11.", [{"source": "guide.txt"}]))
    def test_chat_persists_and_returns_answer(self, _mock):
        response = self._post_chat({"message": "What time is checkout?"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["answer"], "Checkout is at 11.")
        self.assertEqual(body["citations"], [{"source": "guide.txt"}])

        conversation = Conversation.objects.get(pk=body["conversation_id"])
        messages = list(conversation.messages.order_by("pk"))
        self.assertEqual([m.role for m in messages], ["user", "assistant"])
        self.assertEqual(messages[0].content, "What time is checkout?")
        self.assertEqual(messages[1].citations, [{"source": "guide.txt"}])

    @patch("chat.views.answer_question", side_effect=RuntimeError("boom"))
    def test_chat_error_is_sanitized(self, _mock):
        response = self._post_chat()
        self.assertEqual(response.status_code, 500)
        self.assertIn("Something went wrong", response.json()["error"])
        # The user turn persists; no assistant message is invented on failure.
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(
            list(Conversation.objects.first().messages.values_list("role", flat=True)),
            ["user"],
        )

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_history_free_answers_use_cache(self, mock):
        # C7 gates the cache on a non-empty corpus (so a "no documents"
        # answer is never cached), so the test needs a ready chunk first.
        doc = ReferenceDocument.objects.create(
            file_name="guide.txt", file_type="txt", file_size=10, status="ready"
        )
        Chunk.objects.create(
            document=doc, content="checkout is at 11",
            embedding=[0.5] * 384, chunk_index=1,
        )
        session_key = self._client_session_key()
        c1 = Conversation.objects.create(session_key=session_key)
        c2 = Conversation.objects.create(session_key=session_key)

        r1 = self._post_chat({"message": "What is checkout time?", "conversation_id": c1.pk})
        r2 = self._post_chat({"message": "What is checkout time?", "conversation_id": c2.pk})
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        mock.assert_called_once()

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_new_chat_starts_fresh_conversation(self, mock):
        session_key = self._client_session_key()
        existing = Conversation.objects.create(session_key=session_key)
        Message.objects.create(
            conversation=existing, role="user", content="old question"
        )

        # Simulate the page loaded at /?new=1: client sends no conversation_id
        # plus new: true (the JS sends this when the page started fresh).
        response = self._post_chat(
            {"message": "first message of brand-new chat", "new": True}
        )
        self.assertEqual(response.status_code, 200)
        new_id = response.json()["conversation_id"]
        self.assertNotEqual(new_id, existing.pk)

        fresh = Conversation.objects.get(pk=new_id)
        self.assertEqual(
            list(fresh.messages.filter(role="user").values_list("content", flat=True)),
            ["first message of brand-new chat"],
        )
        self.assertEqual(fresh.messages.filter(role="user").count(), 1)

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_history_context_bypasses_cache(self, mock):
        session_key = self._client_session_key()
        conversation = Conversation.objects.create(session_key=session_key)

        self._post_chat({"message": "What is checkout time?", "conversation_id": conversation.pk})
        mock.reset_mock()

        second = self._post_chat({"message": "And for late checkout?", "conversation_id": conversation.pk})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(mock.call_count, 1)
        _args, _kwargs = mock.call_args
        self.assertEqual(len(mock.call_args.args[1]), 1)  # one prior turn reformulates

    def test_unknown_conversation_404(self):
        response = self._post_chat({"message": "hi", "conversation_id": 424242})
        self.assertEqual(response.status_code, 404)

    def test_rate_limit_for_anonymous_session(self):
        conversation = Conversation.objects.create(
            session_key=self._client_session_key()
        )

        # Pre-existing turns from outside the window: must not count.
        stale_pks = [
            Message.objects.create(conversation=conversation, role="user", content="old").pk
            for _ in range(views.RATE_LIMIT_PER_MINUTE)
        ]
        Message.objects.filter(pk__in=stale_pks).update(
            created_at=timezone.now() - timedelta(seconds=views.RATE_LIMIT_WINDOW_SECONDS + 1)
        )

        allowed = self._post_chat({"message": "in window", "conversation_id": conversation.pk})
        self.assertEqual(allowed.status_code, 200)

        # Fill the window to the quota; the next request is throttled.
        for _ in range(views.RATE_LIMIT_PER_MINUTE):
            Message.objects.create(conversation=conversation, role="user", content="spam")
        blocked = self._post_chat({"message": "blocked", "conversation_id": conversation.pk})
        self.assertEqual(blocked.status_code, 429)

    def test_malformed_conversation_id_is_rejected(self):
        # C4: every one of these used to reach int()/filter() and raise 500.
        for bad in ("abc", "-1", "0", "1.5", " "):
            with self.subTest(conversation_id=bad):
                self.assertEqual(
                    self._post_chat({"message": "hi", "conversation_id": bad}).status_code,
                    400,
                )
                self.assertEqual(
                    self.client.post(
                        reverse("api_chat_stream"),
                        data=json.dumps({"message": "hi", "conversation_id": bad}),
                        content_type="application/json",
                    ).status_code,
                    400,
                )
        self.assertEqual(Conversation.objects.count(), 0)

    @patch("chat.views.answer_question", return_value=(NO_DOCUMENTS_MESSAGE, []))
    def test_no_documents_answer_is_never_cached(self, _mock):
        # C7: caching the canned empty-corpus reply would keep serving it for
        # 30 minutes after the first document is trained.
        response = self._post_chat({"message": "What time is checkout?"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(cached_answer("What time is checkout?"))

    @patch("chat.views.answer_question", side_effect=RuntimeError("boom"))
    def test_chat_error_carries_conversation_id(self, _mock):
        # U14: without it the widget starts a fresh thread and strands the turn.
        response = self._post_chat({"message": "What time is checkout?"})
        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertIsNotNone(body["conversation_id"])
        conversation = Conversation.objects.get(pk=body["conversation_id"])
        self.assertEqual(
            list(conversation.messages.values_list("role", flat=True)), ["user"]
        )


class ChatIdentityTests(TestCase):
    """JWT identity on plain chat views, guest-thread claiming, logout lockout."""

    def setUp(self):
        _clear_cache()
        self.user = get_user_model().objects.create_user(
            username="jane", email="jane@example.com", first_name="Jane"
        )
        from auth import local

        self.token = local.issue_session(self.user).access_token

    def tearDown(self):
        _clear_cache()

    def _auth_headers(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.token}"}

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_jwt_authenticated_request_owns_new_conversation(self, _mock):
        response = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Hi", "new": True}),
            content_type="application/json",
            **self._auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        conversation = Conversation.objects.get(pk=response.json()["conversation_id"])
        self.assertEqual(conversation.user, self.user)
        self.assertEqual(conversation.title, "Jane")
        self.assertEqual(conversation.email, "jane@example.com")

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_guest_and_login_share_one_thread_via_claim(self, _mock):
        # Guest chats on this browser session...
        as_guest = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Guest hello", "new": True}),
            content_type="application/json",
        )
        guest_id = as_guest.json()["conversation_id"]
        self.assertIsNone(Conversation.objects.get(pk=guest_id).user)
        self.assertEqual(Conversation.objects.get(pk=guest_id).title, "Guest")

        # ...then the same person logs in and continues the same thread.
        after_login = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Signed-in follow-up", "conversation_id": guest_id}),
            content_type="application/json",
            **self._auth_headers(),
        )
        self.assertEqual(after_login.status_code, 200)
        self.assertEqual(after_login.json()["conversation_id"], guest_id)

        conversation = Conversation.objects.get(pk=guest_id)
        self.assertEqual(conversation.user, self.user)
        self.assertEqual(conversation.title, "Jane")
        self.assertEqual(conversation.email, "jane@example.com")
        self.assertEqual(conversation.session_key, "")

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_cannot_claim_another_sessions_guest_thread(self, _mock):
        other = Conversation.objects.create(session_key="someone-elses-session")
        response = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "hi", "conversation_id": other.pk}),
            content_type="application/json",
            **self._auth_headers(),
        )
        self.assertEqual(response.status_code, 404)
        other.refresh_from_db()
        self.assertIsNone(other.user)

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_guest_thread_hidden_from_anonymous_after_logout(self, _mock):
        # Guest thread claimed by the account...
        as_guest = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Guest hello", "new": True}),
            content_type="application/json",
        )
        guest_id = as_guest.json()["conversation_id"]
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "follow-up", "conversation_id": guest_id}),
            content_type="application/json",
            **self._auth_headers(),
        )

        # ...then the user logs out: the same browser cannot reach it anymore.
        logged_out = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "who am I", "conversation_id": guest_id}),
            content_type="application/json",
        )
        self.assertEqual(logged_out.status_code, 404)

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_login_creates_fresh_conversation_when_no_thread_referenced(self, _mock):
        # A logged-in user with no referenced guest thread starts fresh, and the
        # message goes to the user-owned conversation (not the anonymous one).
        as_guest = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Guest hello", "new": True}),
            content_type="application/json",
        )
        guest_id = as_guest.json()["conversation_id"]

        response = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "new signed-in chat", "new": True}),
            content_type="application/json",
            **self._auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        fresh_id = response.json()["conversation_id"]
        self.assertNotEqual(fresh_id, guest_id)
        self.assertEqual(Conversation.objects.get(pk=fresh_id).user, self.user)


class ChatHistoryEventsTests(TestCase):
    """GET /api/chat/history + /api/chat/events ownership and payload shape."""

    def setUp(self):
        _clear_cache()
        self.user = get_user_model().objects.create_user(
            username="jay", email="jay@example.com", first_name="Jay"
        )
        from auth import local

        self.token = local.issue_session(self.user).access_token

    def tearDown(self):
        _clear_cache()

    def _auth_headers(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.token}"}

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_history_returns_generated_thread(self, _mock):
        created = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "First question", "new": True}),
            content_type="application/json",
        )
        conversation_id = created.json()["conversation_id"]

        history = self.client.get(
            reverse("api_chat_history"),
            {"conversation_id": conversation_id},
        )
        self.assertEqual(history.status_code, 200, history.content)
        body = history.json()
        self.assertEqual(body["conversation_id"], conversation_id)
        self.assertEqual([m["role"] for m in body["messages"]], ["user", "assistant"])
        self.assertEqual(body["messages"][0]["content"], "First question")

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_history_visible_to_claiming_account(self, _mock):
        created = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Guest hello", "new": True}),
            content_type="application/json",
        )
        conversation_id = created.json()["conversation_id"]
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "follow-up", "conversation_id": conversation_id}),
            content_type="application/json",
            **self._auth_headers(),
        )

        history = self.client.get(
            reverse("api_chat_history"),
            {"conversation_id": conversation_id},
            **self._auth_headers(),
        )
        self.assertEqual(history.status_code, 200, history.content)
        self.assertEqual(history.json()["conversation_id"], conversation_id)

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_history_hidden_from_anonymous_after_logout(self, _mock):
        created = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "Guest hello", "new": True}),
            content_type="application/json",
        )
        conversation_id = created.json()["conversation_id"]
        self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "follow-up", "conversation_id": conversation_id}),
            content_type="application/json",
            **self._auth_headers(),
        )

        logged_out = self.client.get(
            reverse("api_chat_history"),
            {"conversation_id": conversation_id},
        )
        self.assertEqual(logged_out.status_code, 404)

    def test_history_refuses_another_sessions_thread(self):
        owner = Client()
        created = owner.post(
            reverse("api_chat"),
            data=json.dumps({"message": "private", "new": True}),
            content_type="application/json",
        )
        conversation_id = created.json()["conversation_id"]

        stranger_session = self.client.get(
            reverse("api_chat_history"),
            {"conversation_id": conversation_id},
        )
        self.assertEqual(stranger_session.status_code, 404)

    def test_history_rejects_bad_ids(self):
        self.assertEqual(
            self.client.get(reverse("api_chat_history"), {"conversation_id": "abc"}).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(reverse("api_chat_history"), {"conversation_id": "0"}).status_code,
            400,
        )

    @patch("chat.views.answer_question", return_value=("A", []))
    def test_events_streams_existing_messages(self, _mock):
        created = self.client.post(
            reverse("api_chat"),
            data=json.dumps({"message": "One for the stream", "new": True}),
            content_type="application/json",
        )
        conversation_id = created.json()["conversation_id"]

        events = self.client.get(
            reverse("api_chat_events"),
            {"conversation_id": conversation_id, "since_id": 0},
        )
        self.assertEqual(events.status_code, 200)
        self.assertIn("text/event-stream", events["Content-Type"])

        first_frame = next(iter(events.streaming_content))
        self.assertIn(b"One for the stream", first_frame)
        self.assertIn(b'"type": "message"', first_frame)

    def test_events_refuses_unknown_or_malformed(self):
        self.assertEqual(
            self.client.get(
                reverse("api_chat_events"), {"conversation_id": "999999"}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(reverse("api_chat_events"), {"conversation_id": "x"}).status_code,
            400,
        )


class ChatStreamTests(TestCase):
    def setUp(self):
        _clear_cache()

    def tearDown(self):
        _clear_cache()

    def test_stream_yields_tokens_then_done(self):
        def fake_retrieve(_q, _h):
            doc = Document(page_content="content", metadata={"source": "guide.txt", "chunk_pk": 1})
            return "reformulated?", [doc]

        def fake_stream(_q, _c):
            yield "Check"
            yield "out"
            yield " at 11."

        fake_chunk = MagicMock()
        fake_chunk.objects.exists.return_value = True

        with patch("document_ingestion.models.Chunk", fake_chunk), patch(
            "chat.views.retrieve", side_effect=fake_retrieve
        ), patch("chat.views.stream_answer_text", side_effect=fake_stream):
            response = self.client.post(
                reverse("api_chat_stream"),
                data=json.dumps({"message": "When is checkout?"}),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 200)
            events = _sse_events(response)
            self.assertEqual([e["type"] for e in events[:-1]], ["token"] * 3)
            done = events[-1]
            self.assertEqual(done["type"], "done")
            self.assertEqual(done["answer"], "Checkout at 11.")

        self.assertEqual(
            list(Message.objects.filter(role="assistant").values_list("content", flat=True)),
            ["Checkout at 11."],
        )

    def test_stream_no_documents_message(self):
        # Empty test DB -> no chunks -> the friendlier message, not a crash.
        response = self.client.post(
            reverse("api_chat_stream"),
            data=json.dumps({"message": "What time is checkout?"}),
            content_type="application/json",
        )
        events = _sse_events(response)
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[-1]["answer"], NO_DOCUMENTS_MESSAGE)

    def test_stream_greeting_uses_router_not_pipeline(self):
        with patch("chat.views.retrieve", side_effect=AssertionError("unused")):
            response = self.client.post(
                reverse("api_chat_stream"),
                data=json.dumps({"message": "hi"}),
                content_type="application/json",
            )
        events = _sse_events(response)
        self.assertEqual(events[-1]["type"], "done")
        self.assertTrue(events[-1]["answer"].startswith("Hi!"))
        self.assertEqual(events[-1]["citations"], [])
        self.assertEqual(
            list(Message.objects.filter(role="assistant").values_list("content", flat=True)),
            [events[-1]["answer"]],
        )

    def test_stream_booking_intent_short_circuits(self):
        response = self.client.post(
            reverse("api_chat_stream"),
            data=json.dumps({"message": "I want to book a night at Sunrise Lodge"}),
            content_type="application/json",
        )
        events = _sse_events(response)
        self.assertEqual(events[-1]["type"], "done")
        self.assertTrue(events[-1]["answer"].startswith("Of course"))

    @staticmethod
    def _rag_context():
        def fake_retrieve(_q, _h):
            doc = Document(
                page_content="content",
                metadata={"source": "guide.txt", "chunk_pk": 1},
            )
            return "reformulated?", [doc]

        fake_chunk = MagicMock()
        fake_chunk.objects.exists.return_value = True
        return fake_chunk, fake_retrieve

    def test_stream_tokens_join_to_done_answer(self):
        # C25: tokens must use the §5 `text` key and their concatenation must
        # equal the `done` payload (and the stored answer).
        def fake_stream(_q, _c):
            yield "Check"
            yield "out"
            yield " at 11."

        fake_chunk, fake_retrieve = self._rag_context()

        with patch("document_ingestion.models.Chunk", fake_chunk), patch(
            "chat.views.retrieve", side_effect=fake_retrieve
        ), patch("chat.views.stream_answer_text", side_effect=fake_stream):
            response = self.client.post(
                reverse("api_chat_stream"),
                data=json.dumps({"message": "When is checkout?"}),
                content_type="application/json",
            )
            events = _sse_events(response)

        tokens = [e for e in events if e["type"] == "token"]
        done = [e for e in events if e["type"] == "done"]
        self.assertEqual(len(done), 1)
        self.assertEqual(
            [t["text"] for t in tokens], ["Check", "out", " at 11."]
        )
        self.assertEqual(done[0]["answer"], "".join(t["text"] for t in tokens))
        self.assertEqual(
            list(
                Message.objects.filter(role="assistant").values_list(
                    "content", flat=True
                )
            ),
            [done[0]["answer"]],
        )

    def test_stream_emits_terminal_error_when_generation_fails(self):
        # C8: a mid-stream failure must end the event stream with a terminal
        # `error`, not leave the widget waiting forever.
        def fake_retrieve(_q, _h):
            doc = Document(
                page_content="content",
                metadata={"source": "guide.txt", "chunk_pk": 1},
            )
            return "reformulated?", [doc]

        def broken_stream(_q, _c):
            yield "partial"
            raise RuntimeError("provider exploded")

        fake_chunk = MagicMock()
        fake_chunk.objects.exists.return_value = True

        with patch("document_ingestion.models.Chunk", fake_chunk), patch(
            "chat.views.retrieve", side_effect=fake_retrieve
        ), patch("chat.views.stream_answer_text", side_effect=broken_stream):
            response = self.client.post(
                reverse("api_chat_stream"),
                data=json.dumps({"message": "When is checkout?"}),
                content_type="application/json",
            )
            events = _sse_events(response)

        self.assertEqual(events[-1]["type"], "error")
        self.assertIn("Something went wrong", events[-1]["message"])
        self.assertNotIn("provider exploded", json.dumps(events))
        # The user turn is kept; no assistant turn is invented for a failed stream.
        self.assertEqual(
            list(Message.objects.values_list("role", flat=True)), ["user"]
        )


class TurnHistoryTests(TestCase):
    def test_history_pairs_questions_with_answers(self):
        conversation = Conversation.objects.create(session_key="t")
        Message.objects.create(conversation=conversation, role="user", content="first")
        Message.objects.create(conversation=conversation, role="assistant", content="reply one")
        Message.objects.create(conversation=conversation, role="user", content="second (no answer yet)")
        Message.objects.create(conversation=conversation, role="user", content="third")
        Message.objects.create(conversation=conversation, role="assistant", content="reply three")

        history = views._turn_history(conversation)
        self.assertEqual(
            [t["question"] for t in history], ["first", "third"]
        )


class AdminRegistrationTests(TestCase):
    """Chat models registered in the Django admin.

    Conversation browsing stays read/write for staff; Message is an
    append-only transcript whose creation belongs to the inbox endpoints.
    """

    def setUp(self):
        from django.contrib.auth.models import User

        self.staff = User.objects.create_user(
            username="staffer", password="x", is_staff=True, is_superuser=True
        )
        self.customer = User.objects.create_user(
            username="customer", password="x", email="customer@example.com"
        )
        self.conversation = Conversation.objects.create(
            user=self.customer,
            title="Booking enquiry",
            channel="Website",
            email="customer@example.com",
            note="wants a mountain view",
        )
        self.message = Message.objects.create(
            conversation=self.conversation,
            role="assistant",
            content="Here are our rates.",
            citations=[{"source": "faq.pdf", "page": 4}, {"source": "rates.pdf"}],
        )
        self.client.force_login(self.staff)

    def test_both_models_registered(self):
        from django.contrib import admin

        self.assertIn(Conversation, admin.site._registry)
        self.assertIn(Message, admin.site._registry)

    def test_admin_index_lists_chat(self):
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 200)
        apps = [a for a in response.context["available_apps"] if a["name"] == "Chat"]
        self.assertTrue(apps, "Chat missing from the admin index")

    def test_conversation_changelist_renders(self):
        response = self.client.get(reverse("admin:chat_conversation_changelist"))
        self.assertEqual(response.status_code, 200)
        rows = list(response.context["cl"].result_list)
        self.assertEqual([c.pk for c in rows], [self.conversation.pk])

    def test_conversation_changelist_annotates_message_count_and_preview(self):
        response = self.client.get(reverse("admin:chat_conversation_changelist"))
        row = response.context["cl"].result_list[0]
        self.assertEqual(row.message_count, 1)
        self.assertEqual(row.last_message, "Here are our rates.")

    def test_conversation_changelist_search_by_title(self):
        response = self.client.get(
            reverse("admin:chat_conversation_changelist"), {"q": "Booking enquiry"}
        )
        pks = [c.pk for c in response.context["cl"].result_list]
        self.assertEqual(pks, [self.conversation.pk])

    def test_conversation_changelist_search_by_customer_email(self):
        response = self.client.get(
            reverse("admin:chat_conversation_changelist"), {"q": "customer@exa"}
        )
        pks = [c.pk for c in response.context["cl"].result_list]
        self.assertEqual(pks, [self.conversation.pk])

    def test_conversation_change_page_shows_readonly_transcript_inline(self):
        url = reverse("admin:chat_conversation_change", args=[self.conversation.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        formset = response.context["inline_admin_formsets"][0]
        self.assertEqual(formset.opts.model, Message)
        # The transcript is displayed, with its citations rendered readably.
        self.assertContains(response, "Here are our rates.")
        self.assertContains(response, "faq.pdf p4, rates.pdf")
        # Read-only inline: no add row, no delete control, no editable fields.
        self.assertContains(response, 'name="messages-MAX_NUM_FORMS" value="0"')
        self.assertNotContains(response, "messages-0-DELETE")
        self.assertNotContains(response, 'name="messages-0-content"')
        self.assertNotContains(response, 'name="messages-0-role"')

    def test_posting_conversation_cannot_mutate_messages(self):
        url = reverse("admin:chat_conversation_change", args=[self.conversation.pk])
        response = self.client.post(
            url,
            {
                "title": "Booking enquiry (edited)",
                "channel": "Website",
                "user": str(self.customer.pk),
                "email": "customer@example.com",
                "phone": "",
                "note": "wants a mountain view",
                "messages-TOTAL_FORMS": "1",
                "messages-INITIAL_FORMS": "1",
                "messages-MIN_NUM_FORMS": "0",
                "messages-MAX_NUM_FORMS": "1000",
                "_save": "Save",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.title, "Booking enquiry (edited)")
        # The transcript is untouched by the admin edit.
        self.assertEqual(self.conversation.messages.count(), 1)
        self.message.refresh_from_db()
        self.assertEqual(self.message.content, "Here are our rates.")

    def test_message_changelist_renders(self):
        response = self.client.get(reverse("admin:chat_message_changelist"))
        self.assertEqual(response.status_code, 200)
        pks = [m.pk for m in response.context["cl"].result_list]
        self.assertEqual(pks, [self.message.pk])

    def test_message_changelist_has_no_add_link(self):
        response = self.client.get(reverse("admin:chat_message_changelist"))
        self.assertNotContains(
            response, reverse("admin:chat_message_add"), status_code=200
        )

    def test_message_add_view_is_refused(self):
        response = self.client.get(reverse("admin:chat_message_add"))
        self.assertEqual(response.status_code, 403)

    def test_message_change_view_is_readonly(self):
        response = self.client.get(
            reverse("admin:chat_message_change", args=[self.message.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'name="content"', status_code=200)

    def test_delete_selected_does_not_remove_messages(self):
        response = self.client.post(
            reverse("admin:chat_message_changelist"),
            {
                "action": "delete_selected",
                "_selected_action": [str(self.message.pk)],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Message.objects.filter(pk=self.message.pk).exists())

    def test_non_staff_cannot_reach_chat_admin(self):
        from django.contrib.auth.models import User

        plain = User.objects.create_user(username="plain", password="x")
        self.client.force_login(plain)
        response = self.client.get(reverse("admin:chat_conversation_changelist"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])

    def test_anonymous_cannot_reach_chat_admin(self):
        self.client.logout()
        response = self.client.get(reverse("admin:chat_conversation_changelist"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response["Location"])


class AdminHelperTests(SimpleTestCase):
    """Display helpers used by the chat admin."""

    def test_contact_prefers_user_full_name(self):
        from django.contrib.auth.models import User
        from chat.admin import _contact

        user = User(
            username="jane",
            first_name="Jane",
            last_name="Doe",
            email="jane@example.com",
        )
        self.assertEqual(
            _contact(Conversation(user=user, title="t", email="", phone="")),
            "Jane Doe <jane@example.com>",
        )

    def test_contact_falls_back_to_username(self):
        from django.contrib.auth.models import User
        from chat.admin import _contact

        user = User(username="jane", first_name="", last_name="", email="")
        self.assertEqual(
            _contact(Conversation(user=user, title="t", email="", phone="")),
            "jane",
        )

    def test_contact_falls_back_to_title_then_anonymous(self):
        from chat.admin import _contact

        self.assertEqual(
            _contact(Conversation(user=None, title="Booking", email="", phone="")),
            "Booking",
        )
        self.assertEqual(
            _contact(Conversation(user=None, title="New chat", email="", phone="")),
            "Anonymous",
        )

    def test_contact_prefers_explicit_email_over_user_email(self):
        from django.contrib.auth.models import User
        from chat.admin import _contact

        user = User(username="jane", first_name="", last_name="", email="old@x.com")
        self.assertEqual(
            _contact(Conversation(user=user, title="t", email="new@x.com", phone="")),
            "jane <new@x.com>",
        )

    def test_citation_summary_formats_sources(self):
        from django.contrib import admin

        from chat.admin import MessageInline

        message = Message(
            citations=[
                {"source": "faq.pdf", "page": 4},
                {"source": "rates.pdf"},
                {"source": "a.pdf"},
                {"source": "b.pdf"},
            ]
        )
        inline = MessageInline(Message, admin.site)
        self.assertEqual(
            inline.citation_summary(message),
            "faq.pdf p4, rates.pdf, a.pdf (+1 more)",
        )

    def test_citation_summary_handles_empty_and_malformed(self):
        from django.contrib import admin

        from chat.admin import MessageInline

        inline = MessageInline(Message, admin.site)
        self.assertEqual(inline.citation_summary(Message(citations=[])), "—")
        self.assertEqual(inline.citation_summary(Message(citations=["nope"])), "—")
        self.assertEqual(inline.citation_summary(Message(citations=None)), "—")

    def test_last_message_preview_flattens_newlines(self):
        from django.contrib import admin

        conversation_admin = admin.site._registry[Conversation]
        stub = type("S", (), {"last_message": "line one\nline two"})()
        self.assertEqual(conversation_admin.last_message(stub), "line one line two")

    def test_last_message_preview_empty(self):
        from django.contrib import admin

        conversation_admin = admin.site._registry[Conversation]
        stub = type("S", (), {"last_message": None})()
        self.assertEqual(conversation_admin.last_message(stub), "—")


# --- Moved from admin_api/tests.py (D10). Auth assertions are repaired in Phase T (C1). ---


def make_message(role="assistant", content="hi"):
    return Message(
        id=7,
        role=role,
        content=content,
        citations=[{"title": "House Rules"}],
        created_at=datetime.datetime(2026, 1, 2, 3, 4, tzinfo=datetime.timezone.utc),
    )


class InboxSerializerShape(SimpleTestCase):
    """Pinned to the exact keys types/index.ts declares."""

    def test_entry_uses_from_body_sent_at(self):
        data = InboxEntrySerializer(make_message()).data
        self.assertEqual(set(data), {"id", "from", "body", "sentAt", "citations"})
        self.assertEqual(data["id"], 7)
        self.assertEqual(data["body"], "hi")
        self.assertEqual(data["citations"], [{"title": "House Rules"}])

    def test_entry_from_reflects_who_wrote_it(self):
        for role, expected in [
            ("user", "guest"),
            ("assistant", "bot"),
        ]:
            with self.subTest(role=role):
                data = InboxEntrySerializer(make_message(role)).data
                self.assertEqual(data["from"], expected)


class AdminInboxViews(TestCase):
    def setUp(self):
        from auth import local

        self.staff = get_user_model().objects.create_user(
            username="staff@example.com", email="staff@example.com", password="x" * 10,
            is_staff=True,
        )
        self.guest = get_user_model().objects.create_user(
            username="guest@example.com", email="guest@example.com", password="x" * 10,
            is_staff=False,
        )
        # The /api/admin/inbox* views are DRF with JWT-only auth (no
        # SessionAuthentication), so a session from force_login is ignored.
        self.staff_token = local.issue_session(self.staff).access_token

    def _staff(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.staff_token}"}

    def test_reply_persists(self):
        conversation = Conversation.objects.create(title="Riya", channel="WhatsApp")

        reply = self.client.post(
            f"/api/admin/inbox/{conversation.id}/replies",
            {"content": "We'll call you"},
            **self._staff(),
        )
        self.assertEqual(reply.status_code, 201, reply.content)

        body = reply.json()
        self.assertEqual(body["entries"][0]["from"], "bot")
        self.assertEqual(body["entries"][0]["body"], "We'll call you")

        conversation.refresh_from_db()
        self.assertEqual(conversation.messages.get().content, "We'll call you")

    def test_reply_rises_thread_to_top_of_inbox(self):
        # C9: the inbox list is ordered on Conversation.updated_at, which only
        # moves when the row itself is saved — creating the reply message does
        # not touch it, so a replied thread never rose to the top.
        older = Conversation.objects.create(title="Riya")
        newer = Conversation.objects.create(title="Priya")
        Message.objects.create(conversation=older, role="user", content="q")
        Message.objects.create(conversation=newer, role="user", content="q")
        Conversation.objects.filter(pk=older.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )

        reply = self.client.post(
            f"/api/admin/inbox/{older.id}/replies",
            {"content": "We'll call you"},
            **self._staff(),
        )
        self.assertEqual(reply.status_code, 201, reply.content)

        listed = self.client.get("/api/admin/inbox", **self._staff())
        self.assertEqual(
            [row["id"] for row in listed.json()], [str(older.pk), str(newer.pk)]
        )

    def test_admin_events_refreshes_when_new_message_arrives(self):
        self.client.force_login(self.staff)
        conversation = Conversation.objects.create(title="Riya")
        Message.objects.create(conversation=conversation, role="user", content="before")

        # Pause the poll loop's sleep just long enough to post a new message
        # mid-stream, so the next tick observes the change (deterministic).
        posted = []

        def sleepy(_secs):
            if not posted:
                posted.append(True)
                Message.objects.create(
                    conversation=conversation, role="user", content="after"
                )

        with patch("time.sleep", side_effect=sleepy):
            response = self.client.get("/api/admin/inbox/events")
            self.assertEqual(response.status_code, 200)
            events = _sse_events(response)

        self.assertEqual(events[0]["type"], "refresh")
        self.assertEqual(events[0]["since"], Message.objects.latest("pk").created_at.isoformat())
        self.assertEqual(events[-1]["type"], "done")

    def test_admin_events_forbidden_for_non_staff(self):
        self.client.force_login(self.guest)
        response = self.client.get("/api/admin/inbox/events")
        self.assertEqual(response.status_code, 403)

    def test_admin_events_anonymous_forbidden(self):
        response = self.client.get("/api/admin/inbox/events")
        self.assertEqual(response.status_code, 403)

    def test_inbox_search_and_channel_filter(self):
        Conversation.objects.create(title="Website guest", channel="Website")
        Conversation.objects.create(title="WhatsApp guest", channel="WhatsApp")

        by_channel = self.client.get(
            "/api/admin/inbox", {"channel": "WhatsApp"}, **self._staff()
        ).json()
        self.assertEqual([row["title"] for row in by_channel], ["WhatsApp guest"])

        by_query = self.client.get(
            "/api/admin/inbox", {"q": "Website"}, **self._staff()
        ).json()
        self.assertEqual([row["title"] for row in by_query], ["Website guest"])

    def test_list_rows_carry_snippet_without_extra_queries(self):
        conversation = Conversation.objects.create(title="Riya")
        Message.objects.create(conversation=conversation, role="user", content="Hello there")
        Message.objects.create(conversation=conversation, role="assistant", content="Hi")
        # A second row: an N+1 would add a query per conversation and break
        # the count below.
        other = Conversation.objects.create(title="Sam")
        Message.objects.create(conversation=other, role="user", content="Other thread")

        # 3 = JWT middleware resolves the staff user (1) + DRF re-authenticates
        # (2) + one list query whose select_related/subquery annotations avoid
        # an N+1 (C15).
        with self.assertNumQueries(3):
            rows = self.client.get("/api/admin/inbox", **self._staff()).json()

        self.assertEqual(len(rows), 2)
        by_title = {row["title"]: row for row in rows}
        self.assertEqual(set(by_title), {"Riya", "Sam"})
        self.assertEqual(by_title["Riya"]["snippet"], "Hi")
        self.assertEqual(by_title["Riya"]["contact_name"], "Riya")
        self.assertIsNotNone(by_title["Riya"]["last_message_at"])

    def test_email_falls_back_to_account_email(self):
        user = get_user_model().objects.create_user(username="jane", email="jane@example.com")
        conversation = Conversation.objects.create(user=user, title="Jane Doe")
        conversation.last_message_content = ""

        data = InboxMessageSerializer(conversation).data
        self.assertEqual(data["email"], "jane@example.com")

        blank = Conversation.objects.create(title="Guest")
        blank.last_message_content = ""
        self.assertEqual(InboxMessageSerializer(blank).data["email"], "")


class ConcurrentRateLimitTests(TransactionTestCase):
    """S6: the per-identity cap must survive a parallel burst on one thread.

    The count and the insert share one transaction holding a row lock on the
    conversation; without it both requests read quota-1 and both slip through.
    """

    def test_parallel_requests_share_the_last_slot(self):
        from auth import local

        user = get_user_model().objects.create_user(
            username="burst", email="burst@example.com"
        )
        conversation = Conversation.objects.create(user=user, title="Burst")
        for _ in range(views.RATE_LIMIT_PER_MINUTE - 1):
            Message.objects.create(
                conversation=conversation, role="user", content="old"
            )

        token = local.issue_session(user).access_token
        barrier = threading.Barrier(2)
        results = []

        def send():
            try:
                client = Client()
                barrier.wait(timeout=10)
                response = client.post(
                    reverse("api_chat"),
                    data=json.dumps(
                        {"message": "hi", "conversation_id": conversation.pk}
                    ),
                    content_type="application/json",
                    HTTP_AUTHORIZATION=f"Bearer {token}",
                )
                results.append(response.status_code)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=send) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        self.assertEqual(sorted(results), [200, 429], results)
