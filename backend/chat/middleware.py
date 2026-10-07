"""Lightweight structured request logging for operations visibility."""

import logging
import time

logger = logging.getLogger("chat.request")


class RequestLoggingMiddleware:
    """Log one line per request: method, path, status, latency.

    First in MIDDLEWARE, so it wraps everything. Inner middleware may
    short-circuit (CORS preflight, WhiteNoise static) without running
    Session/Auth middleware, so request.session is never read here.
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
        logger.info(
            "%s %s -> %d (%.1f ms)",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
        )
        return response