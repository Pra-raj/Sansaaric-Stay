from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exceptions import Conflict
from api.pagination import paginated_response
from api.schema import paginated_response_schema
from api.serializers import DetailErrorSerializer

from .models import Booking
from .serializers import (
    BookingCreateSerializer,
    BookingGuestPatchSerializer,
    BookingStaffPatchSerializer,
    BookingSummarySerializer,
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
