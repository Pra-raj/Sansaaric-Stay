from django.urls import path

from . import views

urlpatterns = [
    path("api/hotels/<int:hotel_id>/rooms", views.HotelRoomListView.as_view(), name="hotel_rooms"),
    path("api/rooms/<uuid:room_id>", views.RoomDetailView.as_view(), name="room_detail"),
]
