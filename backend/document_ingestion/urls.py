from django.urls import path

from . import views

urlpatterns = [
    path(
        "api/admin/documents",
        views.DocumentListView.as_view(),
        name="admin_document_list",
    ),
    path(
        "api/admin/documents/<uuid:document_id>/train",
        views.DocumentTrainView.as_view(),
        name="admin_document_train",
    ),
    path(
        "api/admin/documents/<uuid:document_id>",
        views.DocumentDetailView.as_view(),
        name="admin_document_delete",
    ),
    path(
        "api/admin/documents/<uuid:document_id>/content",
        views.DocumentContentView.as_view(),
        name="admin_document_content",
    ),
]
