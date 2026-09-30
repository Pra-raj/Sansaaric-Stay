from django.urls import path

from . import views

urlpatterns = [
    path("api/hotels/<int:hotel_id>/reviews", views.HotelReviewListView.as_view(), name="hotel_reviews"),
    path("api/reviews", views.ReviewListView.as_view(), name="review_list"),
    path("api/reviews/<uuid:review_id>", views.ReviewDetailView.as_view(), name="review_detail"),
]
