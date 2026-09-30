from rest_framework import serializers

from .models import Room


class RoomSummarySerializer(serializers.ModelSerializer):
    hotel_id = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Room
        fields = ["id", "hotel_id", "name", "base_price", "max_guests", "total_units"]
        read_only_fields = fields


class RoomWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["name", "base_price", "max_guests", "total_units"]
