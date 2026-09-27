from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from hotels.models import Hotel, Location

User = get_user_model()


class LocationModelTests(TestCase):
    def test_region_defaults_blank(self):
        loc = Location.objects.create(name="Kathmandu", country="Nepal")
        self.assertEqual(loc.region, "")
        self.assertEqual(str(loc), "Kathmandu, Nepal")

    def test_unique_constraint_rejects_duplicate(self):
        Location.objects.create(name="Pokhara", country="Nepal", region="Gandaki")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Location.objects.create(name="Pokhara", country="Nepal", region="Gandaki")


class HotelModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="partner1", password="pw")
        self.location = Location.objects.create(name="Pokhara", country="Nepal")

    def test_defaults(self):
        hotel = Hotel.objects.create(
            owner=self.owner, name="Test Hotel",
            property_type="hotel", location=self.location,
        )
        self.assertEqual(hotel.status, Hotel.STATUS_DRAFT)
        self.assertEqual(hotel.avg_rating, Decimal("0.00"))
        self.assertIsNotNone(hotel.created_at)
        self.assertIsNotNone(hotel.updated_at)
        self.assertEqual(str(hotel), "Test Hotel")

    def test_location_delete_protected(self):
        Hotel.objects.create(
            owner=self.owner, name="Test Hotel",
            property_type="hotel", location=self.location,
        )
        with self.assertRaises(ProtectedError):
            self.location.delete()

    def test_owner_cascade_deletes_hotel(self):
        hotel = Hotel.objects.create(
            owner=self.owner, name="Test Hotel",
            property_type="hotel", location=self.location,
        )
        self.owner.delete()
        self.assertFalse(Hotel.objects.filter(pk=hotel.pk).exists())


from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient


class HotelAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.pokhara = Location.objects.create(name="Pokhara", country="Nepal", region="Gandaki")
        self.lalitpur = Location.objects.create(name="Lalitpur", country="Nepal")
        Location.objects.create(name="Kathmandu", country="Nepal")
        self.partner = User.objects.create_user(username="partner1", password="pw")
        self.other = User.objects.create_user(username="partner2", password="pw")
        self.published = Hotel.objects.create(
            owner=self.partner, name="Published Inn", property_type="hotel",
            location=self.pokhara, address="Lakeside", description="Nice",
            status=Hotel.STATUS_PUBLISHED,
        )
        self.draft = Hotel.objects.create(
            owner=self.partner, name="Draft Inn", property_type="apartment",
            location=self.pokhara, status=Hotel.STATUS_DRAFT,
        )
        Hotel.objects.create(
            owner=self.partner, name="Old Inn", property_type="hostel",
            location=self.pokhara, status=Hotel.STATUS_ARCHIVED,
        )

    def test_list_returns_only_published_newest_first(self):
        Hotel.objects.filter(pk=self.published.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        newer = Hotel.objects.create(
            owner=self.partner, name="Newer Inn", property_type="hotel",
            location=self.pokhara, status=Hotel.STATUS_PUBLISHED,
        )
        resp = self.client.get("/api/hotels")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual([h["name"] for h in body], ["Newer Inn", "Published Inn"])
        self.assertEqual(body[0]["location"]["name"], "Pokhara")
        self.assertEqual(body[0]["owner_id"], self.partner.id)

    def test_detail_published_visible_to_anonymous(self):
        resp = self.client.get(f"/api/hotels/{self.published.pk}")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["name"], "Published Inn")
        self.assertEqual(body["status"], "published")
        self.assertEqual(body["avg_rating"], "0.00")

    def test_detail_draft_404_for_anonymous(self):
        resp = self.client.get(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 404)

    def test_detail_draft_200_for_owner(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Draft Inn")

    def test_detail_draft_404_for_other_user(self):
        self.client.force_authenticate(user=self.other)
        resp = self.client.get(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 404)

    def test_detail_unknown_hotel_404(self):
        resp = self.client.get("/api/hotels/999999")
        self.assertEqual(resp.status_code, 404)

    def test_locations_list_ordered_by_name(self):
        resp = self.client.get("/api/locations")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([loc["name"] for loc in resp.json()], ["Kathmandu", "Lalitpur", "Pokhara"])

    def test_create_requires_authentication(self):
        resp = self.client.post("/api/hotels", {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_create_returns_201_and_defaults_draft(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {
                "name": "New Stay",
                "property_type": "villa",
                "location_id": self.pokhara.id,
                "address": "Lakeside 2",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["name"], "New Stay")
        self.assertEqual(body["status"], Hotel.STATUS_DRAFT)
        self.assertEqual(body["owner_id"], self.partner.id)
        self.assertEqual(body["location"]["id"], self.pokhara.id)
        self.assertEqual(body["avg_rating"], "0.00")

    def test_create_owner_ignores_client_owner_id(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {
                "name": "Spoofed",
                "property_type": "hotel",
                "location_id": self.pokhara.id,
                "owner_id": self.other.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["owner_id"], self.partner.id)

    def test_create_accepts_explicit_published_status(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {
                "name": "Live Now",
                "property_type": "hotel",
                "location_id": self.pokhara.id,
                "status": Hotel.STATUS_PUBLISHED,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["status"], Hotel.STATUS_PUBLISHED)

    def test_create_invalid_property_type_400(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {"name": "Bad", "property_type": "castle", "location_id": self.pokhara.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("property_type", resp.json())

    def test_create_missing_name_400(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {"property_type": "hotel", "location_id": self.pokhara.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("name", resp.json())

    def test_create_unknown_location_400(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.post(
            "/api/hotels",
            {"name": "Away", "property_type": "hotel", "location_id": 999999},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("location_id", resp.json())

    def test_rooms_contract_returns_empty_for_published(self):
        resp = self.client.get(f"/api/hotels/{self.published.pk}/rooms")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"hotel_id": self.published.pk, "rooms": []})

    def test_rooms_contract_404_for_hidden_draft_anonymous(self):
        resp = self.client.get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 404)

    def test_rooms_contract_ok_for_owner_of_draft(self):
        self.client.force_authenticate(user=self.partner)
        resp = self.client.get(f"/api/hotels/{self.draft.pk}/rooms")
        self.assertEqual(resp.status_code, 200)

    def test_rooms_contract_404_unknown_hotel(self):
        resp = self.client.get("/api/hotels/999999/rooms")
        self.assertEqual(resp.status_code, 404)

