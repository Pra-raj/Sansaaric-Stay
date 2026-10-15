import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from auth.models import Profile
from hotels.models import Hotel, Location

User = get_user_model()


class LocationModelTests(TestCase):
    def test_region_defaults_blank(self):
        loc = Location.objects.create(name="Kathmandu")
        self.assertEqual(loc.region, "")
        self.assertEqual(str(loc), "Kathmandu")

    def test_str_with_region(self):
        loc = Location.objects.create(name="Pokhara", region="Gandaki")
        self.assertEqual(str(loc), "Pokhara (Gandaki)")

    def test_uuid_primary_key(self):
        loc = Location.objects.create(name="Kathmandu")
        self.assertIsInstance(loc.id, uuid.UUID)
        self.assertEqual(Location.objects.get(pk=loc.pk).pk, loc.id)

    def test_lat_long_default_null(self):
        loc = Location.objects.create(name="Kathmandu")
        self.assertIsNone(loc.latitude)
        self.assertIsNone(loc.longitude)

    def test_lat_long_store_decimal(self):
        loc = Location.objects.create(
            name="Pokhara",
            latitude=Decimal("28.209583"),
            longitude=Decimal("83.985566"),
        )
        saved = Location.objects.get(pk=loc.pk)
        self.assertEqual(saved.latitude, Decimal("28.209583"))
        self.assertEqual(saved.longitude, Decimal("83.985566"))


class HotelModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="partner1", password="pw")
        self.location = Location.objects.create(name="Pokhara")

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


class HotelAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.pokhara = Location.objects.create(name="Pokhara", region="Gandaki")
        self.lalitpur = Location.objects.create(name="Lalitpur")
        self.kathmandu = Location.objects.create(name="Kathmandu", region="Bagmati")
        self.partner = User.objects.create_user(username="partner1", password="pw")
        self.other = User.objects.create_user(username="partner2", password="pw")
        Profile.objects.create(
            user=self.partner, supabase_uid=uuid.uuid4(), role=Profile.ROLE_HOTEL_OWNER
        )
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
        body = resp.json()["results"]
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

    def test_list_is_paginated_envelope(self):
        resp = self.client.get("/api/hotels")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(set(body), {"count", "next", "previous", "results"})
        self.assertEqual(body["count"], 1)
        self.assertIsNone(body["next"])

    def test_locations_list_ordered_by_name(self):
        resp = self.client.get("/api/locations")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()["results"]
        self.assertEqual([loc["name"] for loc in body], ["Kathmandu", "Lalitpur", "Pokhara"])
        self.assertEqual(body[0]["id"], str(self.kathmandu.id))
        self.assertEqual(body[0]["region"], "Bagmati")
        self.assertIn("latitude", body[0])
        self.assertIn("longitude", body[0])

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
        self.assertEqual(body["location"]["id"], str(self.pokhara.id))
        self.assertIn("latitude", body["location"])
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

    def test_create_status_is_rejected(self):
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
        self.assertEqual(resp.status_code, 400)
        self.assertIn("status", resp.json())

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
            {
                "name": "Away",
                "property_type": "hotel",
                "location_id": "00000000-0000-0000-0000-000000000000",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("location_id", resp.json())

    def test_rooms_contract_removed_from_hotels_app(self):
        # The empty-rooms stub moved to rooms/ and now returns real rooms.
        resp = self.client.get(f"/api/hotels/{self.published.pk}/rooms")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("results", resp.json())


class HotelCrudApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.location = Location.objects.create(name="Pokhara", region="Gandaki")
        self.staff = User.objects.create_user(username="staffer", password="pw", is_staff=True)
        self.owner = User.objects.create_user(username="partnerA", password="pw")
        self.others = User.objects.create_user(username="partnerB", password="pw")
        self.guest = User.objects.create_user(username="guest", password="pw")
        Profile.objects.create(
            user=self.owner, supabase_uid=uuid.uuid4(), role=Profile.ROLE_HOTEL_OWNER
        )
        Profile.objects.create(
            user=self.others, supabase_uid=uuid.uuid4(), role=Profile.ROLE_HOTEL_OWNER
        )
        Profile.objects.create(user=self.guest, supabase_uid=uuid.uuid4())
        self.hotel = Hotel.objects.create(
            owner=self.owner, name="Test Hotel", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        self.draft = Hotel.objects.create(
            owner=self.owner, name="Partner Draft", property_type="apartment",
            location=self.location, status=Hotel.STATUS_DRAFT,
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_list_public_shows_published_only(self):
        resp = APIClient().get("/api/hotels")
        self.assertEqual(resp.status_code, 200)
        names = [h["name"] for h in resp.json()["results"]]
        self.assertEqual(names, ["Test Hotel"])

    def test_owner_list_includes_own_draft(self):
        resp = self.auth(self.owner).get("/api/hotels")
        names = [h["name"] for h in resp.json()["results"]]
        self.assertEqual(names, ["Partner Draft", "Test Hotel"])

    def test_staff_list_includes_all_drafts(self):
        resp = self.auth(self.staff).get("/api/hotels")
        names = [h["name"] for h in resp.json()["results"]]
        self.assertIn("Partner Draft", names)

    def test_other_list_hides_foreign_drafts(self):
        resp = self.auth(self.others).get("/api/hotels")
        names = [h["name"] for h in resp.json()["results"]]
        self.assertEqual(names, ["Test Hotel"])

    def test_list_respects_page_size_param(self):
        for index in range(5):
            Hotel.objects.create(
                owner=self.owner, name=f"Extra {index}", property_type="hotel",
                location=self.location, status=Hotel.STATUS_PUBLISHED,
            )
        resp = self.auth(self.owner).get("/api/hotels?page_size=2")
        body = resp.json()
        self.assertEqual(body["count"], 7)
        self.assertEqual(len(body["results"]), 2)

    def test_owner_create_forces_draft(self):
        resp = self.auth(self.owner).post(
            "/api/hotels",
            {"name": "New Draft", "property_type": "villa", "location_id": str(self.location.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["status"], Hotel.STATUS_DRAFT)
        self.assertEqual(body["owner_id"], self.owner.id)

    def test_staff_create_can_publish_and_set_owner(self):
        resp = self.auth(self.staff).post(
            "/api/hotels",
            {"name": "Staff Published", "property_type": "hotel",
             "location_id": str(self.location.id), "status": "published",
             "owner_id": self.owner.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["status"], Hotel.STATUS_PUBLISHED)
        self.assertEqual(body["owner_id"], self.owner.id)

    def test_staff_cannot_assign_staff_owner(self):
        resp = self.auth(self.staff).post(
            "/api/hotels",
            {"name": "Bad Owner", "property_type": "hotel", "location_id": str(self.location.id),
             "owner_id": self.staff.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner_id", resp.json())

    def test_staff_cannot_assign_guest_role_as_owner(self):
        resp = self.auth(self.staff).post(
            "/api/hotels",
            {"name": "Guest Owner", "property_type": "hotel",
             "location_id": str(self.location.id), "owner_id": self.guest.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner_id", resp.json())

    def test_staff_create_requires_owner_id(self):
        resp = self.auth(self.staff).post(
            "/api/hotels",
            {"name": "No Owner", "property_type": "hotel", "location_id": str(self.location.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("owner_id", resp.json())

    def test_guest_cannot_create(self):
        resp = self.auth(self.guest).post(
            "/api/hotels",
            {"name": "Nope", "property_type": "hotel", "location_id": str(self.location.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Hotel.objects.filter(name="Nope").exists())

    def test_user_without_profile_cannot_create(self):
        profileless = User.objects.create_user(username="profileless", password="pw")
        resp = self.auth(profileless).post(
            "/api/hotels",
            {"name": "Also Nope", "property_type": "hotel",
             "location_id": str(self.location.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_staff_detail_sees_partner_draft(self):
        resp = self.auth(self.staff).get(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 200)

    def test_other_partner_cannot_see_draft(self):
        resp = self.auth(self.others).get(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 404)

    def test_owner_patch_forces_published_back_to_draft(self):
        self.hotel.status = Hotel.STATUS_PUBLISHED
        self.hotel.save()
        resp = self.auth(self.owner).patch(
            f"/api/hotels/{self.hotel.pk}", {"address": "New Road"}, format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.hotel.refresh_from_db()
        self.assertEqual(self.hotel.status, Hotel.STATUS_DRAFT)

    def test_owner_patch_cannot_set_status(self):
        resp = self.auth(self.owner).patch(
            f"/api/hotels/{self.hotel.pk}", {"status": "archived"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("status", resp.json())

    def test_staff_patch_can_publish(self):
        resp = self.auth(self.staff).patch(
            f"/api/hotels/{self.draft.pk}", {"status": "published"}, format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], Hotel.STATUS_PUBLISHED)

    def test_patch_of_other_partners_published_hotel_is_403(self):
        other_pub = Hotel.objects.create(
            owner=self.others, name="Other Published", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        resp = self.auth(self.owner).patch(
            f"/api/hotels/{other_pub.pk}", {"address": "x"}, format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_patch_is_401(self):
        resp = APIClient().patch(
            f"/api/hotels/{self.hotel.pk}", {"address": "x"}, format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_owner_delete_with_booking_is_409(self):
        from bookings.models import Booking
        from rooms.models import Room
        room = Room.objects.create(
            hotel=self.hotel, name="Suite", base_price=Decimal("100.00"),
            max_guests=2, total_units=1,
        )
        Booking.objects.create(
            room=room, user=self.guest, check_in="2026-01-01", check_out="2026-01-03",
            guests=1, total_amount=Decimal("200.00"),
        )
        resp = self.auth(self.owner).delete(f"/api/hotels/{self.hotel.pk}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("detail", resp.json())

    def test_owner_delete_with_review_is_409(self):
        from bookings.models import Booking
        from reviews.models import Review
        from rooms.models import Room
        room = Room.objects.create(
            hotel=self.hotel, name="Suite", base_price=Decimal("100.00"),
            max_guests=2, total_units=1,
        )
        booking = Booking.objects.create(
            room=room, user=self.guest, check_in="2026-01-01", check_out="2026-01-03",
            guests=1, total_amount=Decimal("200.00"),
        )
        Review.objects.create(
            booking=booking, user=self.guest, hotel=self.hotel, rating=4, comment="Good"
        )
        resp = self.auth(self.owner).delete(f"/api/hotels/{self.hotel.pk}")
        self.assertEqual(resp.status_code, 409)

    def test_owner_delete_without_dependents_is_204(self):
        resp = self.auth(self.owner).delete(f"/api/hotels/{self.draft.pk}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Hotel.objects.filter(pk=self.draft.pk).exists())

    def test_staff_delete_any_hotel(self):
        other_pub = Hotel.objects.create(
            owner=self.others, name="Other Published", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        resp = self.auth(self.staff).delete(f"/api/hotels/{other_pub.pk}")
        self.assertEqual(resp.status_code, 204)


class LocationCrudApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(username="locstaff", password="pw", is_staff=True)
        self.owner = User.objects.create_user(username="locowner", password="pw")
        self.pokhara = Location.objects.create(name="Pokhara", region="Gandaki")
        self.kathmandu = Location.objects.create(name="Kathmandu", region="Bagmati")

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_list_is_paginated_and_ordered(self):
        resp = APIClient().get("/api/locations")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(set(body), {"count", "next", "previous", "results"})
        self.assertEqual([loc["name"] for loc in body["results"]], ["Kathmandu", "Pokhara"])

    def test_public_detail(self):
        resp = APIClient().get(f"/api/locations/{self.pokhara.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Pokhara")

    def test_detail_unknown_404(self):
        resp = APIClient().get(f"/api/locations/{uuid.uuid4()}")
        self.assertEqual(resp.status_code, 404)

    def test_staff_create(self):
        resp = self.auth(self.staff).post(
            "/api/locations",
            {"name": "Bhaktapur", "region": "Bagmati",
             "latitude": "27.671000", "longitude": "85.429800"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["name"], "Bhaktapur")

    def test_staff_can_publish_location_through_post(self):
        resp = self.auth(self.staff).post(
            "/api/locations", {"name": "Lalitpur", "region": "Bagmati"}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["region"], "Bagmati")

    def test_partner_cannot_create(self):
        resp = self.auth(self.owner).post(
            "/api/locations", {"name": "Nope", "region": "X"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_cannot_create(self):
        resp = APIClient().post("/api/locations", {"name": "Nope"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_staff_patch(self):
        resp = self.auth(self.staff).patch(
            f"/api/locations/{self.kathmandu.pk}", {"region": "Bagmati Expanded"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["region"], "Bagmati Expanded")

    def test_partner_cannot_patch(self):
        resp = self.auth(self.owner).patch(
            f"/api/locations/{self.pokhara.pk}", {"region": "X"}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_with_hotels_is_409(self):
        Hotel.objects.create(
            owner=self.owner, name="Somewhere", property_type="hotel",
            location=self.pokhara, status=Hotel.STATUS_PUBLISHED,
        )
        resp = self.auth(self.staff).delete(f"/api/locations/{self.pokhara.pk}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("detail", resp.json())

    def test_delete_without_hotels_is_204(self):
        resp = self.auth(self.staff).delete(f"/api/locations/{self.pokhara.pk}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Location.objects.filter(pk=self.pokhara.pk).exists())

    def test_anonymous_cannot_delete(self):
        resp = APIClient().delete(f"/api/locations/{self.pokhara.pk}")
        self.assertEqual(resp.status_code, 401)



class AdminHotelEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(username="admstaff", password="pw", is_staff=True)
        self.guest = User.objects.create_user(username="admguest", password="pw")
        self.pokhara = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.staff, name="Lakeside Retreat Pokhara", property_type="resort",
            location=self.pokhara, description="Lake view",
            status=Hotel.STATUS_PUBLISHED,
        )

    def test_anonymous_and_non_staff_forbidden(self):
        self.assertEqual(APIClient().get("/api/admin/hotels").status_code, 403)
        self.client.force_authenticate(user=self.guest)
        self.assertEqual(self.client.get("/api/admin/hotels").status_code, 403)

    def test_list_shape_and_mapping(self):
        from rooms.models import Room

        Room.objects.create(
            hotel=self.hotel, name="Deluxe", base_price=Decimal("5000.00"),
            max_guests=2, total_units=3,
        )
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get("/api/admin/hotels")
        self.assertEqual(resp.status_code, 200)
        (row,) = resp.json()
        self.assertEqual(row["id"], str(self.hotel.pk))
        self.assertEqual(row["name"], "Lakeside Retreat Pokhara")
        self.assertEqual(row["location"], "Pokhara")
        self.assertEqual(row["propertyType"], "resort")
        self.assertEqual(row["startingPrice"], 5000.0)
        self.assertEqual(row["amenities"], [])
        self.assertEqual(row["status"], "Active")

    def test_list_includes_drafts_as_inactive(self):
        Hotel.objects.create(
            owner=self.staff, name="Draft Inn", property_type="hotel",
            location=self.pokhara, status=Hotel.STATUS_DRAFT,
        )
        self.client.force_authenticate(user=self.staff)
        rows = {row["name"]: row["status"] for row in self.client.get("/api/admin/hotels").json()}
        self.assertEqual(rows["Draft Inn"], "Inactive")

    def test_create_and_detail_roundtrip(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.post(
            "/api/admin/hotels",
            {"name": "New Inn", "location": "pokhara", "propertyType": "Homestay",
             "description": "Cozy", "status": "Inactive"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["status"], "Inactive")
        self.assertEqual(body["propertyType"], "homestay")
        hotel = Hotel.objects.get(name="New Inn")
        self.assertEqual(hotel.status, Hotel.STATUS_ARCHIVED)
        self.assertEqual(hotel.property_type, "homestay")
        detail = self.client.get(f"/api/admin/hotels/{hotel.pk}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["name"], "New Inn")
        self.assertEqual(self.client.get("/api/admin/hotels/99999").status_code, 404)

    def test_create_rejects_unknown_location_and_type(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.post(
            "/api/admin/hotels",
            {"name": "Nowhere Inn", "location": "Atlantis", "propertyType": "Hotel"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(
            "/api/admin/hotels",
            {"name": "Weird Inn", "location": "Pokhara", "propertyType": "Castle"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_patch_toggles_status_only(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.patch(
            f"/api/admin/hotels/{self.hotel.pk}", {"status": "Inactive"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "Inactive")
        self.hotel.refresh_from_db()
        self.assertEqual(self.hotel.status, Hotel.STATUS_ARCHIVED)
        self.assertEqual(self.hotel.name, "Lakeside Retreat Pokhara")

    def test_delete_guards_and_succeeds(self):
        from bookings.models import Booking
        from rooms.models import Room

        room = Room.objects.create(
            hotel=self.hotel, name="Standard", base_price=Decimal("1000.00"),
            max_guests=2, total_units=1,
        )
        Booking.objects.create(
            user=self.guest, room=room, check_in="2026-10-01",
            check_out="2026-10-03", guests=1,
        )
        self.client.force_authenticate(user=self.staff)
        resp = self.client.delete(f"/api/admin/hotels/{self.hotel.pk}")
        self.assertEqual(resp.status_code, 409)
        Booking.objects.all().delete()
        resp = self.client.delete(f"/api/admin/hotels/{self.hotel.pk}")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("rooms", resp.json()["detail"])
        room.delete()
        resp = self.client.delete(f"/api/admin/hotels/{self.hotel.pk}")
        self.assertEqual(resp.status_code, 204)
