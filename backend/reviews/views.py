from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import (
    NotAuthenticated,
    PermissionDenied,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from api.pagination import paginated_response
from api.schema import paginated_response_schema
from api.serializers import DetailErrorSerializer
from api.visibility import visible_hotel_or_404

from .models import Review
from .serializers import (
    PublicReviewSerializer,
    ReviewCreateSerializer,
    ReviewWriteSerializer,
)

PAGINATION_PARAMETERS = [
    OpenApiParameter(
        "page", int, OpenApiParameter.QUERY, description="Page number (1-based)."
    ),
    OpenApiParameter(
        "page_size", int, OpenApiParameter.QUERY, description="Items per page (max 100)."
    ),
]

WRITABLE_FIELDS = {"rating", "comment"}
FIELD_ERRORS = {"type": "object", "additionalProperties": {}}


def can_review(user, booking) -> bool:
    if not user or not user.is_authenticated:
        return False
    if booking.user_id == user.id:
        return True
    return bool(user.is_staff or booking.room.hotel.owner_id == user.id)


class HotelReviewListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="hotel_reviews_list",
        tags=["Reviews"],
        auth=[],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema(
                "PagedHotelReviewList", PublicReviewSerializer
            ),
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, hotel_id):
        hotel = visible_hotel_or_404(hotel_id, request.user)
        queryset = Review.objects.filter(hotel=hotel)
        return paginated_response(queryset, request, self, PublicReviewSerializer)


class ReviewListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="reviews_list",
        tags=["Reviews"],
        auth=[{"SupabaseJWT": []}],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema("PagedReviewList", PublicReviewSerializer),
            401: DetailErrorSerializer,
        },
    )
    def get(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        queryset = Review.objects.select_related("hotel", "booking")
        if not request.user.is_staff:
            queryset = queryset.filter(user=request.user)
        return paginated_response(queryset, request, self, PublicReviewSerializer)

    @extend_schema(
        methods=["POST"],
        operation_id="reviews_create",
        tags=["Reviews"],
        auth=[{"SupabaseJWT": []}],
        request=ReviewCreateSerializer,
        responses={
            201: PublicReviewSerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
        },
    )
    def post(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.validated_data["booking"]
        if not can_review(request.user, booking):
            raise PermissionDenied("You can only review your own stay.")
        if booking.check_out > timezone.now().date():
            raise ValidationError({"booking_id": "Stay has not ended yet."})
        if Review.objects.filter(booking=booking).exists():
            raise ValidationError({"booking_id": "This stay is already reviewed."})
        review = serializer.save(user=request.user, hotel=booking.room.hotel)
        return Response(
            PublicReviewSerializer(review).data, status=status.HTTP_201_CREATED
        )


class ReviewDetailView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="reviews_retrieve",
        tags=["Reviews"],
        auth=[],
        responses={200: PublicReviewSerializer, 404: DetailErrorSerializer},
    )
    def get(self, request, review_id):
        review = get_object_or_404(Review, pk=review_id)
        return Response(PublicReviewSerializer(review).data)

    @extend_schema(
        methods=["PATCH"],
        operation_id="reviews_update",
        tags=["Reviews"],
        auth=[{"SupabaseJWT": []}],
        request=ReviewWriteSerializer,
        responses={
            200: PublicReviewSerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def patch(self, request, review_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        review = get_object_or_404(Review.objects.select_related("user"), pk=review_id)
        if not request.user.is_staff and review.user_id != request.user.id:
            raise PermissionDenied()
        forbidden = set(request.data.keys()) - WRITABLE_FIELDS
        if forbidden:
            raise PermissionDenied(f"Cannot change: {', '.join(sorted(forbidden))}.")
        serializer = ReviewWriteSerializer(review, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PublicReviewSerializer(serializer.instance).data)

    @extend_schema(
        methods=["DELETE"],
        operation_id="reviews_destroy",
        tags=["Reviews"],
        auth=[{"SupabaseJWT": []}],
        request=None,
        responses={
            204: None,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def delete(self, request, review_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        review = get_object_or_404(Review.objects.select_related("user"), pk=review_id)
        if not request.user.is_staff and review.user_id != request.user.id:
            raise PermissionDenied()
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
