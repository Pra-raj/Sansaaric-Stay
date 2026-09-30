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

    class Meta:
        model = Hotel
        fields = [
            "id", "owner_id", "name", "property_type", "location",
            "address", "description", "status", "avg_rating", "created_at",
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
