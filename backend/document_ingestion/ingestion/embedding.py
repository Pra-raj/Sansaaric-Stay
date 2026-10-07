"""Lazy, thread-safe wrapper around the sentence-transformers embedder."""

import threading

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# One lock: cold paths (lazy model load via get_embedder) and hot inference
# (SentenceTransformer.encode, not documented thread-safe) are serialized by it.
_encode_lock = threading.Lock()
_model = None


def get_embedder():
    global _model
    if _model is None:
        with _encode_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _model


def embed_texts(texts):
    """Embed a sequence of strings into a list of 384-d vectors (normalized)."""
    texts = list(texts)
    if not texts:
        return []
    model = get_embedder()
    with _encode_lock:
        vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return vectors.tolist()