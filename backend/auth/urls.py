from django.urls import path

from . import schema, views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth_signup"),
    path("login", views.LoginView.as_view(), name="auth_login"),
    path("refresh", views.RefreshView.as_view(), name="auth_refresh"),
    path("logout", views.LogoutView.as_view(), name="auth_logout"),
    path("me", views.MeView.as_view(), name="auth_me"),
]