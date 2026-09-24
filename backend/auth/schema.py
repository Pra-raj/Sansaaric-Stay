from drf_spectacular.extensions import OpenApiAuthenticationExtension


class SupabaseJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    """Expose the Supabase Bearer JWT as the Swagger security scheme."""

    target_class = "auth.authentication.SupabaseJWTAuthentication"
    name = "SupabaseJWT"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": (
                "Supabase access token, obtained from POST /api/auth/login "
                "or /api/auth/refresh."
            ),
        }