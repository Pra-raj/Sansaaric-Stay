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
