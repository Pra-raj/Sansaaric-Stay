import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from bookings.models import Booking
from hotels.models import Hotel, Location
from rooms.models import Room

User = get_user_model()


class BookingModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="guest1", password="pw")
        self.owner = User.objects.create_user(username="partner1", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner,
            name="Booking Inn",
            property_type="hotel",
            location=self.location,
        )
        self.room = Room.objects.create(
            hotel=self.hotel,
            name="Standard Twin",
            base_price=Decimal("3000.00"),
            max_guests=2,
            total_units=4,
        )

    def create_booking(self, **kwargs):
        defaults = {
            "user": self.user,
            "room": self.room,
            "check_in": "2026-10-01",
            "check_out": "2026-10-05",
            "guests": 2,
        }
        defaults.update(kwargs)
        return Booking.objects.create(**defaults)

    def test_uuid_primary_key(self):
        booking = self.create_booking()
        self.assertIsInstance(booking.id, uuid.UUID)

    def test_defaults(self):
        booking = self.create_booking()
        self.assertEqual(booking.status, Booking.STATUS_PENDING)
        self.assertEqual(booking.total_amount, Decimal("0.00"))
        self.assertIsNotNone(booking.created_at)

    def test_check_out_must_be_after_check_in(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_booking(check_in="2026-10-05", check_out="2026-10-01")

    def test_room_delete_protected(self):
        self.create_booking()
        with self.assertRaises(ProtectedError):
            self.room.delete()

    def test_user_protected_delete(self):
        self.create_booking()
        with self.assertRaises(ProtectedError):
            self.user.delete()


class BookingCrudApiTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="bkstaff", password="pw", is_staff=True)
        self.guest = User.objects.create_user(username="bkguest", password="pw")
        self.other = User.objects.create_user(username="bkother", password="pw")
        self.owner = User.objects.create_user(username="bkowner", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner, name="Booking Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        self.room = Room.objects.create(
            hotel=self.hotel, name="Standard Twin", base_price=Decimal("3000.00"),
            max_guests=2, total_units=4,
        )
        self.booking = Booking.objects.create(
            user=self.guest, room=self.room, check_in="2026-10-01",
            check_out="2026-10-05", guests=2, status=Booking.STATUS_PENDING,
        )
        self.confirmed = Booking.objects.create(
            user=self.other, room=self.room, check_in="2026-11-01",
            check_out="2026-11-05", guests=1, status=Booking.STATUS_CONFIRMED,
            total_amount=Decimal("12000.00"),
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_list_shows_only_own_bookings(self):
        resp = self.auth(self.guest).get("/api/bookings")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["id"], str(self.booking.id))

    def test_staff_list_shows_all(self):
        resp = self.auth(self.staff).get("/api/bookings")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["count"], 2)

    def test_anonymous_list_401(self):
        resp = APIClient().get("/api/bookings")
        self.assertEqual(resp.status_code, 401)

    def test_create_forces_pending_and_own_user(self):
        resp = self.auth(self.guest).post(
            "/api/bookings",
            {"room_id": str(self.room.id), "check_in": "2026-12-01",
             "check_out": "2026-12-04", "guests": 2, "status": "confirmed",
             "user_id": self.other.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["status"], Booking.STATUS_PENDING)
        self.assertEqual(body["user_id"], self.guest.id)
        self.assertEqual(body["total_amount"], "0.00")

    def test_create_requires_authentication(self):
        resp = APIClient().post(
            "/api/bookings",
            {"room_id": str(self.room.id), "check_in": "2026-12-01",
             "check_out": "2026-12-04", "guests": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_create_unknown_room_400(self):
        resp = self.auth(self.guest).post(
            "/api/bookings",
            {"room_id": str(uuid.uuid4()), "check_in": "2026-12-01",
             "check_out": "2026-12-04", "guests": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("room_id", resp.json())

    def test_create_bad_dates_400_not_500(self):
        resp = self.auth(self.guest).post(
            "/api/bookings",
            {"room_id": str(self.room.id), "check_in": "2026-12-05",
             "check_out": "2026-12-01", "guests": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("check_out", resp.json())

    def test_owner_reads_own_detail(self):
        resp = self.auth(self.guest).get(f"/api/bookings/{self.booking.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["room_id"], str(self.room.id))

    def test_other_users_booking_is_404(self):
        resp = self.auth(self.other).get(f"/api/bookings/{self.booking.id}")
        self.assertEqual(resp.status_code, 404)

    def test_staff_reads_any_booking(self):
        resp = self.auth(self.staff).get(f"/api/bookings/{self.confirmed.id}")
        self.assertEqual(resp.status_code, 200)

    def test_guest_patches_dates_and_guests(self):
        resp = self.auth(self.guest).patch(
            f"/api/bookings/{self.booking.id}",
            {"check_in": "2026-10-02", "check_out": "2026-10-06", "guests": 3},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["check_in"], "2026-10-02")
        self.assertEqual(body["guests"], 3)

    def test_guest_cannot_patch_status(self):
        resp = self.auth(self.guest).patch(
            f"/api/bookings/{self.booking.id}", {"status": "confirmed"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_guest_cannot_patch_total_amount(self):
        resp = self.auth(self.guest).patch(
            f"/api/bookings/{self.booking.id}", {"total_amount": "1.00"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_guest_cannot_patch_room(self):
        resp = self.auth(self.guest).patch(
            f"/api/bookings/{self.booking.id}", {"room_id": str(self.room.id)}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_guest_cannot_patch_confirmed_booking(self):
        resp = self.auth(self.other).patch(
            f"/api/bookings/{self.confirmed.id}", {"guests": 2}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_guest_patch_bad_dates_400(self):
        resp = self.auth(self.guest).patch(
            f"/api/bookings/{self.booking.id}", {"check_out": "2026-09-01"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_staff_patches_status_and_total(self):
        resp = self.auth(self.staff).patch(
            f"/api/bookings/{self.booking.id}",
            {"status": "confirmed", "total_amount": "15000.00"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["status"], "confirmed")
        self.assertEqual(body["total_amount"], "15000.00")

    def test_staff_cannot_change_room(self):
        resp = self.auth(self.staff).patch(
            f"/api/bookings/{self.booking.id}", {"room_id": str(self.room.id)}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_patch_401(self):
        resp = APIClient().patch(
            f"/api/bookings/{self.booking.id}", {"guests": 1}, format="json"
        )
        self.assertEqual(resp.status_code, 401)

    def test_guest_deletes_pending_booking(self):
        resp = self.auth(self.guest).delete(f"/api/bookings/{self.booking.id}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Booking.objects.filter(pk=self.booking.id).exists())

    def test_guest_cannot_delete_confirmed(self):
        resp = self.auth(self.other).delete(f"/api/bookings/{self.confirmed.id}")
        self.assertEqual(resp.status_code, 403)

    def test_staff_deletes_confirmed(self):
        resp = self.auth(self.staff).delete(f"/api/bookings/{self.confirmed.id}")
        self.assertEqual(resp.status_code, 204)

    def test_delete_reviewed_booking_is_409(self):
        from reviews.models import Review
        Review.objects.create(
            booking=self.booking, user=self.guest, hotel=self.hotel, rating=5,
        )
        resp = self.auth(self.staff).delete(f"/api/bookings/{self.booking.id}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("detail", resp.json())


class AdminBookingEndpointTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="admstaff", password="pw", is_staff=True)
        self.guest = User.objects.create_user(
            username="admguest", password="pw", first_name="Asha", last_name="Guest",
            email="asha@example.com",
        )
        self.other = User.objects.create_user(username="admother", password="pw")
        self.owner = User.objects.create_user(username="admowner", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner, name="Booking Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        self.room = Room.objects.create(
            hotel=self.hotel, name="Standard Twin", base_price=Decimal("3000.00"),
            max_guests=2, total_units=4,
        )
        self.pending = Booking.objects.create(
            user=self.guest, room=self.room, check_in="2026-10-01",
            check_out="2026-10-05", guests=2, status=Booking.STATUS_PENDING,
        )
        self.done = Booking.objects.create(
            user=self.other, room=self.room, check_in="2026-09-01",
            check_out="2026-09-03", guests=1, status=Booking.STATUS_COMPLETED,
            total_amount=Decimal("6000.00"),
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_gating(self):
        self.assertEqual(APIClient().get("/api/admin/bookings").status_code, 403)
        self.assertEqual(self.auth(self.guest).get("/api/admin/bookings").status_code, 403)
        self.assertEqual(APIClient().get("/api/admin/revenue").status_code, 403)

    def test_list_shows_all_with_shapes(self):
        rows = self.auth(self.staff).get("/api/admin/bookings").json()
        self.assertEqual(len(rows), 2)
        by_id = {row["id"]: row for row in rows}
        pending = by_id[str(self.pending.id)]
        self.assertEqual(pending["guestName"], "Asha Guest")
        self.assertEqual(pending["guestEmail"], "asha@example.com")
        self.assertEqual(pending["hotelName"], "Booking Inn")
        self.assertEqual(pending["location"], "Pokhara")
        self.assertEqual(pending["checkIn"], "2026-10-01")
        self.assertEqual(pending["status"], "Upcoming")
        self.assertEqual(pending["totalAmount"], 0.0)
        self.assertIn("bookedAt", pending)
        self.assertEqual(by_id[str(self.done.id)]["status"], "Completed")

    def test_status_filter(self):
        rows = self.auth(self.staff).get("/api/admin/bookings?status=completed").json()
        self.assertEqual([row["id"] for row in rows], [str(self.done.id)])

    def test_revenue_math(self):
        self.pending.total_amount = Decimal("8000.00")
        self.pending.save(update_fields=["total_amount"])
        Booking.objects.create(
            user=self.guest, room=self.room, check_in="2026-10-10",
            check_out="2026-10-12", guests=1, status=Booking.STATUS_CANCELLED,
            total_amount=Decimal("9999.00"),
        )
        body = self.auth(self.staff).get("/api/admin/revenue").json()
        # Pending counts as paid (only cancelled is excluded), like the mock.
        self.assertEqual(body["totalRevenue"], 14000.0)
        self.assertEqual(body["totalBookings"], 2)
        self.assertEqual(body["cancelledBookings"], 1)
        self.assertEqual(body["averageBooking"], 7000.0)
        self.assertEqual(
            body["months"],
            [
                {"month": "2026-09", "revenue": 6000.0, "bookings": 1},
                {"month": "2026-10", "revenue": 8000.0, "bookings": 1},
            ],
        )

    def test_revenue_empty(self):
        Booking.objects.all().delete()
        body = self.auth(self.staff).get("/api/admin/revenue").json()
        self.assertEqual(
            body,
            {"totalRevenue": 0.0, "totalBookings": 0, "cancelledBookings": 0,
             "averageBooking": 0, "months": []},
        )
