"""Tests for the chat API: RAG helpers, cache, streaming, rate limits.

Run:  .venv/bin/python manage.py test chat
"""

import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone

from langchain_core.documents import Document

from .models import Conversation, Message
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
from . import services, views


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
            data=json.dumps({"message": "hi?"}),
            content_type="application/json",
        )
        events = _sse_events(response)
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[-1]["answer"], NO_DOCUMENTS_MESSAGE)


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


class StaffInboxTests(TestCase):
    """Staff inbox endpoints: reply, update, create, filtered list."""

    def setUp(self):
        from django.contrib.auth.models import User

        self.staff = User.objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.customer = User.objects.create_user(
            username="customer", password="x", email="customer@example.com"
        )
        self.conversation = Conversation.objects.create(
            user=self.customer,
            title="Booking enquiry",
            channel="Website",
            email="customer@example.com",
            phone="9812345678",
            note="wants a mountain view",
        )
        Message.objects.create(
            conversation=self.conversation, role="user", content="Hi"
        )
        self.client.force_login(self.staff)

    def test_reply_persists_human_message(self):
        response = self.client.post(
            reverse("docadmin_chat_reply", args=[self.conversation.pk]),
            data=json.dumps({"content": "Hi, I will check that for you."}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])

        message = Message.objects.get(
            conversation=self.conversation, content="Hi, I will check that for you."
        )
        self.assertEqual(message.role, "assistant")
        self.assertTrue(message.is_human)
        self.assertEqual(
            Message.objects.filter(
                conversation=self.conversation, role="assistant", is_human=True
            ).count(),
            1,
        )

    def test_reply_requires_staff(self):
        self.client.force_login(self.customer)
        response = self.client.post(
            reverse("docadmin_chat_reply", args=[self.conversation.pk]),
            data=json.dumps({"content": "hi"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)  # redirected to login

    def test_reply_validates_empty_content(self):
        response = self.client.post(
            reverse("docadmin_chat_reply", args=[self.conversation.pk]),
            data=json.dumps({"content": "   "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Message.objects.filter(is_human=True).count(), 0)

    def test_update_partial_fields_and_toggle(self):
        response = self.client.post(
            reverse("docadmin_chat_update", args=[self.conversation.pk]),
            data=json.dumps(
                {"channel": "WhatsApp", "note": "subject updated", "is_human": True}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["contact"]["channel"], "WhatsApp")
        self.assertEqual(data["contact"]["note"], "subject updated")
        self.assertTrue(data["contact"]["is_human"])

        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.channel, "WhatsApp")
        self.assertTrue(self.conversation.is_human)

    def test_update_invalid_channel_rejected(self):
        response = self.client.post(
            reverse("docadmin_chat_update", args=[self.conversation.pk]),
            data=json.dumps({"channel": "Telegram"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_conversation_with_channel_and_contact(self):
        response = self.client.post(
            reverse("docadmin_chat_create"),
            data=json.dumps(
                {
                    "name": "Riya Kapoor",
                    "channel": "Instagram",
                    "email": "riya@example.com",
                    "phone": "9822334455",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])

        created = Conversation.objects.get(pk=data["conversation_id"])
        self.assertEqual(created.title, "Riya Kapoor")
        self.assertEqual(created.channel, "Instagram")
        self.assertEqual(created.email, "riya@example.com")
        self.assertEqual(created.phone, "9822334455")
        self.assertFalse(created.is_human)

    def test_list_filters_by_channel(self):
        other = Conversation.objects.create(
            session_key="anon", title="Other", channel="Facebook"
        )
        response = self.client.get(
            reverse("docadmin_chats"), {"channel": "Facebook"}
        )
        self.assertEqual(response.status_code, 200)
        pks = [c.pk for c in response.context["conversations"]]
        self.assertIn(other.pk, pks)
        self.assertNotIn(self.conversation.pk, pks)

    def test_list_searches_by_phone(self):
        response = self.client.get(reverse("docadmin_chats"), {"q": "981234"})
        self.assertEqual(response.status_code, 200)
        pks = [c.pk for c in response.context["conversations"]]
        self.assertIn(self.conversation.pk, pks)

    def test_list_searches_by_customer_email(self):
        response = self.client.get(reverse("docadmin_chats"), {"q": "customer@exa"})
        self.assertEqual(response.status_code, 200)
        pks = [c.pk for c in response.context["conversations"]]
        self.assertIn(self.conversation.pk, pks)

    def test_list_partial_returns_list_template(self):
        response = self.client.get(reverse("docadmin_chats"), {"partial": "1"})
        self.assertEqual(response.status_code, 200)
        render_templates = [t.name for t in response.templates]
        self.assertIn("documents/docadmin_chats_list.html", render_templates)