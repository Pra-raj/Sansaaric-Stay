from django.urls import path

from . import views

urlpatterns = [
    path("api/hotels", views.HotelListView.as_view(), name="hotel_list"),
    path("api/hotels/<int:hotel_id>", views.HotelDetailView.as_view(), name="hotel_detail"),
    path("api/locations", views.LocationListView.as_view(), name="location_list"),
    path(
        "api/locations/<uuid:location_id>",
        views.LocationDetailView.as_view(),
        name="location_detail",
    ),
    path("api/admin/hotels", views.AdminHotelListView.as_view(), name="admin_hotel_list"),
    path(
        "api/admin/hotels/<int:hotel_id>",
        views.AdminHotelDetailView.as_view(),
        name="admin_hotel_detail",
    ),
]
