from django.urls import path

from . import views

urlpatterns = [
    path("api/chat", views.api_chat, name="api_chat"),
    path("api/chat/stream", views.api_chat_stream, name="api_chat_stream"),
    path("api/chat/history", views.api_chat_history, name="api_chat_history"),
    path("api/chat/events", views.api_chat_events, name="api_chat_events"),
    path("api/admin/inbox/events", views.api_admin_inbox_events, name="admin_inbox_events"),
    path("healthz", views.health_check, name="health_check"),
    path("health", views.health_check, name="health_check_alias"),
    path(
        "api/admin/inbox",
        views.InboxListView.as_view(),
        name="admin_inbox_list",
    ),
    path(
        "api/admin/inbox/<int:conversation_id>",
        views.InboxView.as_view(),
        name="admin_inbox_thread",
    ),
    path(
        "api/admin/inbox/<int:conversation_id>/replies",
        views.InboxReplyView.as_view(),
        name="admin_inbox_reply",
    ),
]
