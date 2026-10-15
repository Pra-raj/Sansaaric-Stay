"""JWT identity for plain Django views (chat endpoints are not DRF APIViews)."""

from rest_framework import exceptions

from .authentication import LocalJWTAuthentication, SupabaseJWTAuthentication


class JWTAuthenticationMiddleware:
    """Populate ``request.user`` from a Bearer token on non-DRF views.

    DRF's authentication classes only run on APIView/@api_view, so plain
    function views (chat) never saw the JWT and every caller looked anonymous.
    This middleware runs after Django's AuthenticationMiddleware and lets a
    bearer token identity win over the (unused) session identity.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.user.is_authenticated:
            for backend in (
                LocalJWTAuthentication(),
                SupabaseJWTAuthentication(),
            ):
                try:
                    result = backend.authenticate(request)
                except exceptions.AuthenticationFailed:
                    continue
                if result is not None:
                    request.user, _ = result
                    break
        return self.get_response(request)