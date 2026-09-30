import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from bookings.models import Booking
from hotels.models import Hotel, Location
from reviews.models import Review
from rooms.models import Room

User = get_user_model()


class ReviewModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="guest1", password="pw")
        self.owner = User.objects.create_user(username="partner1", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner,
            name="Reviewed Inn",
            property_type="hotel",
            location=self.location,
            status=Hotel.STATUS_PUBLISHED,
        )
        self.room = Room.objects.create(
            hotel=self.hotel,
            name="Standard Twin",
            base_price=Decimal("3000.00"),
            max_guests=2,
            total_units=4,
        )
        self.booking = Booking.objects.create(
            user=self.user,
            room=self.room,
            check_in="2026-10-01",
            check_out="2026-10-05",
            guests=2,
        )

    def create_review(self, **kwargs):
        defaults = {
            "booking": self.booking,
            "user": self.user,
            "hotel": self.hotel,
            "rating": 5,
            "comment": "Great stay",
        }
        defaults.update(kwargs)
        return Review.objects.create(**defaults)

    def test_uuid_primary_key(self):
        review = self.create_review()
        self.assertIsInstance(review.id, uuid.UUID)

    def test_comment_blank_default(self):
        review = self.create_review(comment="")
        self.assertEqual(review.comment, "")

    def test_rating_must_be_between_1_and_5(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_review(rating=6)

    def test_one_review_per_booking(self):
        self.create_review()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_review()


class ReviewCrudApiTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username="rvstaff", password="pw", is_staff=True)
        self.guest = User.objects.create_user(username="rvguest", password="pw")
        self.other = User.objects.create_user(username="rvother", password="pw")
        self.owner = User.objects.create_user(username="rvowner", password="pw")
        self.location = Location.objects.create(name="Pokhara")
        self.hotel = Hotel.objects.create(
            owner=self.owner, name="Reviewed Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        self.room = Room.objects.create(
            hotel=self.hotel, name="Standard Twin", base_price=Decimal("3000.00"),
            max_guests=2, total_units=4,
        )
        self.past_booking = self._booking("2020-01-01", "2020-01-04", self.guest)
        self.future_booking = self._booking("2090-01-01", "2090-01-04", self.guest)
        self.owner_booking = self._booking("2020-02-01", "2020-02-04", self.owner)
        self.review = Review.objects.create(
            booking=self.past_booking, user=self.guest, hotel=self.hotel, rating=4,
            comment="Nice",
        )

    def _booking(self, check_in, check_out, user):
        return Booking.objects.create(
            user=user, room=self.room, check_in=check_in, check_out=check_out,
            guests=1, status=Booking.STATUS_COMPLETED,
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_hotel_reviews_are_public_and_paginated(self):
        resp = APIClient().get(f"/api/hotels/{self.hotel.pk}/reviews")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["rating"], 4)
        self.assertNotIn("user_id", body["results"][0])

    def test_hotel_reviews_404_for_draft_hotel(self):
        draft = Hotel.objects.create(
            owner=self.owner, name="Draft Inn", property_type="hotel",
            location=self.location, status=Hotel.STATUS_DRAFT,
        )
        resp = APIClient().get(f"/api/hotels/{draft.pk}/reviews")
        self.assertEqual(resp.status_code, 404)

    def test_create_derives_user_and_hotel(self):
        booking = self._booking("2020-03-01", "2020-03-04", self.guest)
        resp = self.auth(self.guest).post(
            "/api/reviews",
            {"booking_id": str(booking.id), "rating": 5, "comment": "Great"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["hotel_id"], self.hotel.id)
        self.assertEqual(body["rating"], 5)
        saved = Review.objects.get(pk=body["id"])
        self.assertEqual(saved.user_id, self.guest.id)
        self.assertEqual(saved.hotel_id, self.hotel.id)

    def test_create_ignores_client_user_and_hotel(self):
        booking = self._booking("2020-04-01", "2020-04-04", self.guest)
        resp = self.auth(self.guest).post(
            "/api/reviews",
            {"booking_id": str(booking.id), "rating": 3, "user_id": self.other.id,
             "hotel_id": str(self.hotel.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Review.objects.get(pk=resp.json()["id"]).user_id, self.guest.id)

    def test_create_requires_authentication(self):
        resp = APIClient().post(
            "/api/reviews", {"booking_id": str(self.past_booking.id), "rating": 4},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_create_for_someone_elses_booking_is_403(self):
        booking = self._booking("2020-05-01", "2020-05-04", self.guest)
        resp = self.auth(self.other).post(
            "/api/reviews", {"booking_id": str(booking.id), "rating": 4}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_create_before_check_out_is_400(self):
        resp = self.auth(self.guest).post(
            "/api/reviews", {"booking_id": str(self.future_booking.id), "rating": 4},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_review_is_400_not_500(self):
        resp = self.auth(self.guest).post(
            "/api/reviews", {"booking_id": str(self.past_booking.id), "rating": 2},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("booking_id", resp.json())
        self.assertEqual(Review.objects.filter(booking=self.past_booking).count(), 1)

    def test_hotel_owner_can_review_own_stay(self):
        resp = self.auth(self.owner).post(
            "/api/reviews", {"booking_id": str(self.owner_booking.id), "rating": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Review.objects.get(pk=resp.json()["id"]).user_id, self.owner.id)

    def test_create_invalid_rating_400(self):
        booking = self._booking("2020-06-01", "2020-06-04", self.guest)
        resp = self.auth(self.guest).post(
            "/api/reviews", {"booking_id": str(booking.id), "rating": 9}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("rating", resp.json())

    def test_public_detail(self):
        resp = APIClient().get(f"/api/reviews/{self.review.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["rating"], 4)

    def test_author_patches_rating_and_comment(self):
        resp = self.auth(self.guest).patch(
            f"/api/reviews/{self.review.id}", {"rating": 5, "comment": "Better"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["rating"], 5)

    def test_author_cannot_change_booking_or_hotel(self):
        resp = self.auth(self.guest).patch(
            f"/api/reviews/{self.review.id}",
            {"booking_id": str(self.past_booking.id), "hotel_id": str(self.hotel.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_other_user_cannot_patch(self):
        resp = self.auth(self.other).patch(
            f"/api/reviews/{self.review.id}", {"rating": 1}, format="json"
        )
        self.assertEqual(resp.status_code, 403)

    def test_staff_patches_any_review(self):
        resp = self.auth(self.staff).patch(
            f"/api/reviews/{self.review.id}", {"rating": 2}, format="json"
        )
        self.assertEqual(resp.status_code, 200)

    def test_anonymous_patch_401(self):
        resp = APIClient().patch(
            f"/api/reviews/{self.review.id}", {"rating": 1}, format="json"
        )
        self.assertEqual(resp.status_code, 401)

    def test_author_deletes(self):
        resp = self.auth(self.guest).delete(f"/api/reviews/{self.review.id}")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Review.objects.filter(pk=self.review.id).exists())

    def test_other_user_cannot_delete(self):
        resp = self.auth(self.other).delete(f"/api/reviews/{self.review.id}")
        self.assertEqual(resp.status_code, 403)

    def test_staff_deletes_any_review(self):
        resp = self.auth(self.staff).delete(f"/api/reviews/{self.review.id}")
        self.assertEqual(resp.status_code, 204)
