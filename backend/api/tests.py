import uuid
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase

from api.exceptions import Conflict
from api.pagination import StandardPagination
from api.permissions import (
    IsStaff,
    hotel_owner_or_staff,
    is_hotel_owner,
    owner_or_staff,
)
from auth.models import Profile

User = get_user_model()


class StandardPaginationTests(SimpleTestCase):
    def test_page_size_defaults_to_20(self):
        self.assertEqual(StandardPagination.page_size, 20)

    def test_page_size_query_param(self):
        self.assertEqual(StandardPagination.page_size_query_param, "page_size")

    def test_max_page_size(self):
        self.assertEqual(StandardPagination.max_page_size, 100)


class ConflictTests(SimpleTestCase):
    def test_status_code_is_409(self):
        self.assertEqual(Conflict().status_code, 409)

    def test_keeps_custom_detail(self):
        self.assertEqual(str(Conflict("Hotel has bookings.").detail), "Hotel has bookings.")


class PermissionHelperTests(SimpleTestCase):
    def setUp(self):
        self.staff = SimpleNamespace(is_authenticated=True, is_staff=True, id=1)
        self.owner = SimpleNamespace(is_authenticated=True, is_staff=False, id=2)
        self.other = SimpleNamespace(is_authenticated=True, is_staff=False, id=3)
        self.anonymous = SimpleNamespace(is_authenticated=False, is_staff=False, id=None)

    def test_hotel_owner_or_staff_allows_owner(self):
        self.assertTrue(hotel_owner_or_staff(self.owner, SimpleNamespace(owner_id=2)))

    def test_hotel_owner_or_staff_allows_staff(self):
        self.assertTrue(hotel_owner_or_staff(self.staff, SimpleNamespace(owner_id=2)))

    def test_hotel_owner_or_staff_rejects_other_user(self):
        self.assertFalse(hotel_owner_or_staff(self.other, SimpleNamespace(owner_id=2)))

    def test_hotel_owner_or_staff_rejects_anonymous(self):
        self.assertFalse(hotel_owner_or_staff(self.anonymous, SimpleNamespace(owner_id=2)))

    def test_owner_or_staff_defaults_to_user_field(self):
        booking = SimpleNamespace(user_id=2)
        self.assertTrue(owner_or_staff(self.owner, booking))
        self.assertTrue(owner_or_staff(self.staff, booking))
        self.assertFalse(owner_or_staff(self.other, booking))
        self.assertFalse(owner_or_staff(self.anonymous, booking))

    def test_owner_or_staff_supports_other_field_names(self):
        review = SimpleNamespace(user_id=3, hotel=SimpleNamespace(owner_id=2))
        self.assertTrue(owner_or_staff(self.owner, review.hotel, field="owner"))
        self.assertFalse(owner_or_staff(self.other, review.hotel, field="owner"))


class IsHotelOwnerTests(TestCase):
    def make_user(self, username, role=None, is_staff=False):
        user = User.objects.create_user(
            username=username, password="pw", is_staff=is_staff
        )
        if role is not None:
            Profile.objects.create(
                user=user, supabase_uid=uuid.uuid4(), role=role
            )
        return user

    def test_hotel_owner_role_passes(self):
        user = self.make_user("partner1", Profile.ROLE_HOTEL_OWNER)
        self.assertTrue(is_hotel_owner(user))

    def test_guest_role_fails(self):
        user = self.make_user("guest1", Profile.ROLE_GUEST)
        self.assertFalse(is_hotel_owner(user))

    def test_missing_profile_fails(self):
        self.assertFalse(is_hotel_owner(self.make_user("profileless")))

    def test_staff_always_passes(self):
        self.assertTrue(is_hotel_owner(self.make_user("boss", is_staff=True)))

    def test_anonymous_fails(self):
        self.assertFalse(is_hotel_owner(AnonymousUser()))


class IsStaffTests(TestCase):
    def test_allows_staff(self):
        user = User.objects.create_user(username="admin1", password="pw", is_staff=True)
        self.assertTrue(IsStaff().has_permission(SimpleNamespace(user=user), None))

    def test_rejects_authenticated_non_staff(self):
        user = User.objects.create_user(username="partner1", password="pw")
        self.assertFalse(IsStaff().has_permission(SimpleNamespace(user=user), None))

    def test_rejects_anonymous(self):
        self.assertFalse(IsStaff().has_permission(SimpleNamespace(user=AnonymousUser()), None))


class AdminActivityTests(TestCase):
    def setUp(self):
        from bookings.models import Booking
        from chat.models import Conversation
        from document_ingestion.models import ReferenceDocument
        from hotels.models import Hotel, Location
        from reviews.models import Review
        from rooms.models import Room

        self.staff = User.objects.create_user(username="actstaff", password="pw", is_staff=True)
        self.guest = User.objects.create_user(
            username="actguest", password="pw", first_name="Asha", email="asha@example.com"
        )
        location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.staff, name="Activity Inn", property_type="hotel",
            location=location, status=Hotel.STATUS_PUBLISHED,
        )
        room = Room.objects.create(
            hotel=self.hotel, name="Standard", base_price=1000,
            max_guests=2, total_units=1,
        )
        self.booking = Booking.objects.create(
            user=self.guest, room=room, check_in="2026-10-01",
            check_out="2026-10-03", guests=1,
        )
        Review.objects.create(
            booking=self.booking, user=self.guest, hotel=self.hotel,
            rating=5, comment="Great stay",
        )
        Conversation.objects.create(user=self.guest, title="Booking enquiry")
        ReferenceDocument.objects.create(
            file_name="faq.pdf", file_type="pdf", uploaded_by=self.staff
        )

    def test_gating(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().get("/api/admin/activity").status_code, 403)

    def test_feed_shape_and_order(self):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.staff)
        rows = client.get("/api/admin/activity").json()
        self.assertEqual(len(rows), 5)
        for row in rows:
            self.assertEqual(
                set(row),
                {"id", "at", "actor", "actorEmail", "category", "action", "target", "level"},
            )
        categories = {row["category"] for row in rows}
        self.assertEqual(categories, {"hotel", "booking", "inbox", "document"})
        stamps = [row["at"] for row in rows]
        self.assertEqual(stamps, sorted(stamps, reverse=True))
        booking_rows = [row for row in rows if row["action"] == "created booking"]
        self.assertEqual(len(booking_rows), 1)
        self.assertEqual(booking_rows[0]["actor"], "Asha")
        self.assertEqual(booking_rows[0]["actorEmail"], "asha@example.com")
        self.assertEqual(booking_rows[0]["target"], "Activity Inn")
        self.assertTrue(all(row["level"] == "info" for row in rows))
