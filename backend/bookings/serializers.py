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


# ----- Admin dashboard shapes -------------------------------------------------
# CamelCase display rows for the admin UI (see frontend/src/types), emitted
# directly like the inbox serializers do.


def admin_booking_status(booking: Booking) -> str:
    if booking.status == Booking.STATUS_COMPLETED:
        return "Completed"
    if booking.status == Booking.STATUS_CANCELLED:
        return "Cancelled"
    return "Upcoming"


def guest_display_name(user) -> str:
    if user is None:
        return "Guest"
    return user.get_full_name() or user.email or user.username or "Guest"


class AdminBookingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    guestName = serializers.SerializerMethodField()
    guestEmail = serializers.SerializerMethodField()
    hotelName = serializers.CharField(source="room.hotel.name", read_only=True)
    location = serializers.CharField(
        source="room.hotel.location.name", read_only=True
    )
    checkIn = serializers.DateField(source="check_in", read_only=True)
    checkOut = serializers.DateField(source="check_out", read_only=True)
    totalAmount = serializers.SerializerMethodField()
    bookedAt = serializers.DateTimeField(source="created_at", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "guestName", "guestEmail", "hotelName", "location",
            "checkIn", "checkOut", "guests", "status", "totalAmount",
            "bookedAt",
        ]
        read_only_fields = fields

    def get_guestName(self, booking: Booking) -> str:
        return guest_display_name(booking.user)

    def get_guestEmail(self, booking: Booking) -> str:
        return booking.user.email if booking.user else ""

    def get_totalAmount(self, booking: Booking) -> float:
        return float(booking.total_amount)

    def get_status(self, booking: Booking) -> str:
        return admin_booking_status(booking)


class RevenueMonthSerializer(serializers.Serializer):
    month = serializers.CharField()
    revenue = serializers.FloatField()
    bookings = serializers.IntegerField()


class RevenueSummarySerializer(serializers.Serializer):
    totalRevenue = serializers.FloatField()
    totalBookings = serializers.IntegerField()
    cancelledBookings = serializers.IntegerField()
    averageBooking = serializers.FloatField()
    months = RevenueMonthSerializer(many=True)
