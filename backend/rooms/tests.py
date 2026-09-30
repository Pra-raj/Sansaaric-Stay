import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from hotels.models import Hotel, Location
from rooms.models import Room

User = get_user_model()


class RoomModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="partner1", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner,
            name="Roomy Inn",
            property_type="hotel",
            location=self.location,
            status=Hotel.STATUS_PUBLISHED,
        )

    def create_room(self, **kwargs):
        defaults = {
            "hotel": self.hotel,
            "name": "Deluxe King",
            "base_price": Decimal("4500.00"),
            "max_guests": 2,
            "total_units": 5,
        }
        defaults.update(kwargs)
        return Room.objects.create(**defaults)

    def test_uuid_primary_key(self):
        room = self.create_room()
        self.assertIsInstance(room.id, uuid.UUID)

    def test_hotel_delete_protected(self):
        self.create_room()
        with self.assertRaises(ProtectedError):
            self.hotel.delete()

    def test_base_price_required(self):
        room = Room(
            hotel=self.hotel, name="No Price", max_guests=1, total_units=1
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                room.save()


class RoomCrudApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(username="roomstaff", password="pw", is_staff=True)
        self.owner = User.objects.create_user(username="roomowner", password="pw")
        self.other = User.objects.create_user(username="roomother", password="pw")
        self.guest = User.objects.create_user(username="roomguest", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner, name="Roomy Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        self.draft = Hotel.objects.create(
            owner=self.owner, name="Draft Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_DRAFT,
        )
        self.room = Room.objects.create(
            hotel=self.hotel, name="Deluxe King", base_price=Decimal("4500.00"),
            max_guests=2, total_units=5,
        )
        self.hidden_room = Room.objects.create(
            hotel=self.draft, name="Hidden Suite", base_price=Decimal("9000.00"),
            max_guests=4, total_units=1,
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_list_public_returns_rooms_of_published_hotels_only(self):
        resp = APIClient().get(f"/api/hotels/{self.hotel.pk}/rooms")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["name"], "Deluxe King")
        self.assertEqual(body["results"][0]["base_price"], "4500.00")

    def test_list_hides_rooms_of_draft_hotels_from_anonymous(self):
        resp = APIClient().get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 404)

    def test_owner_sees_own_draft_rooms(self):
        resp = self.auth(self.owner).get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["results"][0]["name"], "Hidden Suite")

    def test_other_partner_cannot_see_draft_rooms(self):
        resp = self.auth(self.other).get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 404)

    def test_staff_sees_draft_rooms(self):
        resp = self.auth(self.staff).get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 200)

    def test_list_unknown_hotel_404(self):
        resp = APIClient().get("/api/hotels/999999/rooms")
        self.assertEqual(resp.status_code, 404)

    def test_list_respects_page_size(self):
        for index in range(3):
            Room.objects.create(
                hotel=self.hotel, name=f"Extra {index}",
                base_price=Decimal("100.00"), max_guests=1, total_units=1,
            )
        resp = APIClient().get(f"/api/hotels/{self.hotel.pk}/rooms?page_size=2")
        body = resp.json()
        self.assertEqual(body["count"], 4)
        self.assertEqual(len(body["results"]), 2)

    def test_public_detail(self):
        resp = APIClient().get(f"/api/rooms/{self.room.pk}")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["name"], "Deluxe King")
        self.assertEqual(body["hotel_id"], self.hotel.id)

    def test_detail_of_hidden_room_404_for_anonymous(self):
        resp = APIClient().get(f"/api/rooms/{self.hidden_room.pk}")
        self.assertEqual(resp.status_code, 404)

    def test_owner_creates_room(self):
        resp = self.auth(self.owner).post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "Twin", "base_price": "3200.00", "max_guests": 2, "total_units": 3},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["hotel_id"], self.hotel.id)

    def test_client_hotel_id_is_ignored(self):
        resp = self.auth(self.owner).post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "Twin", "base_price": "3200.00", "max_guests": 2,
             "total_units": 3, "hotel_id": str(self.draft.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["hotel_id"], self.hotel.id)

    def test_create_missing_price_400(self):
        resp = self.auth(self.owner).post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "No Price", "max_guests": 2, "total_units": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("base_price", resp.json())

    def test_guest_cannot_create(self):
        resp = self.auth(self.guest).post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "Nope", "base_price": "100.00", "max_guests": 1, "total_units": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_other_partner_cannot_create(self):
        resp = self.auth(self.other).post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "Nope", "base_price": "100.00", "max_guests": 1, "total_units": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_cannot_create(self):
        resp = APIClient().post(
            f"/api/hotels/{self.hotel.pk}/rooms",
            {"name": "Nope", "base_price": "100.00", "max_guests": 1, "total_units": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_staff_creates_room_for_draft_hotel(self):
        resp = self.auth(self.staff).post(
            f"/api/hotels/{self.draft.pk}/rooms",
            {"name": "Staff Room", "base_price": "500.00", "max_guests": 1,
             "total_units": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_owner_patch(self):
        resp = self.auth(self.owner).patch(
            f"/api/rooms/{self.room.pk}", {"base_price": "5000.00"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["base_price"], "5000.00")

    def test_patch_cannot_change_hotel(self):
        resp = self.auth(self.owner).patch(
            f"/api/rooms/{self.room.pk}", {"hotel_id": str(self.draft.id)}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["hotel_id"], self.hotel.id)

    def test_other_partner_patch_is_403(self):
        resp = self.auth(self.other).patch(
            f"/api/rooms/{self.room.pk}", {"name": "Hijack"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_owner_delete_unbooked_room_is_204(self):
        extra = Room.objects.create(
            hotel=self.hotel, name="Spare", base_price=Decimal("100.00"),
            max_guests=1, total_units=1,
        )
        resp = self.auth(self.owner).delete(f"/api/rooms/{extra.pk}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Room.objects.filter(pk=extra.pk).exists())

    def test_delete_booked_room_is_409(self):
        from bookings.models import Booking
        Booking.objects.create(
            room=self.room, user=self.guest, check_in="2026-01-01",
            check_out="2026-01-03", guests=1, total_amount=Decimal("9000.00"),
        )
        resp = self.auth(self.owner).delete(f"/api/rooms/{self.room.pk}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("detail", resp.json())

    def test_staff_deletes_any_room(self):
        resp = self.auth(self.staff).delete(f"/api/rooms/{self.room.pk}")
        self.assertEqual(resp.status_code, 204)

    def test_other_stub_endpoint_is_gone(self):
        resp = APIClient().get(f"/api/rooms/{self.room.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("rooms", resp.json())
