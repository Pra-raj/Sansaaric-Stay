"""Retrieval & answer pipeline.

reformulate (only with history) -> embed -> hybrid (vector + FTS) -> RRF ->
Cohere rerank -> Groq answer with numbered sources -> (answer, citations).
"""

import os
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from django.db.models import F
from django.contrib.postgres.search import SearchQuery, SearchRank
from langchain_cohere import CohereRerank
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pgvector.django import CosineDistance

from document_ingestion.ingestion.embedding import embed_texts

K = 10                     # candidates per retrieval path
RRF_K = 60                 # fusion constant
TOP_N = 5                  # documents that reach the answer
RERANK_MIN_SCORE = 0.2     # rerank relevance floor (soft: top doc kept if all fail)
MAX_FRAGMENT = 1500        # chars of each source sent to the LLM
CITATION_TEXT = 300        # chars shown in a citation chip
HISTORY_TURNS = 5          # conversation turns used for reformulation
MAX_TOKENS_ANSWER = 700    # cap generation so a verbose model can't stall
MAX_TOKENS_REFORMULATE = 80

GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# Groq's API sits behind a WAF that blocks the default Python User-Agent.
GROQ_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

DEFAULT_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
]

REFORMULATION_PROMPT = """Given a chat history and a follow-up question, rephrase the \
follow-up question into a standalone search query that can be understood without the \
chat history. Resolve pronouns and vague references ("it", "he", "that") using the \
conversation. Do NOT answer the question. Return ONLY the rephrased question, with no \
extra text.

Chat history:
{history}

Follow-up question: {question}

Standalone question:"""

ANSWER_PROMPT = """You are a helpful assistant answering questions.
Use ONLY the context provided below. If the context does not contain enough
information, say exactly: "I don't have enough information to answer that question
based on the provided documents."

Answer directly in plain text: no markdown or formatting symbols (no asterisks,
no bullets, no numbered lists, no headings, no hashtags). Never begin your answer
with phrases like "Based on the provided documents", "According to the documents",
or "The document states". Just answer the question.

Question: {question}

CONTEXT:
{context}

Answer:"""

TRANSIENT_HINTS = (
    "429", "502", "503", "rate limit", "resource_exhausted",
    "provider_unavailable", "upstream error", "timeout",
)

NO_DOCUMENTS_MESSAGE = (
    "No documents have been trained yet. Please upload and train documents "
    "in the admin dashboard first."
)

NO_INFO_PREFIX = (
    "I don't have enough information to answer that question based on the "
    "provided documents."
)
GEN_ERROR = "Sorry, I encountered an error while generating the answer."
GEN_UNAVAILABLE = "I couldn't generate an answer right now. Please try again."


def is_no_answer(answer):
    """True when an answer indicates the model could not answer from context."""
    if not answer:
        return True
    if answer in (GEN_ERROR, GEN_UNAVAILABLE):
        return True
    return NO_INFO_PREFIX in answer or answer.startswith(NO_INFO_PREFIX[:40])


def extract_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return str(content)


def is_transient_error(error):
    message = str(error).lower()
    return any(hint in message for hint in TRANSIENT_HINTS)


class ModelPool:
    """Groq model pool: probe models once, rotate on transient failures."""

    def __init__(self, models, api_key):
        self.models = models
        self.instances = []
        errors = []
        self.scale = []

        def probe(model):
            try:
                llm = ChatOpenAI(
                    model=model,
                    api_key=api_key,
                    base_url=GROQ_BASE_URL,
                    default_headers={"User-Agent": GROQ_USER_AGENT},
                    temperature=0,
                    max_retries=0,
                    timeout=120,
                )
                llm.invoke([HumanMessage(content="Reply with exactly: OK")])
                return llm
            except Exception as exc:
                return (model, exc)

        with ThreadPoolExecutor(max_workers=min(len(models), 6)) as executor:
            results = list(executor.map(probe, models))

        for result in results:
            if isinstance(result, tuple):
                model, err = result
                errors.append(f"{model}: {str(err)[:200]}")
            else:
                self.instances.append(result)

        if not self.instances:
            raise RuntimeError(
                "No available Groq model:\n" + "\n".join(errors)
            )

        self.idx = 0
        self._lock = threading.Lock()

    @property
    def current(self):
        return self.instances[self.idx]

    def _rotate(self):
        if len(self.instances) == 1:
            return False
        with self._lock:
            self.idx = (self.idx + 1) % len(self.instances)
        return True

    def _retry_or_rotate(self, attempts, error):
        if attempts >= 2:
            if not self._rotate():
                return False
        else:
            time.sleep(min(attempts, 3))
        return True

    def _invoke(self, fn):
        attempts = 0
        while True:
            try:
                return fn()
            except Exception as exc:
                if not is_transient_error(exc):
                    raise
                attempts += 1
                if not self._retry_or_rotate(attempts, exc):
                    raise

    def invoke_text(self, messages, max_tokens=None):
        attempts = 0
        while True:
            try:
                response = self._invoke(
                    lambda: self.current.invoke(messages, max_tokens=max_tokens)
                )
            except Exception:
                raise
            text = extract_text(response.content).strip()
            if text:
                return text
            attempts += 1
            if attempts >= 2 and not self._rotate():
                return None

    def invoke(self, messages, max_tokens=None):
        return self._invoke(
            lambda: self.current.invoke(messages, max_tokens=max_tokens)
        )

    def stream(self, messages, max_tokens=None):
        """Yield answer tokens. Falls back to a buffered completion on error."""
        try:
            stream = self._invoke(
                lambda: self.current.stream(messages, max_tokens=max_tokens)
            )
            for chunk in stream:
                text = extract_text(getattr(chunk, "content", ""))
                if text:
                    yield text
            return
        except Exception:
            text = self.invoke_text(messages, max_tokens=max_tokens)
            if text:
                yield text


_pool_lock = threading.Lock()
_pool = None
_reranker = None


def get_model_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                api_key = os.getenv("GROQ_API_KEY")
                if not api_key:
                    raise ValueError(
                        "GROQ_API_KEY not set in environment / .env"
                    )
                _pool = ModelPool(DEFAULT_MODELS, api_key)
    return _pool


def get_reranker():
    """Lazy Cohere reranker; None (skip rerank) if no API key configured."""
    global _reranker
    if _reranker is None:
        with _pool_lock:
            if _reranker is None:
                if not os.getenv("COHERE_API_KEY"):
                    _reranker = False
                else:
                    _reranker = CohereRerank(model="rerank-english-v3.0", top_n=TOP_N)
    return _reranker or None


def reformulate(question, history):
    question = (question or "").strip()
    if not question:
        return question
    if not history:
        return question

    history_text = "\n".join(
        f"User: {turn['question']}\nAssistant: {str(turn['answer'])[:500]}"
        for turn in history[-HISTORY_TURNS:]
    )
    try:
        pool = get_model_pool()
        response = pool.invoke(
            [
                SystemMessage(content="You rephrase follow-up questions into standalone search queries."),
                HumanMessage(content=REFORMULATION_PROMPT.format(history=history_text, question=question)),
            ],
            max_tokens=MAX_TOKENS_REFORMULATE,
        )
        result = extract_text(response.content).strip().strip('"')
        if result:
            return result
    except Exception:
        pass
    return question


def vector_search(query_vector, k=K):
    from document_ingestion.models import Chunk

    return list(
        Chunk.objects.annotate(distance=CosineDistance("embedding", query_vector))
        .order_by("distance")[:k]
    )


def keyword_search(query, k=K):
    from document_ingestion.models import Chunk

    for search_type in ("websearch", "plain"):
        try:
            ranked = (
                Chunk.objects.annotate(
                    rank=SearchRank(F("search_vector"), SearchQuery(query, search_type=search_type))
                )
                .order_by("-rank")[:k]
            )
            return list(ranked)
        except Exception:
            if search_type == "plain":
                raise
    return []


def rrf_fuse(ranked_lists, k=RRF_K):
    scores = defaultdict(float)
    chunks_by_pk = {}
    for ranked in ranked_lists:
        for position, chunk in enumerate(ranked, start=1):
            chunks_by_pk[chunk.pk] = chunk
            scores[chunk.pk] += 1 / (k + position)
    return [chunks_by_pk[pk] for pk in sorted(scores, key=scores.get, reverse=True)]


def rerank(chunks, question, top_n=TOP_N):
    docs = [
        Document(
            page_content=chunk.content,
            metadata={
                "chunk_pk": chunk.pk,
                "source": chunk.metadata.get("source"),
                "title": chunk.metadata.get("title"),
                "page": chunk.metadata.get("page"),
            },
        )
        for chunk in chunks
    ]
    reranker = get_reranker()
    if not reranker:
        return docs[:top_n]
    try:
        results = reranker.rerank(docs, question, top_n=len(docs))
        ranked = sorted(
            results, key=lambda r: r["relevance_score"], reverse=True
        )
        kept = []
        for result in ranked:
            doc = docs[result["index"]]
            if result["relevance_score"] >= RERANK_MIN_SCORE:
                kept.append(doc)
        if not kept and ranked:
            kept = [docs[ranked[0]["index"]]]
        return kept[:top_n]
    except Exception:
        return docs[:top_n]


def build_context(docs):
    parts = []
    for i, doc in enumerate(docs, start=1):
        parts.append(f"--- Document {i} ---\n{doc.page_content[:MAX_FRAGMENT]}")
    return "\n\n".join(parts)


def _run_search(fn, *args):
    try:
        return fn(*args)
    finally:
        from django.db import connections
        connections.close_all()


def _parallel_search(query_vector, query):
    """Run pgvector + FTS searches in parallel; each uses its own DB conn."""
    with ThreadPoolExecutor(max_workers=2) as executor:
        vector_future = executor.submit(_run_search, vector_search, query_vector)
        keyword_future = executor.submit(_run_search, keyword_search, query)
        return vector_future.result(), keyword_future.result()


def retrieve(question, history):
    """Reformulate (if history) then fetch top docs. Returns (query, docs)."""
    search_query = reformulate(question, history)
    query_vector = embed_texts([search_query])[0]
    vector_hits, keyword_hits = _parallel_search(query_vector, search_query)
    fused = rrf_fuse([vector_hits, keyword_hits])
    docs = rerank(fused, search_query)
    return search_query, docs


def generate_answer(question, context):
    prompt = ANSWER_PROMPT.format(question=question, context=context)
    try:
        answer = get_model_pool().invoke_text(
            [
                SystemMessage(content="You are a helpful assistant."),
                HumanMessage(content=prompt),
            ],
            max_tokens=MAX_TOKENS_ANSWER,
        )
        return answer or GEN_UNAVAILABLE
    except Exception:
        return GEN_ERROR


def stream_answer_text(question, context):
    """Yield answer token deltas; accumulates to the full answer."""
    prompt = ANSWER_PROMPT.format(question=question, context=context)
    messages = [
        SystemMessage(content="You are a helpful assistant."),
        HumanMessage(content=prompt),
    ]
    try:
        text = ""
        emitted = False
        for delta in get_model_pool().stream(messages, max_tokens=MAX_TOKENS_ANSWER):
            text += delta
            emitted = True
            yield delta
        if not text.strip():
            yield GEN_UNAVAILABLE
        elif not emitted:
            yield text
    except Exception:
        yield GEN_ERROR


def chunk_citation(doc):
    metadata = getattr(doc, "metadata", {}) or {}
    return {
        "source": metadata.get("source") or metadata.get("title") or "unknown",
        "title": metadata.get("title") or "",
        "page": metadata.get("page"),
        "chunk_id": metadata.get("chunk_pk"),
        "text": (doc.page_content or "")[:CITATION_TEXT],
    }


def citation_list(docs, top_n=TOP_N):
    """Citations for ranked docs, deduplicated per source (best chunk first)."""
    citations = []
    seen_sources = set()
    for doc in docs:
        citation = chunk_citation(doc)
        source = citation["source"]
        if source in seen_sources:
            continue
        seen_sources.add(source)
        citations.append(citation)
        if len(citations) >= top_n:
            break
    return citations


def answer_question(question, history):
    """Run the full pipeline non-streaming. Returns (answer, citations)."""
    from document_ingestion.models import Chunk

    question = (question or "").strip()
    if not question:
        return "Please ask a question.", []

    if not Chunk.objects.exists():
        return NO_DOCUMENTS_MESSAGE, []

    _, docs = retrieve(question, history)
    answer = generate_answer(question, build_context(docs))

    if is_no_answer(answer):
        citations = []
    else:
        citations = citation_list(docs)
    return answer, citations