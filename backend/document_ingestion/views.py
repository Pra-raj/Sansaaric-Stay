"""Staff-only JSON API backing the Next.js /admin documents page.

Everything here is gated on Django's `is_staff` (api.permissions.IsStaff) and
expects a token in the Authorization header, which the project's JWT
authentication resolves to a real User.
"""

import os
from datetime import timedelta

from django.core.exceptions import SuspiciousFileOperation
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsStaff
from api.serializers import DetailErrorSerializer

from .ingestion.automation import STALE_HEARTBEAT_SECONDS
from .models import ReferenceDocument
from .serializers import (
    DocumentDetailSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
)


class DocumentListView(APIView):
    """Flat list of every reference document, newest first.

    Not paginated on purpose: the admin table renders the whole list at once and
    a document corpus is small (tens of rows).
    """

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Documents"],
        responses={200: DocumentSerializer(many=True), 403: DetailErrorSerializer},
    )
    def get(self, request):
        queryset = ReferenceDocument.objects.annotate(chunk_count=Count("chunks"))
        return Response(DocumentSerializer(queryset, many=True).data)

    @extend_schema(
        tags=["Admin / Documents"],
        request=DocumentUploadSerializer,
        responses={
            201: DocumentSerializer(many=True),
            400: DetailErrorSerializer,
            403: DetailErrorSerializer,
        },
    )
    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        created = []
        try:
            with transaction.atomic():
                for uploaded in serializer.validated_data["files"]:
                    name = os.path.basename(uploaded.name)
                    document = ReferenceDocument.objects.create(
                        file=uploaded,
                        file_name=name,
                        file_type=os.path.splitext(name)[1].lower().lstrip("."),
                        file_size=getattr(uploaded, "size", 0) or len(uploaded.read()),
                        status="pending",
                        uploaded_by=request.user,
                    )
                    created.append(document)
        except SuspiciousFileOperation:
            return Response(
                {"error": "Uploaded filename is not allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            DocumentSerializer(
                ReferenceDocument.objects.filter(pk__in=[doc.pk for doc in created]),
                many=True,
            ).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentTrainView(APIView):
    """Re-queue a document for (re)training."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Documents"],
        request=None,
        responses={
            200: DocumentSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def post(self, request, document_id):
        document = get_object_or_404(ReferenceDocument, document_id=document_id)
        if (
            document.status == "processing"
            and document.worker_heartbeat
            and document.worker_heartbeat
            >= timezone.now() - timedelta(seconds=STALE_HEARTBEAT_SECONDS)
        ):
            return Response(
                {"detail": "This document is currently being trained."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if document.status != "pending":
            ReferenceDocument.objects.filter(pk=document.pk).update(
                status="pending", error=""
            )
        document.refresh_from_db()
        document = ReferenceDocument.objects.annotate(chunk_count=Count("chunks")).get(
            pk=document.pk
        )
        return Response(DocumentSerializer(document).data)


class DocumentDetailView(APIView):
    """Delete a document, its file on disk, and its chunks."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Documents"],
        request=None,
        responses={
            204: None,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def delete(self, request, document_id):
        document = get_object_or_404(ReferenceDocument, document_id=document_id)
        document.file.delete(save=False)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentContentView(APIView):
    """Document metadata plus trained chunk text (read-only)."""

    permission_classes = [IsStaff]

    @extend_schema(
        tags=["Admin / Documents"],
        responses={
            200: DocumentDetailSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, document_id):
        document = get_object_or_404(
            ReferenceDocument.objects.annotate(chunk_count=Count("chunks")),
            document_id=document_id,
        )
        return Response(DocumentDetailSerializer(document).data)
