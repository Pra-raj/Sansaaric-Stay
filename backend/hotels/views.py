import logging

from django.db.models import Case, IntegerField, Value, When
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exceptions import Conflict
from api.pagination import paginated_response
from api.permissions import IsStaffOrReadOnly, hotel_owner_or_staff, is_hotel_owner
from api.schema import paginated_response_schema
from api.serializers import DetailErrorSerializer
from api.visibility import visible_hotel_list, visible_hotel_or_404

from .models import Location
from .serializers import (
    HotelStaffCreateSerializer,
    HotelSummarySerializer,
    HotelWriteSerializer,
    LocationSummarySerializer,
    LocationWriteSerializer,
)

PAGINATION_PARAMETERS = [
    OpenApiParameter(
        "page", int, OpenApiParameter.QUERY, description="Page number (1-based)."
    ),
    OpenApiParameter(
        "page_size", int, OpenApiParameter.QUERY, description="Items per page (max 100)."
    ),
    OpenApiParameter(
        "sort",
        str,
        OpenApiParameter.QUERY,
        description=(
            "Ordering. 'recommended' uses the recommendation engine "
            "(personalized when authenticated, popularity otherwise); "
            "'rating' and 'price' are also accepted. Unknown values fall back "
            "to newest first."
        ),
    ),
]

FIELD_ERRORS = {"type": "object", "additionalProperties": {}}

logger = logging.getLogger(__name__)

SORT_RECOMMENDED = "recommended"
SORT_RATING = "rating"
SORT_PRICE = "price"

# Translating a ranked list back into SQL order needs one CASE/WHEN clause per
# hotel. That is fine for a normal catalogue but produces a pathological
# statement for a very large one, so above this size we fall back to a cheap
# ordering and say so in the logs.
MAX_RANK_CLAUSES = 1000


def _apply_sort(queryset, sort, user):
    """Order a hotel queryset.

    Recommendation ranking happens here, before pagination, so `count` and page
    boundaries stay consistent with what the caller sees. Ranking a page after
    the fact would only shuffle within that page.
    """
    if sort == SORT_RECOMMENDED:
        from recommendations.serializers import (
            RecommendationParams,
            rank_visible_hotels,
        )

        params = RecommendationParams(
            limit=None, exclude=set(), check_in=None, check_out=None, guests=None
        )
        scored, _hotels = rank_visible_hotels(user, params)
        order = [item.hotel_id for item in scored]
        if len(order) > MAX_RANK_CLAUSES:
            logger.warning(
                "sort=recommended skipped: %d ranked hotels exceeds %d clauses",
                len(order),
                MAX_RANK_CLAUSES,
            )
            return queryset.order_by("-created_at")
        # Preset positions for ranked hotels; everything unranked (no rooms, or
        # filtered out of the recommender's pool) keeps its original ordering at
        # the end rather than disappearing from the response.
        return queryset.order_by(
            Case(
                *[
                    When(id=hotel_id, then=Value(position))
                    for position, hotel_id in enumerate(order)
                ],
                default=Value(len(order)),
                output_field=IntegerField(),
            ),
            "-created_at",
        )
    if sort == SORT_RATING:
        return queryset.order_by("-avg_rating", "-created_at")
    if sort == SORT_PRICE:
        # min_price is already annotated by visible_hotel_list().
        return queryset.order_by("min_price", "-created_at")
    return queryset.order_by("-created_at")


class HotelListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="hotels_list",
        tags=["Hotels"],
        auth=[],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema("PagedHotelList", HotelSummarySerializer)
        },
    )
    def get(self, request):
        queryset = visible_hotel_list(request.user)
        queryset = _apply_sort(queryset, request.query_params.get("sort"), request.user)
        return paginated_response(queryset, request, self, HotelSummarySerializer)

    @extend_schema(
        methods=["POST"],
        operation_id="hotels_create",
        tags=["Hotels"],
        auth=[{"SupabaseJWT": []}],
        request=HotelWriteSerializer,
        responses={
            201: HotelSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
        },
    )
    def post(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        if not is_hotel_owner(request.user):
            raise PermissionDenied("Only hotel owners can create hotels.")
        serializer_class = (
            HotelStaffCreateSerializer if request.user.is_staff else HotelWriteSerializer
        )
        serializer = serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        extra = {} if request.user.is_staff else {"owner": request.user}
        hotel = serializer.save(**extra)
        return Response(
            HotelSummarySerializer(hotel).data, status=status.HTTP_201_CREATED
        )


class HotelDetailView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="hotels_retrieve",
        tags=["Hotels"],
        auth=[],
        responses={200: HotelSummarySerializer, 404: DetailErrorSerializer},
    )
    def get(self, request, hotel_id):
        hotel = visible_hotel_or_404(hotel_id, request.user)
        return Response(HotelSummarySerializer(hotel).data)

    @extend_schema(
        methods=["PATCH"],
        operation_id="hotels_update",
        tags=["Hotels"],
        auth=[{"SupabaseJWT": []}],
        request=HotelWriteSerializer,
        responses={
            200: HotelSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def patch(self, request, hotel_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        hotel = visible_hotel_or_404(hotel_id, request.user)
        if not hotel_owner_or_staff(request.user, hotel):
            raise PermissionDenied()
        serializer = HotelWriteSerializer(
            hotel, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(HotelSummarySerializer(serializer.instance).data)

    @extend_schema(
        methods=["DELETE"],
        operation_id="hotels_destroy",
        tags=["Hotels"],
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
    def delete(self, request, hotel_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        hotel = visible_hotel_or_404(hotel_id, request.user)
        if not hotel_owner_or_staff(request.user, hotel):
            raise PermissionDenied()
        if hotel.rooms.filter(bookings__isnull=False).exists():
            raise Conflict("Hotel has bookings.")
        if hotel.reviews.exists():
            raise Conflict("Hotel has reviews.")
        hotel.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LocationListView(APIView):
    permission_classes = [IsStaffOrReadOnly]

    @extend_schema(
        methods=["GET"],
        operation_id="locations_list",
        tags=["Locations"],
        auth=[],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema(
                "PagedLocationList", LocationSummarySerializer
            )
        },
    )
    def get(self, request):
        queryset = Location.objects.all().order_by("name")
        return paginated_response(queryset, request, self, LocationSummarySerializer)

    @extend_schema(
        methods=["POST"],
        operation_id="locations_create",
        tags=["Locations"],
        auth=[{"SupabaseJWT": []}],
        request=LocationWriteSerializer,
        responses={
            201: LocationSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
        },
    )
    def post(self, request):
        serializer = LocationWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        location = serializer.save()
        return Response(
            LocationSummarySerializer(location).data, status=status.HTTP_201_CREATED
        )


class LocationDetailView(APIView):
    permission_classes = [IsStaffOrReadOnly]

    @extend_schema(
        methods=["GET"],
        operation_id="locations_retrieve",
        tags=["Locations"],
        auth=[],
        responses={200: LocationSummarySerializer, 404: DetailErrorSerializer},
    )
    def get(self, request, location_id):
        location = get_object_or_404(Location, pk=location_id)
        return Response(LocationSummarySerializer(location).data)

    @extend_schema(
        methods=["PATCH"],
        operation_id="locations_update",
        tags=["Locations"],
        auth=[{"SupabaseJWT": []}],
        request=LocationWriteSerializer,
        responses={
            200: LocationSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def patch(self, request, location_id):
        location = get_object_or_404(Location, pk=location_id)
        serializer = LocationWriteSerializer(location, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LocationSummarySerializer(serializer.instance).data)

    @extend_schema(
        methods=["DELETE"],
        operation_id="locations_destroy",
        tags=["Locations"],
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
    def delete(self, request, location_id):
        location = get_object_or_404(Location, pk=location_id)
        if location.hotels.exists():
            raise Conflict("Location has hotels.")
        location.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
