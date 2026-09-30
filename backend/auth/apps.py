from django.apps import AppConfig


class AuthConfig(AppConfig):
    name = 'auth'
    # Duplicate-label resolution: Django's own django.contrib.auth owns the
    # "auth" label, so this app needs a unique one (table prefix sansaar_auth_).
    label = 'sansaar_auth'