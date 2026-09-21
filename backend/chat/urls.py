from django.urls import path

from . import views

urlpatterns = [
    path("", views.chat_page, name="chat"),
    path("api/chat", views.api_chat, name="api_chat"),
    path("api/chat/stream", views.api_chat_stream, name="api_chat_stream"),
    path("healthz", views.health_check, name="health_check"),
]