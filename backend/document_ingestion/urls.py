from django.urls import path

from chat import views as chat_views

from . import views

urlpatterns = [
    path("", views.docadmin, name="docadmin"),
    path("status/", views.docadmin_status, name="docadmin_status"),
    path("train/<uuid:document_id>/", views.docadmin_train, name="docadmin_train"),
    path("delete/<uuid:document_id>/", views.docadmin_delete, name="docadmin_delete"),
    path("chats/", chat_views.docadmin_chats, name="docadmin_chats"),
    path(
        "chats/<int:pk>/",
        chat_views.docadmin_chat_thread,
        name="docadmin_chat_thread",
    ),
]