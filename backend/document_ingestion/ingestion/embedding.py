"""Lazy, thread-safe wrapper around the sentence-transformers embedder."""

import threading

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIMENSIONS = 384

_lock = threading.Lock()
_encode_lock = threading.Lock()
_model = None


def get_embedder():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _model


def preload():
    """Force the embedding model into memory (call at startup, not per-request)."""
    get_embedder()


def embed_texts(texts):
    """Embed a sequence of strings into a list of 384-d vectors (normalized)."""
    texts = list(texts)
    if not texts:
        return []
    model = get_embedder()
    # SentenceTransformer.encode is not documented thread-safe; serialize calls
    # so concurrent chat requests can never run inference on the same model.
    with _encode_lock:
        vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return vectors.tolist()