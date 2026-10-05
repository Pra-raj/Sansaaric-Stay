"""Process-local TTL cache for recommendation results.

Mirrors the answer cache in ``chat/services.py`` (same lock, same FIFO
eviction, same TTL semantics) so the two subsystems read the same way.

Deliberately not shared across processes. Hotels, reviews and bookings change
infrequently, the TTL is short, and a stale recommendation is far less costly
than a stale answer — so a cluster simply recomputes per process. This is the
same trade-off the chat cache makes, and the natural upgrade path is a shared
store once impression tracking justifies one.
"""
import logging
import threading
import time

from django.conf import settings

logger = logging.getLogger(__name__)

_cache_lock = threading.Lock()
_recommendation_cache = {}  # key -> (timestamp, payload)


def _config(key, default):
    return getattr(settings, "RECOMMENDATIONS", {}).get(key, default)


def cache_key(user_id, limit, exclude, check_in, check_out, guests, **extra):
    """Build a stable cache key.

    ``user_id`` is ``None`` for anonymous callers so every anonymous request
    shares one entry — otherwise a bot loop could fragment the cache into an
    unbounded number of near-identical keys.
    """
    parts = [
        str(user_id or "anon"),
        str(limit),
        ",".join(str(item) for item in sorted(exclude or ())),
        str(check_in or ""),
        str(check_out or ""),
        str(guests or ""),
    ]
    parts.extend(f"{key}={value}" for key, value in sorted(extra.items()))
    return "|".join(parts)


def cached(key):
    """Return a cached payload, or None when absent or expired."""
    with _cache_lock:
        entry = _recommendation_cache.get(key)
        if entry is None:
            return None
        stored_at, payload = entry
        if time.time() - stored_at > _config("CACHE_TTL_SECONDS", 300):
            _recommendation_cache.pop(key, None)
            return None
        return payload


def cache(key, payload):
    """Store a payload, evicting the oldest entry when full."""
    with _cache_lock:
        max_entries = _config("CACHE_MAX_ENTRIES", 500)
        if len(_recommendation_cache) >= max_entries and key not in _recommendation_cache:
            _recommendation_cache.pop(next(iter(_recommendation_cache)))
        _recommendation_cache[key] = (time.time(), payload)


def clear():
    """Drop every cached entry. Used by tests."""
    with _cache_lock:
        _recommendation_cache.clear()