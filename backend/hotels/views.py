from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Hotel, Location
from .serializers import (
    DetailErrorSerializer,
    HotelCreateSerializer,
    HotelRoomsSerializer,
    HotelSummarySerializer,
    LocationSummarySerializer,
)


def _visible_hotel_or_404(hotel_id, user):
    hotel = get_object_or_404(Hotel.objects.select_related("location"), pk=hotel_id)
    if hotel.status != Hotel.STATUS_PUBLISHED:
        is_owner = bool(
            user
            and user.is_authenticated
            and hotel.owner_id == user.id
        )
        if not is_owner:
            raise NotFound()
    return hotel


@extend_schema(
    methods=["GET"],
    tags=["Hotels"],
    auth=[],
    responses={200: HotelSummarySerializer(many=True)},
)
@extend_schema(
    methods=["POST"],
    tags=["Hotels"],
    auth=[{"SupabaseJWT": []}],
    request=HotelCreateSerializer,
    responses={
        201: HotelSummarySerializer,
        400: {"type": "object", "additionalProperties": {}},
        401: DetailErrorSerializer,
    },
)
class HotelListView(APIView):
    def get(self, request):
        hotels = Hotel.objects.filter(status=Hotel.STATUS_PUBLISHED).select_related("location")
        return Response(HotelSummarySerializer(hotels, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        serializer = HotelCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hotel = serializer.save(owner=request.user)
        return Response(HotelSummarySerializer(hotel).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Hotels"],
    responses={200: HotelSummarySerializer, 404: DetailErrorSerializer},
)
class HotelDetailView(APIView):
    def get(self, request, hotel_id):
        hotel = _visible_hotel_or_404(hotel_id, request.user)
        return Response(HotelSummarySerializer(hotel).data)


@extend_schema(tags=["Hotels"], responses={200: LocationSummarySerializer(many=True)})
class LocationListView(APIView):
    def get(self, request):
        locations = Location.objects.all()
        return Response(LocationSummarySerializer(locations, many=True).data)


@extend_schema(
    tags=["Hotels"],
    auth=[],
    responses={200: HotelRoomsSerializer, 404: DetailErrorSerializer},
)
class HotelRoomsView(APIView):
    def get(self, request, hotel_id):
        hotel = _visible_hotel_or_404(hotel_id, request.user)
        return Response({"hotel_id": hotel.id, "rooms": []})
