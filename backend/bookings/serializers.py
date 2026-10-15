from rest_framework import serializers

from rooms.models import Room

from .models import Booking


class BookingSummarySerializer(serializers.ModelSerializer):
    room_id = serializers.PrimaryKeyRelatedField(read_only=True)
    hotel_name = serializers.CharField(source="room.hotel.name", read_only=True)
    hotel_location = serializers.CharField(
        source="room.hotel.location.name", read_only=True
    )

    class Meta:
        model = Booking
        fields = [
            "id", "user_id", "room_id", "hotel_name", "hotel_location",
            "check_in", "check_out", "guests",
            "status", "total_amount", "created_at",
        ]
        read_only_fields = fields


class StayDatesMixin:
    def validate(self, attrs):
        instance = self.instance
        check_in = attrs.get("check_in") or getattr(instance, "check_in", None)
        check_out = attrs.get("check_out") or getattr(instance, "check_out", None)
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError({"check_out": "Must be after check_in."})
        return attrs


class BookingCreateSerializer(StayDatesMixin, serializers.ModelSerializer):
    room_id = serializers.PrimaryKeyRelatedField(
        source="room", queryset=Room.objects.all()
    )

    class Meta:
        model = Booking
        fields = ["room_id", "check_in", "check_out", "guests"]


class BookingGuestPatchSerializer(StayDatesMixin, serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ["check_in", "check_out", "guests"]


class BookingStaffPatchSerializer(StayDatesMixin, serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ["check_in", "check_out", "guests", "status", "total_amount"]
