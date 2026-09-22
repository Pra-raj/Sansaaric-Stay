from django.urls import path

from chat import views as chat_views

from . import views

urlpatterns = [
    path("", views.docadmin, name="docadmin"),
    path("status/", views.docadmin_status, name="docadmin_status"),
    path("content/<uuid:document_id>/", views.docadmin_content, name="docadmin_content"),
    path("train/<uuid:document_id>/", views.docadmin_train, name="docadmin_train"),
    path("delete/<uuid:document_id>/", views.docadmin_delete, name="docadmin_delete"),
    path("chats/", chat_views.docadmin_chats, name="docadmin_chats"),
    path(
        "chats/new/",
        chat_views.docadmin_chat_create,
        name="docadmin_chat_create",
    ),
    path(
        "chats/<int:pk>/reply/",
        chat_views.docadmin_chat_reply,
        name="docadmin_chat_reply",
    ),
    path(
        "chats/<int:pk>/update/",
        chat_views.docadmin_chat_update,
        name="docadmin_chat_update",
    ),
    path(
        "chats/<int:pk>/",
        chat_views.docadmin_chat_thread,
        name="docadmin_chat_thread",
    ),
]