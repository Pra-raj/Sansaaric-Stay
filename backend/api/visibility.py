from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound

from hotels.models import Hotel
from rooms.models import Room


def _authenticated(user) -> bool:
    return bool(user and user.is_authenticated)


def visible_hotel_or_404(hotel_id, user) -> Hotel:
    hotel = get_object_or_404(Hotel.objects.select_related("location"), pk=hotel_id)
    if hotel.status == Hotel.STATUS_PUBLISHED:
        return hotel
    if _authenticated(user) and (user.is_staff or hotel.owner_id == user.id):
        return hotel
    raise NotFound()


def visible_hotel_list(user):
    queryset = Hotel.objects.select_related("location")
    if not _authenticated(user):
        return queryset.filter(status=Hotel.STATUS_PUBLISHED)
    if user.is_staff:
        return queryset
    return queryset.filter(Q(status=Hotel.STATUS_PUBLISHED) | Q(owner_id=user.id))


def visible_room_or_404(room_id, user) -> Room:
    room = get_object_or_404(Room.objects.select_related("hotel"), pk=room_id)
    if room.hotel.status == Hotel.STATUS_PUBLISHED:
        return room
    if _authenticated(user) and (user.is_staff or room.hotel.owner_id == user.id):
        return room
    raise NotFound()
