from rest_framework import serializers

from bookings.models import Booking

from .models import Review


class PublicReviewSerializer(serializers.ModelSerializer):
    """Reviewer identity is never exposed; hotel_id is public and useful for navigation."""

    class Meta:
        model = Review
        fields = ["id", "booking_id", "hotel_id", "rating", "comment", "created_at"]
        read_only_fields = fields


class ReviewCreateSerializer(serializers.ModelSerializer):
    booking_id = serializers.PrimaryKeyRelatedField(
        source="booking", queryset=Booking.objects.all()
    )
    rating = serializers.IntegerField(
        min_value=1, max_value=5
    )

    class Meta:
        model = Review
        fields = ["booking_id", "rating", "comment"]


class ReviewWriteSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(
        min_value=1, max_value=5, required=False
    )

    class Meta:
        model = Review
        fields = ["rating", "comment"]
