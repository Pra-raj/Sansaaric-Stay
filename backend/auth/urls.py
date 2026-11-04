from django.urls import path

from . import schema, views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth_signup"),
    path("signup/verify", views.VerifyEmailView.as_view(), name="auth_signup_verify"),
    path("signup/resend", views.ResendVerificationView.as_view(), name="auth_signup_resend"),
    path("login", views.LoginView.as_view(), name="auth_login"),
    path("refresh", views.RefreshView.as_view(), name="auth_refresh"),
    path(
        "password-reset",
        views.PasswordResetRequestView.as_view(),
        name="auth_password_reset",
    ),
    path(
        "password-reset/confirm",
        views.PasswordResetConfirmView.as_view(),
        name="auth_password_reset_confirm",
    ),
    path("logout", views.LogoutView.as_view(), name="auth_logout"),
    path("me", views.MeView.as_view(), name="auth_me"),
]