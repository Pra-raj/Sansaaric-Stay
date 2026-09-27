from django.urls import path

from . import views

urlpatterns = [
    path("api/hotels", views.HotelListView.as_view(), name="hotel_list"),
    path("api/hotels/<int:hotel_id>", views.HotelDetailView.as_view(), name="hotel_detail"),
    path("api/hotels/<int:hotel_id>/rooms", views.HotelRoomsView.as_view(), name="hotel_rooms"),
    path("api/locations", views.LocationListView.as_view(), name="location_list"),
]
