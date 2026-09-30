from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from api.exceptions import Conflict
from api.pagination import paginated_response
from api.permissions import hotel_owner_or_staff
from api.schema import paginated_response_schema
from api.serializers import DetailErrorSerializer
from api.visibility import visible_hotel_or_404, visible_room_or_404

from .models import Room
from .serializers import RoomSummarySerializer, RoomWriteSerializer

PAGINATION_PARAMETERS = [
    OpenApiParameter(
        "page", int, OpenApiParameter.QUERY, description="Page number (1-based)."
    ),
    OpenApiParameter(
        "page_size", int, OpenApiParameter.QUERY, description="Items per page (max 100)."
    ),
]

FIELD_ERRORS = {"type": "object", "additionalProperties": {}}


class HotelRoomListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="rooms_list",
        tags=["Rooms"],
        auth=[],
        parameters=PAGINATION_PARAMETERS,
        responses={
            200: paginated_response_schema("PagedRoomList", RoomSummarySerializer),
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, hotel_id):
        hotel = visible_hotel_or_404(hotel_id, request.user)
        queryset = Room.objects.filter(hotel=hotel)
        return paginated_response(queryset, request, self, RoomSummarySerializer)

    @extend_schema(
        methods=["POST"],
        operation_id="rooms_create",
        tags=["Rooms"],
        auth=[{"SupabaseJWT": []}],
        request=RoomWriteSerializer,
        responses={
            201: RoomSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def post(self, request, hotel_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        hotel = visible_hotel_or_404(hotel_id, request.user)
        if not hotel_owner_or_staff(request.user, hotel):
            raise PermissionDenied()
        serializer = RoomWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = serializer.save(hotel=hotel)
        return Response(RoomSummarySerializer(room).data, status=status.HTTP_201_CREATED)


class RoomDetailView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="rooms_retrieve",
        tags=["Rooms"],
        auth=[],
        responses={200: RoomSummarySerializer, 404: DetailErrorSerializer},
    )
    def get(self, request, room_id):
        room = visible_room_or_404(room_id, request.user)
        return Response(RoomSummarySerializer(room).data)

    @extend_schema(
        methods=["PATCH"],
        operation_id="rooms_update",
        tags=["Rooms"],
        auth=[{"SupabaseJWT": []}],
        request=RoomWriteSerializer,
        responses={
            200: RoomSummarySerializer,
            400: FIELD_ERRORS,
            401: DetailErrorSerializer,
            403: DetailErrorSerializer,
            404: DetailErrorSerializer,
        },
    )
    def patch(self, request, room_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        room = visible_room_or_404(room_id, request.user)
        if not hotel_owner_or_staff(request.user, room.hotel):
            raise PermissionDenied()
        serializer = RoomWriteSerializer(room, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(RoomSummarySerializer(serializer.instance).data)

    @extend_schema(
        methods=["DELETE"],
        operation_id="rooms_destroy",
        tags=["Rooms"],
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
    def delete(self, request, room_id):
        if not request.user.is_authenticated:
            raise NotAuthenticated()
        room = visible_room_or_404(room_id, request.user)
        if not hotel_owner_or_staff(request.user, room.hotel):
            raise PermissionDenied()
        if room.bookings.exists():
            raise Conflict("Room has bookings.")
        room.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
