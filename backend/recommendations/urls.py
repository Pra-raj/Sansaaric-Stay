from django.urls import path

from . import views

urlpatterns = [
    path("api/recommendations", views.RecommendationListView.as_view(), name="recommendation_list"),
    path(
        "api/recommendations/similar/<int:hotel_id>",
        views.SimilarHotelListView.as_view(),
        name="recommendation_similar",
    ),
]