from rest_framework import serializers

from .models import Hotel, Location


class LocationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "country", "region"]
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


class DetailErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()


class HotelCreateSerializer(serializers.ModelSerializer):
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all()
    )

    class Meta:
        model = Hotel
        fields = ["name", "property_type", "location_id", "address", "description", "status"]


class HotelRoomsSerializer(serializers.Serializer):
    hotel_id = serializers.IntegerField()
    rooms = serializers.ListField(child=serializers.DictField(), default=list)
