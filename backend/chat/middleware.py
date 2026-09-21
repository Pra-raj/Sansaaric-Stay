"""Lightweight structured request logging for operations visibility."""

import logging
import time

logger = logging.getLogger("chat.request")


class RequestLoggingMiddleware:
    """Log one line per request: method, path, remote addr, status, latency.

    Placed first in MIDDLEWARE so `request.user` / `request.session` are
    already populated by the time the response is returned upstream.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                "Unhandled exception %s %s",
                request.method,
                request.path,
            )
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        user = request.user.get_username() if request.user.is_authenticated else "-"
        session_key = request.session.session_key or "-"
        logger.info(
            "%s %s -> %d (%.1f ms) user=%s session=%s",
            request.method,
            request.get_full_path(),
            response.status_code,
            duration_ms,
            user,
            session_key,
        )
        return response