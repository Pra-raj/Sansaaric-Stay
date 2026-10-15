from django.contrib.auth import get_user_model
from rest_framework import serializers

from auth.models import Profile

from .models import Hotel, Location

User = get_user_model()


class LocationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "region", "latitude", "longitude"]
        read_only_fields = fields


class HotelSummarySerializer(serializers.ModelSerializer):
    owner_id = serializers.IntegerField(read_only=True)
    location = LocationSummarySerializer(read_only=True)
    # Cheapest room, annotated by api.visibility.visible_hotel_*.
    min_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = Hotel
        fields = [
            "id", "owner_id", "name", "property_type", "location",
            "address", "description", "status", "avg_rating", "min_price",
            "created_at",
        ]
        read_only_fields = fields


class HotelWriteSerializer(serializers.ModelSerializer):
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all()
    )
    status = serializers.ChoiceField(choices=Hotel.STATUS_CHOICES, required=False)

    class Meta:
        model = Hotel
        fields = ["name", "property_type", "location_id", "address", "description", "status"]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.is_staff:
            return attrs
        if "status" in self.initial_data:
            raise serializers.ValidationError({"status": "Only staff can change status."})
        attrs["status"] = Hotel.STATUS_DRAFT
        return attrs


class HotelStaffCreateSerializer(HotelWriteSerializer):
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.filter(is_staff=False, profile__role=Profile.ROLE_HOTEL_OWNER),
    )

    class Meta(HotelWriteSerializer.Meta):
        fields = HotelWriteSerializer.Meta.fields + ["owner_id"]

    def validate_owner_id(self, value):
        request = self.context.get("request")
        if value == request.user:
            raise serializers.ValidationError("A hotel cannot be owned by yourself.")
        return value


class LocationWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["name", "region", "latitude", "longitude"]


# ----- Admin dashboard shapes -------------------------------------------------
# The admin UI works with camelCase display shapes (see frontend/src/types),
# so these serializers emit them directly instead of the snake_case public
# shapes above. Status values are mapped to the admin labels the UI renders.


def admin_hotel_status(hotel: Hotel) -> str:
    return "Active" if hotel.status == Hotel.STATUS_PUBLISHED else "Inactive"


class AdminHotelSerializer(serializers.ModelSerializer):
    """Flat admin row: location name, cheapest-room price, no amenities store.

    `amenities` is always [] and `startingPrice` is 0 without rooms —
    shortcut: the Hotel model has no amenities/price columns, so the admin
    form values for those fields are accepted but not persisted. Upgrade by
    adding columns (or a rooms flow) and wiring them here.
    """

    id = serializers.CharField(read_only=True)
    location = serializers.CharField(source="location.name", read_only=True)
    propertyType = serializers.CharField(source="property_type", read_only=True)
    startingPrice = serializers.SerializerMethodField()
    amenities = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Hotel
        fields = [
            "id", "name", "location", "propertyType", "startingPrice",
            "description", "amenities", "status",
        ]
        read_only_fields = fields

    def get_startingPrice(self, hotel: Hotel) -> float:
        return float(hotel.min_price) if hotel.min_price is not None else 0

    def get_amenities(self, hotel: Hotel) -> list:
        return []

    def get_status(self, hotel: Hotel) -> str:
        return admin_hotel_status(hotel)


class AdminHotelWriteSerializer(serializers.Serializer):
    """Accepts the admin form payload; location is a name, not an id."""

    name = serializers.CharField(max_length=255)
    location = serializers.CharField(max_length=120)
    propertyType = serializers.CharField(max_length=32, required=False, default="homestay")
    startingPrice = serializers.FloatField(required=False, default=0)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    amenities = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    status = serializers.ChoiceField(
        choices=["Active", "Inactive"], required=False, default="Active"
    )

    def validate_location(self, value: str):
        location = Location.objects.filter(name__iexact=value.strip()).first()
        if location is None:
            raise serializers.ValidationError("Unknown location.")
        return location

    def validate_propertyType(self, value: str):
        choices = {choice: choice for choice, _label in Hotel.PROPERTY_TYPES}
        lowered = value.strip().lower()
        if lowered not in choices:
            raise serializers.ValidationError(
                f"Unknown property type. Choices: {sorted(choices)}."
            )
        return choices[lowered]

    def to_hotel_kwargs(self) -> dict:
        """Only keys the caller sent (PATCH is partial); write-path only."""
        data = self.validated_data
        kwargs = {}
        if "name" in data:
            kwargs["name"] = data["name"].strip()
        if "location" in data:
            kwargs["location"] = data["location"]
        if "propertyType" in data:
            kwargs["property_type"] = data["propertyType"]
        if "description" in data:
            kwargs["description"] = data["description"]
        if "status" in data:
            kwargs["status"] = (
                Hotel.STATUS_PUBLISHED
                if data["status"] == "Active"
                else Hotel.STATUS_ARCHIVED
            )
        return kwargs
