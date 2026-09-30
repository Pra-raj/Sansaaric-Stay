from django.urls import path

from . import views

urlpatterns = [
    path("api/bookings", views.BookingListView.as_view(), name="booking_list"),
    path("api/bookings/<uuid:booking_id>", views.BookingDetailView.as_view(), name="booking_detail"),
]
