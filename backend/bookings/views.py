from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exceptions import Conflict
from api.pagination import paginated_response
from api.permissions import IsStaff
from api.schema import paginated_response_schema
from api.serializers import DetailErrorSerializer

from .models import Booking
from .serializers import (
    AdminBookingSerializer,
    BookingCreateSerializer,
    BookingGuestPatchSerializer,
    BookingStaffPatchSerializer,
    BookingSummarySerializer,
    RevenueSummarySerializer,
)

PAGINATION_PARAMETERS = [
    OpenApiParameter(
        "page", int, OpenApiParameter.QUERY, description="Page number (1-based)."
    ),
    OpenApiParameter(
        "page_size", int, OpenApiParameter.QUERY, description="Items per page (max 100)."
    ),
]

GUEST_PATCH_FIELDS = {"check_in", "check_out", "guests"}
IMMUTABLE_FIELDS = {"room_id", "user_id", "user"}
STAFF_PATCH_FIELDS = GUEST_PATCH_FIELDS | {"status", "total_amount"}
FIELD_ERRORS = {"type": "object", "additionalProperties": {}}


def visible_booking_or_404(booking_id, user) -> Booking:
    booking = get_object_or_404(
        Booking.objects.select_related("room", "room__hotel", "room__hotel__location"),
        pk=booking_id
    )
    if not user or not user.is_authenticated:
        raise NotFound()
    if user.is_staff or booking.user_id == user.id:
        return booking
    raise NotFound()


def _reject_forbidden_fields(request, user) -> None:
    sent = set(request.data.keys())
    allowed = STAFF_PATCH_FIELDS if user.is_staff else GUEST_PATCH_FIELDS
    for field in sorted(sent & IMMUTABLE_FIELDS):
        raise PermissionDenied(f"{field} cannot be changed.")
    forbidden = sent - allowed
    if forbidden:
        raise PermissionDenied(f"Cannot change: {', '.join(sorted(forbidden))}.")


class BookingListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="bookings_list",
        tags=["Bookings"],
        auth=[{"SupabaseJWT": []}],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema(
                "PagedBookingList", BookingSummarySerializer
            ),
            401: DetailErrorSerializer,
        },
    )
    def get(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        queryset = Booking.objects.select_related(
            "room", "room__hotel", "room__hotel__location"
        )
        if not request.user.is_staff:
            queryset = queryset.filter(user=request.user)
        return paginated_response(queryset, request, self, BookingSummarySerializer)

    @extend_schema(
        methods=["POST"],
        operation_id="bookings_create",
        tags=["Bookings"],
        auth=[{"SupabaseJWT": []}],
        request=BookingCreateSerializer,
        responses={
            201: BookingSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
        },
    )
    def post(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.save(user=request.user, status=Booking.STATUS_PENDING)
        return Response(
            BookingSummarySerializer(booking).data, status=status.HTTP_201_CREATED
        )


class BookingDetailView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="bookings_retrieve",
        tags=["Bookings"],
        auth=[{"SupabaseJWT": []}],
        responses={
            200: BookingSummarySerializer,
            401: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, booking_id):
        booking = visible_booking_or_404(booking_id, request.user)
        return Response(BookingSummarySerializer(booking).data)

    @extend_schema(
        methods=["PATCH"],
        operation_id="bookings_update",
        tags=["Bookings"],
        auth=[{"SupabaseJWT": []}],
        request=BookingGuestPatchSerializer,
        responses={
            200: BookingSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def patch(self, request, booking_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        booking = visible_booking_or_404(booking_id, request.user)
        if not request.user.is_staff and booking.status != Booking.STATUS_PENDING:
            raise PermissionDenied("Only pending bookings can be changed.")
        _reject_forbidden_fields(request, request.user)
        serializer_class = (
            BookingStaffPatchSerializer
            if request.user.is_staff
            else BookingGuestPatchSerializer
        )
        serializer = serializer_class(booking, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(BookingSummarySerializer(serializer.instance).data)

    @extend_schema(
        methods=["DELETE"],
        operation_id="bookings_destroy",
        tags=["Bookings"],
        auth=[{"SupabaseJWT": []}],
        request=None,
        responses={
            204: None,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
            409: DetailErrorSerializer,
        },
    )
    def delete(self, request, booking_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        booking = visible_booking_or_404(booking_id, request.user)
        if not request.user.is_staff and booking.status != Booking.STATUS_PENDING:
            raise PermissionDenied("Only pending bookings can be deleted.")
        if booking.reviews.exists():
            raise Conflict("Booking has a review.")
        booking.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _admin_booking_queryset():
    return Booking.objects.select_related(
        "user", "room", "room__hotel", "room__hotel__location"
    ).order_by("-created_at")


class AdminBookingListView(APIView):
    """Every booking for the admin dashboard, newest first (not paginated)."""

    permission_classes = [IsStaff]

    @extend_schema(
        methods=["GET"],
        operation_id="admin_bookings_list",
        tags=["Admin / Bookings"],
        parameters=[
            OpenApiParameter(
                "status",
                str,
                OpenApiParameter.QUERY,
                description="Filter by backend status (pending, confirmed, cancelled, completed).",
            ),
        ],
        responses={200: AdminBookingSerializer(many=True), 403: DetailErrorSerializer},
    )
    def get(self, request):
        queryset = _admin_booking_queryset()
        status_filter = (request.query_params.get("status") or "").strip().lower()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response(AdminBookingSerializer(queryset, many=True).data)


class AdminRevenueView(APIView):
    """Revenue totals grouped by check-in month, mirroring the dashboard math:
    only non-cancelled bookings count as paid."""

    permission_classes = [IsStaff]

    @extend_schema(
        methods=["GET"],
        operation_id="admin_revenue",
        tags=["Admin / Bookings"],
        responses={200: RevenueSummarySerializer, 403: DetailErrorSerializer},
    )
    def get(self, request):
        paid = _admin_booking_queryset().exclude(status=Booking.STATUS_CANCELLED)
        months: dict[str, dict] = {}
        total_revenue = 0.0
        for booking in paid:
            key = booking.check_in.strftime("%Y-%m")
            row = months.setdefault(key, {"revenue": 0.0, "bookings": 0})
            row["revenue"] += float(booking.total_amount)
            row["bookings"] += 1
            total_revenue += float(booking.total_amount)
        total_bookings = paid.count()
        cancelled_bookings = Booking.objects.filter(
            status=Booking.STATUS_CANCELLED
        ).count()
        return Response(
            {
                "totalRevenue": total_revenue,
                "totalBookings": total_bookings,
                "cancelledBookings": cancelled_bookings,
                "averageBooking": total_revenue / total_bookings if total_bookings else 0,
                "months": [
                    {"month": month, **months[month]} for month in sorted(months)
                ],
            }
        )
