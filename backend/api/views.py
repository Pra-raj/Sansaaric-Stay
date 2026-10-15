"""Cross-cutting admin activity feed, computed from existing tables.

No model or migration: the dashboard only needs a newest-first recent-events
list, so entries are assembled from hotels, bookings, reviews, inbox threads
and documents at request time.
"""

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from api.permissions import IsStaff
from api.serializers import ActivityEntrySerializer, DetailErrorSerializer

ACTIVITY_MAX_ROWS = 50
_PER_SOURCE = 20


def _actor(user, fallback="Guest"):
    if user is None:
        return fallback, ""
    return user.get_full_name() or user.email or user.username or fallback, user.email or ""


class AdminActivityView(APIView):
    permission_classes = [IsStaff]

    @extend_schema(
        methods=["GET"],
        operation_id="admin_activity",
        tags=["Admin / Activity"],
        responses={200: ActivityEntrySerializer(many=True), 403: DetailErrorSerializer},
    )
    def get(self, request):
        from bookings.models import Booking
        from chat.models import Conversation
        from document_ingestion.models import ReferenceDocument
        from hotels.models import Hotel
        from reviews.models import Review

        entries = []
        for hotel in Hotel.objects.select_related("owner", "location").order_by("-created_at")[:_PER_SOURCE]:
            name, email = _actor(hotel.owner, fallback="Staff")
            entries.append({
                "id": f"hotel-{hotel.pk}",
                "at": hotel.created_at.isoformat(),
                "actor": name,
                "actorEmail": email,
                "category": "hotel",
                "action": "added hotel",
                "target": hotel.name,
                "level": "info",
            })
        for booking in Booking.objects.select_related("user", "room__hotel").order_by("-created_at")[:_PER_SOURCE]:
            name, email = _actor(booking.user)
            cancelled = booking.status == Booking.STATUS_CANCELLED
            entries.append({
                "id": f"booking-{booking.pk}",
                "at": booking.created_at.isoformat(),
                "actor": name,
                "actorEmail": email,
                "category": "booking",
                "action": "cancelled booking" if cancelled else "created booking",
                "target": booking.room.hotel.name,
                "level": "warning" if cancelled else "info",
            })
        for review in Review.objects.select_related("user", "hotel").order_by("-created_at")[:_PER_SOURCE]:
            name, email = _actor(review.user)
            entries.append({
                "id": f"review-{review.pk}",
                "at": review.created_at.isoformat(),
                "actor": name,
                "actorEmail": email,
                "category": "booking",
                "action": "left a review",
                "target": review.hotel.name,
                "level": "info",
            })
        for conversation in Conversation.objects.select_related("user").order_by("-created_at")[:_PER_SOURCE]:
            name, email = _actor(conversation.user, fallback=conversation.title or "Guest")
            if conversation.email and not email:
                email = conversation.email
            entries.append({
                "id": f"inbox-{conversation.pk}",
                "at": conversation.created_at.isoformat(),
                "actor": name,
                "actorEmail": email,
                "category": "inbox",
                "action": "started chat",
                "target": conversation.title or "",
                "level": "info",
            })
        for document in ReferenceDocument.objects.select_related("uploaded_by").order_by("-created_at")[:_PER_SOURCE]:
            name, email = _actor(document.uploaded_by, fallback="System")
            failed = document.status == "failed"
            entries.append({
                "id": f"document-{document.pk}",
                "at": document.created_at.isoformat(),
                "actor": name,
                "actorEmail": email,
                "category": "document",
                "action": "document failed" if failed else "uploaded document",
                "target": document.file_name,
                "level": "warning" if failed else "info",
            })
        entries.sort(key=lambda entry: entry["at"], reverse=True)
        return Response(entries[:ACTIVITY_MAX_ROWS])
