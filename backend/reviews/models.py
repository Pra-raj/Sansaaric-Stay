import uuid

from django.conf import settings
from django.db import models


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.PROTECT,
        related_name="reviews",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviews",
    )
    hotel = models.ForeignKey(
        "hotels.Hotel",
        on_delete=models.PROTECT,
        related_name="reviews",
    )
    rating = models.PositiveIntegerField()
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1, rating__lte=5),
                name="review_rating_between_1_and_5",
            ),
            models.UniqueConstraint(
                fields=["booking"],
                name="review_unique_booking",
            ),
        ]

    def __str__(self):
        return f"Review {self.id} by {self.user}"