import os

from django import forms
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Count
from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from .ingestion.loaders import SUPPORTED_TYPES
from .models import ReferenceDocument

# Reject uploads above this size before they hit object storage or the parser.
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50")) * 1024 * 1024


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleFileField(forms.FileField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleFileInput())
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        clean_single = super().clean
        if isinstance(data, (list, tuple)):
            return [clean_single(item, initial) for item in data]
        return [clean_single(data, initial)]


class UploadForm(forms.Form):
    files = MultipleFileField()
    title = forms.CharField(required=False, max_length=255)

    def clean(self):
        cleaned = super().clean()
        title = (cleaned.get("title") or "").strip()

        for uploaded in cleaned.get("files", []):
            name = os.path.basename(uploaded.name)
            ftype = os.path.splitext(name)[1].lower().lstrip(".")
            if uploaded.size > MAX_UPLOAD_SIZE:
                self.add_error(
                    "files",
                    f"{name}: exceeds the {MAX_UPLOAD_SIZE // (1024 * 1024)} MB "
                    "maximum upload size.",
                )
            if not ftype:
                self.add_error("files", f"{name}: file has no extension.")
            elif ftype not in SUPPORTED_TYPES:
                self.add_error(
                    "files",
                    f"{name}: unsupported type .{ftype} (supported: "
                    + ", ".join(sorted(SUPPORTED_TYPES))
                    + ").",
                )
        return cleaned


def staff_json_required(view):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_staff:
            return JsonResponse({"error": "Forbidden"}, status=403)
        return view(request, *args, **kwargs)

    return wrapper


@staff_member_required(login_url="/accounts/login/")
def docadmin(request):
    form = UploadForm(request.POST or None, request.FILES or None)
    if request.method == "POST" and form.is_valid():
        title = (form.cleaned_data["title"] or "").strip()
        created = []

        for uploaded in form.cleaned_data["files"]:
            name = os.path.basename(uploaded.name)
            ftype = os.path.splitext(name)[1].lower().lstrip(".")
            doc_title = title or os.path.splitext(name)[0]
            document = ReferenceDocument(
                title=doc_title,
                file=uploaded,
                file_name=name,
                file_type=ftype,
                file_size=getattr(uploaded, "size", 0) or len(uploaded.read()),
                status="pending",
                uploaded_by=request.user if request.user.is_authenticated else None,
            )
            document.save()
            created.append(document)

        for document in created:
            messages.success(request, f"Queued {document.file_name} for training.")

        if len(created) == 1:
            return redirect(reverse("docadmin"))
        if created:
            messages.success(request, f"Queued {len(created)} documents for training.")
            return redirect(reverse("docadmin"))

    return render(request, "documents/docadmin.html", {"form": form})


@staff_json_required
def docadmin_status(request):
    queryset = ReferenceDocument.objects.annotate(chunk_count=Count("chunks"))

    def to_dict(document):
        return {
            "document_id": str(document.document_id),
            "title": document.title,
            "file_name": document.file_name,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "status": document.status,
            "error": document.error,
            "chunk_count": document.chunk_count,
            "created_at": document.created_at.isoformat(),
        }

    return JsonResponse([to_dict(doc) for doc in queryset], safe=False)


@staff_member_required(login_url="/accounts/login/")
@require_POST
def docadmin_train(request, document_id):
    try:
        document = ReferenceDocument.objects.get(document_id=document_id)
    except ReferenceDocument.DoesNotExist:
        raise Http404("Document not found")

    if document.status != "pending":
        ReferenceDocument.objects.filter(pk=document.pk).update(
            status="pending",
            error="",
        )
    messages.success(request, f"Queued {document.file_name} for re-training.")
    return redirect(reverse("docadmin"))


@staff_member_required(login_url="/accounts/login/")
@require_POST
def docadmin_delete(request, document_id):
    try:
        document = ReferenceDocument.objects.get(document_id=document_id)
    except ReferenceDocument.DoesNotExist:
        raise Http404("Document not found")

    file_name = document.file_name
    document.file.delete(save=False)
    document.delete()
    messages.success(request, f"Deleted {file_name} and all of its chunks.")
    return redirect(reverse("docadmin"))