from django.conf import settings
from django.db import models


class Location(models.Model):
    name = models.CharField(max_length=120)
    country = models.CharField(max_length=80)
    region = models.CharField(max_length=80, blank=True, default="")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "country", "region"],
                name="unique_location_city",
            )
        ]

    def __str__(self):
        return f"{self.name}, {self.country}"


class Hotel(models.Model):
    PROPERTY_TYPES = [
        ("hotel", "Hotel"),
        ("apartment", "Apartment"),
        ("villa", "Villa"),
        ("resort", "Resort"),
        ("homestay", "Homestay"),
        ("guesthouse", "Guesthouse"),
        ("hostel", "Hostel"),
        ("other", "Other"),
    ]

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ARCHIVED, "Archived"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hotels",
    )
    name = models.CharField(max_length=255)
    property_type = models.CharField(max_length=32, choices=PROPERTY_TYPES)
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name="hotels",
    )
    address = models.CharField(max_length=300, blank=True, default="")
    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True
    )
    avg_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
