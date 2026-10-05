"""Tests for the recommendation engine.

Style follows ``reviews/tests.py`` — ``django.test.TestCase`` plus
``rest_framework.test.APIClient``, no factories and no mocking. Scoring maths is
tested directly against :class:`HotelFeatures` records so a ranking assertion
does not depend on database shape, and the HTTP contract is tested separately.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from bookings.models import Booking
from hotels.models import Hotel, Location
from recommendations import cache, scoring
from recommendations.availability import available_hotel_ids
from recommendations.profiles import build_profile
from recommendations.signals import HotelFeatures, bayesian_rating, hotel_features
from reviews.models import Review
from rooms.models import Room

User = get_user_model()

TODAY = date(2026, 10, 1)


def recent_start(days_ago=10):
    """A check-in in the recent past, so recency decay barely attenuates it."""
    return TODAY - timedelta(days=days_ago + 4)


def make_features(**overrides) -> HotelFeatures:
    defaults = {
        "hotel_id": 1,
        "property_type": "hotel",
        "region": "Gandaki",
        "location_name": "Pokhara",
        "latitude": 28.2096,
        "longitude": 83.9856,
        "price": 3000.0,
        "max_guests": 2,
        "room_count": 3,
        "review_count": 20,
        "bayesian_rating": 4.2,
        "created_at": None,
    }
    defaults.update(overrides)
    return HotelFeatures(**defaults)


class FactoryMixin:
    """Small builders shared by the test cases below."""

    def create_user(self, username):
        return User.objects.create_user(username=username, password="pw")

    def create_location(self, name="Pokhara", region="Gandaki", lat=28.2096, lon=83.9856):
        return Location.objects.create(
            name=name, region=region, latitude=lat, longitude=lon
        )

    def create_hotel(self, name="Inn", property_type="hotel", location=None,
                     owner=None, status=Hotel.STATUS_PUBLISHED, rooms=1,
                     price="3000.00", max_guests=2, total_units=3):
        owner = owner or getattr(self, "owner", None) or self.create_user("howner")
        location = location or getattr(self, "location", None) or self.create_location()
        hotel = Hotel.objects.create(
            owner=owner, name=name, property_type=property_type,
            location=location, status=status,
        )
        for index in range(rooms):
            Room.objects.create(
                hotel=hotel, name=f"Room {index}",
                base_price=Decimal(price), max_guests=max_guests,
                total_units=total_units,
            )
        return hotel

    def create_booking(self, user, hotel, status=Booking.STATUS_COMPLETED,
                       check_in=None, check_out=None, guests=2, price="3000.00"):
        room = hotel.rooms.first()
        check_in = check_in or recent_start()
        check_out = check_out or check_in + timedelta(days=3)
        return Booking.objects.create(
            user=user, room=room, check_in=check_in, check_out=check_out,
            guests=guests, status=status,
        )

    def create_review(self, user, hotel, rating=5):
        booking = self.create_booking(user, hotel, status=Booking.STATUS_COMPLETED)
        return Review.objects.create(
            booking=booking, user=user, hotel=hotel, rating=rating
        )

    def review_existing_stay(self, user, hotel, rating):
        """Review the stay ``user`` already has at ``hotel``, adding no new booking.

        Needed whenever a test is asserting on review *weight* in isolation:
        routing through ``create_review`` would silently add a second booking and
        mask the effect being measured.
        """
        booking = (
            Booking.objects.filter(user=user, room__hotel=hotel)
            .exclude(reviews__isnull=False)
            .order_by("-check_in")
            .first()
        )
        if booking is None:
            booking = self.create_booking(user, hotel, status=Booking.STATUS_COMPLETED)
        return Review.objects.create(
            booking=booking, user=user, hotel=hotel, rating=rating
        )


class CacheIsolationMixin:
    """The cache is process-local, so it must not bleed across tests."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def tearDown(self):
        cache.clear()
        super().tearDown()


class BayesianRatingTests(TestCase):
    def test_no_reviews_returns_prior(self):
        self.assertEqual(bayesian_rating(None, 0, 3.5, 8.0), 3.5)

    def test_single_perfect_review_does_not_reach_five(self):
        # The whole point of the prior: one 5-star review must not outrank a
        # well-reviewed 4.6 hotel.
        self.assertLess(bayesian_rating(5.0, 1, 3.5, 8.0), bayesian_rating(4.6, 200, 3.5, 8.0))

    def test_converges_on_observed_value_with_volume(self):
        self.assertAlmostEqual(bayesian_rating(4.6, 100_000, 3.5, 8.0), 4.6, places=3)

    def test_more_data_moves_rating_toward_observed(self):
        thin = bayesian_rating(4.0, 2, 3.5, 8.0)
        thick = bayesian_rating(4.0, 200, 3.5, 8.0)
        self.assertLess(thin, thick)
        self.assertLess(thick, 4.0)


class FeatureExtractionTests(FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("fowner")
        self.location = self.create_location()

    def test_review_count_is_distinct_despite_multiple_rooms(self):
        # Three rooms x four reviews = twelve join rows. Without distinct=True
        # this would report twelve reviews and inflate popularity.
        hotel = self.create_hotel(rooms=3)
        for index in range(4):
            guest = self.create_user(f"g{index}")
            self.create_review(guest, hotel, rating=4)
        features = hotel_features(Hotel.objects.all(), 3.5, 8.0)
        self.assertEqual(features[hotel.id].review_count, 4)

    def test_price_is_cheapest_room(self):
        hotel = Hotel.objects.create(
            owner=self.owner, name="Multi", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        Room.objects.create(hotel=hotel, name="Cheap", base_price=Decimal("1000.00"),
                            max_guests=1, total_units=2)
        Room.objects.create(hotel=hotel, name="Pricey", base_price=Decimal("9000.00"),
                            max_guests=6, total_units=1)
        features = hotel_features(Hotel.objects.all(), 3.5, 8.0)
        self.assertEqual(features[hotel.id].price, 1000.0)
        self.assertEqual(features[hotel.id].max_guests, 6)

    def test_zero_review_hotel_inherits_prior_not_zero(self):
        hotel = self.create_hotel()
        features = hotel_features(Hotel.objects.all(), 3.5, 8.0)
        self.assertEqual(features[hotel.id].bayesian_rating, 3.5)
        self.assertEqual(features[hotel.id].review_count, 0)

    def test_unmaintained_avg_rating_used_only_as_fallback(self):
        # Hotel.avg_rating is a denormalized field nothing maintains. With
        # reviews present, the live average wins; with none, the stored value is
        # a last resort.
        hotel = self.create_hotel()
        hotel.avg_rating = Decimal("4.90")
        hotel.save(update_fields=["avg_rating"])
        self.create_review(self.create_user("x"), hotel, rating=3)
        features = hotel_features(Hotel.objects.all(), 3.5, 8.0)
        self.assertLess(features[hotel.id].bayesian_rating, 4.0)

    def test_hotel_without_rooms_is_reported_as_such(self):
        hotel = Hotel.objects.create(
            owner=self.owner, name="Empty", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        features = hotel_features(Hotel.objects.all(), 3.5, 8.0)
        self.assertEqual(features[hotel.id].room_count, 0)
        self.assertIsNone(features[hotel.id].price)


class ContentScoringTests(TestCase):
    def setUp(self):
        self.cfg = scoring.config()

    def test_matching_property_type_scores_higher(self):
        profile = build_profile(self._user_with(property_type="villa"))
        match = make_features(hotel_id=1, property_type="villa")
        mismatch = make_features(hotel_id=2, property_type="hostel")
        self.assertGreater(
            scoring.content_score(match, profile, self.cfg),
            scoring.content_score(mismatch, profile, self.cfg),
        )

    def test_matching_region_scores_higher(self):
        profile = build_profile(self._user_with(region="Gandaki"))
        near = make_features(hotel_id=1, region="Gandaki")
        far = make_features(hotel_id=2, region="Bagmati")
        self.assertGreater(
            scoring.content_score(near, profile, self.cfg),
            scoring.content_score(far, profile, self.cfg),
        )

    def test_nearer_scores_higher(self):
        profile = build_profile(self._user_with(latitude=28.2096, longitude=83.9856))
        near = make_features(hotel_id=1, latitude=28.2096, longitude=83.9856)
        far = make_features(hotel_id=2, latitude=27.7172, longitude=85.3240)
        self.assertGreater(
            scoring.content_score(near, profile, self.cfg),
            scoring.content_score(far, profile, self.cfg),
        )

    def test_price_affinity_prefers_near_spend(self):
        profile = build_profile(self._user_with(price="3000.00"))
        cheap_and_expensive = scoring.content_score(
            make_features(hotel_id=1, price=3000.0), profile, self.cfg
        )
        cheap_and_bargain = scoring.content_score(
            make_features(hotel_id=2, price=300.0), profile, self.cfg
        )
        self.assertGreater(cheap_and_expensive, cheap_and_bargain)

    def test_capacity_prefers_room_that_fits_party(self):
        profile = build_profile(self._user_with(guests=4))
        fits = make_features(hotel_id=1, max_guests=6)
        too_small = make_features(hotel_id=2, max_guests=2)
        self.assertGreater(
            scoring.content_score(fits, profile, self.cfg),
            scoring.content_score(too_small, profile, self.cfg),
        )

    def test_missing_price_is_not_treated_as_awful_price(self):
        # A hotel with no price data must not rank below one whose price is
        # maximally unaffordable for this guest.
        profile = build_profile(self._user_with(price="3000.00"))
        unknown = make_features(hotel_id=1, price=None)
        unaffordable = make_features(hotel_id=2, price=10.0)
        self.assertGreaterEqual(
            scoring.content_score(unknown, profile, self.cfg),
            scoring.content_score(unaffordable, profile, self.cfg),
        )

    def test_empty_profile_falls_back_to_quality_only(self):
        # With no history there is nothing to compare against, so the quality
        # term is the only available component and carries the whole score.
        empty = build_profile(None)
        good = make_features(hotel_id=1, bayesian_rating=5.0)
        poor = make_features(hotel_id=2, bayesian_rating=1.0)
        self.assertAlmostEqual(scoring.content_score(good, empty, self.cfg), 1.0)
        self.assertAlmostEqual(scoring.content_score(poor, empty, self.cfg), 0.0)

    def _user_with(self, property_type="hotel", region="Gandaki", price="3000.00",
                   guests=2, latitude=None, longitude=None):
        user = User.objects.create_user(username=uuid.uuid4().hex, password="pw")
        location = Location.objects.create(
            name=region, region=region, latitude=latitude, longitude=longitude
        )
        hotel = Hotel.objects.create(
            owner=user, name="Seed", property_type=property_type,
            location=location, status=Hotel.STATUS_PUBLISHED,
        )
        Room.objects.create(
            hotel=hotel, name="R", base_price=Decimal(price),
            max_guests=guests, total_units=1,
        )
        Booking.objects.create(
            user=user, room=hotel.rooms.first(),
            check_in=recent_start(), check_out=recent_start() + timedelta(days=3),
            guests=guests, status=Booking.STATUS_COMPLETED,
        )
        return user


class CollaborativeScoringTests(FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("cowner")
        self.location = self.create_location()
        self.me = self.create_user("me")
        self.peer = self.create_user("peer")
        self.stranger = self.create_user("stranger")
        self.seed = self.create_hotel("Seed")
        self.partner = self.create_hotel("Partner")
        self.unrelated = self.create_hotel("Unrelated")

    def test_co_stay_boosts_partner(self):
        self.create_booking(self.me, self.seed)
        self.create_booking(self.peer, self.seed)
        self.create_booking(self.peer, self.partner)

        profile = build_profile(self.me)
        scores = scoring.collaborative_scores(
            {self.partner.id: make_features(hotel_id=self.partner.id),
             self.unrelated.id: make_features(hotel_id=self.unrelated.id)},
            profile.interactions,
            self.me.id,
        )
        self.assertGreater(scores.get(self.partner.id, 0.0), scores.get(self.unrelated.id, -1.0))

    def test_review_of_candidate_increases_its_weight(self):
        # Item-item needs the neighbour to have touched the candidate, so this
        # asserts the review *weight* on top of that, not the co-stay itself.
        self.create_booking(self.me, self.seed)
        self.create_booking(self.peer, self.seed)
        self.create_booking(self.peer, self.partner)
        profile = build_profile(self.me)
        before = scoring._peer_histories(
            self.me.id, list(profile.interactions), profile.interactions
        )
        self.create_review(self.peer, self.partner, rating=5)
        after = scoring._peer_histories(
            self.me.id, list(profile.interactions), profile.interactions
        )
        self.assertGreater(
            after[self.peer.id][self.partner.id], before[self.peer.id][self.partner.id]
        )

    def test_negative_review_reduces_candidate_weight(self):
        self.create_booking(self.me, self.seed)
        self.create_booking(self.peer, self.seed)
        self.create_booking(self.peer, self.partner)
        profile = build_profile(self.me)
        before = scoring._peer_histories(
            self.me.id, list(profile.interactions), profile.interactions
        )
        self.review_existing_stay(self.peer, self.partner, rating=1)
        after = scoring._peer_histories(
            self.me.id, list(profile.interactions), profile.interactions
        )
        self.assertLess(
            after[self.peer.id][self.partner.id], before[self.peer.id][self.partner.id]
        )

    def test_one_star_review_outweighs_the_booking_it_cancels(self):
        # Otherwise a guest who hated their stay would still be treated as an
        # advocate for that property's neighbours.
        self.create_booking(self.me, self.seed)
        self.create_booking(self.peer, self.seed)
        self.review_existing_stay(self.peer, self.seed, rating=1)
        profile = build_profile(self.me)
        peers = scoring._peer_histories(
            self.me.id, list(profile.interactions), profile.interactions
        )
        self.assertLess(peers[self.peer.id][self.seed.id], 0.0)

    def test_no_peers_yields_no_scores(self):
        self.create_booking(self.me, self.seed)
        profile = build_profile(self.me)
        self.assertEqual(
            scoring.collaborative_scores(
                {self.partner.id: make_features(hotel_id=self.partner.id)},
                profile.interactions,
                self.me.id,
            ),
            {},
        )

    def test_empty_history_yields_no_scores(self):
        self.assertEqual(scoring.collaborative_scores({self.seed.id: make_features()}, {}), {})

    def test_entirely_negative_peers_promote_nothing(self):
        # Being universally disliked should collapse the scale, not min-max a
        # fully negative set up to 1.
        self.create_booking(self.me, self.seed)
        self.create_booking(self.peer, self.seed)
        self.review_existing_stay(self.peer, self.seed, rating=1)
        self.create_booking(self.peer, self.partner)
        self.review_existing_stay(self.peer, self.partner, rating=1)
        profile = build_profile(self.me)
        scores = scoring.collaborative_scores(
            {self.partner.id: make_features(hotel_id=self.partner.id)},
            profile.interactions,
            self.me.id,
        )
        self.assertEqual(scores, {})

    def test_scores_are_normalized_to_unit_interval(self):
        for index in range(3):
            user = self.create_user(f"peer{index}")
            self.create_booking(self.me, self.seed)
            self.create_booking(user, self.seed)
            self.create_booking(user, self.partner)
        profile = build_profile(self.me)
        candidates = {
            self.partner.id: make_features(hotel_id=self.partner.id),
            self.unrelated.id: make_features(hotel_id=self.unrelated.id),
        }
        scores = scoring.collaborative_scores(candidates, profile.interactions, self.me.id)
        self.assertTrue(scores)
        for value in scores.values():
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, 1.0)


class ColdStartTests(FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("csowner")
        self.location = self.create_location()
        self.user = self.create_user("csuser")

    def test_no_history_is_cold_start(self):
        self.assertTrue(scoring.is_cold_start(build_profile(self.user)))
        self.assertEqual(scoring.strategy_for(build_profile(self.user)), "popular")

    def test_anonymous_profile_is_cold_start(self):
        profile = build_profile(None)
        self.assertTrue(profile.is_empty)
        self.assertTrue(scoring.is_cold_start(profile))

    def test_cf_weight_is_zero_without_history(self):
        self.assertEqual(
            scoring._cf_weight(build_profile(self.user), scoring.config()), 0.0
        )

    def test_cf_weight_ramps_with_history(self):
        self.create_hotel("Untouched")
        self.create_booking(self.user, self.create_hotel("Stayed once"))
        partial = scoring._cf_weight(build_profile(self.user), scoring.config())
        self.assertGreater(partial, 0.0)
        self.assertLess(partial, scoring.config()["CF_WEIGHT"])

        for index in range(3):
            self.create_booking(self.user, self.create_hotel(f"Also {index}"))
        self.assertEqual(
            scoring._cf_weight(build_profile(self.user), scoring.config()),
            scoring.config()["CF_WEIGHT"],
        )

    def test_cold_start_still_returns_results(self):
        for index in range(3):
            self.create_hotel(f"Hotel {index}")
        scored = scoring.rank(
            {h.id: make_features(hotel_id=h.id, bayesian_rating=4.0 + index * 0.1)
             for h in Hotel.objects.all()},
            build_profile(self.user),
        )
        self.assertTrue(scored)


class AvailabilityTests(FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("aowner")
        self.location = self.create_location()
        self.guest = self.create_user("aguest")

    def test_open_hotel_is_available(self):
        hotel = self.create_hotel(total_units=2)
        window = (TODAY, TODAY + timedelta(days=2))
        self.assertIn(hotel.id, available_hotel_ids(*window))

    def test_sold_out_hotel_is_unavailable(self):
        hotel = self.create_hotel(total_units=1)
        self.create_booking(
            self.guest, hotel, status=Booking.STATUS_CONFIRMED,
            check_in=TODAY, check_out=TODAY + timedelta(days=3),
        )
        self.assertNotIn(hotel.id, available_hotel_ids(TODAY, TODAY + timedelta(days=2)))

    def test_cancelled_booking_releases_inventory(self):
        hotel = self.create_hotel(total_units=1)
        self.create_booking(
            self.guest, hotel, status=Booking.STATUS_CANCELLED,
            check_in=TODAY, check_out=TODAY + timedelta(days=3),
        )
        self.assertIn(hotel.id, available_hotel_ids(TODAY, TODAY + timedelta(days=2)))

    def test_non_overlapping_stay_does_not_consume_inventory(self):
        hotel = self.create_hotel(total_units=1)
        self.create_booking(
            self.guest, hotel, status=Booking.STATUS_CONFIRMED,
            check_in=TODAY + timedelta(days=10), check_out=TODAY + timedelta(days=13),
        )
        self.assertIn(hotel.id, available_hotel_ids(TODAY, TODAY + timedelta(days=2)))

    def test_checkout_day_is_available_for_new_checkin(self):
        # Half-open intervals: a stay ending on day 3 frees the room on day 3.
        hotel = self.create_hotel(total_units=1)
        self.create_booking(
            self.guest, hotel, status=Booking.STATUS_CONFIRMED,
            check_in=TODAY - timedelta(days=3), check_out=TODAY,
        )
        self.assertIn(hotel.id, available_hotel_ids(TODAY, TODAY + timedelta(days=2)))

    def test_party_size_filters_small_rooms(self):
        hotel = self.create_hotel(max_guests=2, total_units=1)
        window = (TODAY, TODAY + timedelta(days=2))
        self.assertIn(hotel.id, available_hotel_ids(*window, guests=2))
        self.assertNotIn(hotel.id, available_hotel_ids(*window, guests=6))


class RecommendationApiTests(CacheIsolationMixin, FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("raowner")
        self.location = self.create_location()
        self.guest = self.create_user("raguest")
        self.hotels = [self.create_hotel(f"Hotel {index}") for index in range(4)]

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_anonymous_gets_popular_strategy(self):
        resp = APIClient().get("/api/recommendations")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["strategy"], "popular")
        self.assertTrue(body["cold_start"])
        self.assertEqual(body["results"][0]["name"], "Hotel 3")

    def test_default_limit_applies(self):
        resp = APIClient().get("/api/recommendations")
        self.assertEqual(len(resp.json()["results"]), 4)

    def test_limit_is_honoured_and_clamped(self):
        self.assertEqual(
            len(APIClient().get("/api/recommendations?limit=2").json()["results"]), 2
        )
        # Clamped rather than rejected.
        self.assertEqual(
            len(APIClient().get("/api/recommendations?limit=9999").json()["results"]), 4
        )

    def test_invalid_limit_is_400(self):
        self.assertEqual(APIClient().get("/api/recommendations?limit=abc").status_code, 400)

    def test_zero_limit_is_400(self):
        self.assertEqual(APIClient().get("/api/recommendations?limit=0").status_code, 400)

    def test_exclude_drops_hotels(self):
        excluded = self.hotels[0].id
        body = APIClient().get(f"/api/recommendations?exclude={excluded}").json()
        self.assertNotIn(excluded, [item["id"] for item in body["results"]])

    def test_non_numeric_exclude_is_400(self):
        self.assertEqual(APIClient().get("/api/recommendations?exclude=abc").status_code, 400)

    def test_check_in_without_check_out_is_400(self):
        resp = APIClient().get(f"/api/recommendations?check_in={TODAY.isoformat()}")
        self.assertEqual(resp.status_code, 400)

    def test_backwards_window_is_400(self):
        resp = APIClient().get(
            f"/api/recommendations?check_in={TODAY.isoformat()}"
            f"&check_out={(TODAY - timedelta(days=1)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 400)

    def test_bad_date_is_400(self):
        self.assertEqual(APIClient().get("/api/recommendations?check_in=nope").status_code, 400)

    def test_guests_without_dates_is_400(self):
        self.assertEqual(APIClient().get("/api/recommendations?guests=2").status_code, 400)

    def test_sold_out_hotel_dropped_when_dates_given(self):
        # Default helper inventory is 3 units, so this needs a genuinely
        # exhausted single-unit property.
        sold_out = self.create_hotel("Sold Out", total_units=1)
        self.create_booking(
            self.guest, sold_out, status=Booking.STATUS_CONFIRMED,
            check_in=TODAY, check_out=TODAY + timedelta(days=3),
        )
        body = APIClient().get(
            f"/api/recommendations?check_in={TODAY.isoformat()}"
            f"&check_out={(TODAY + timedelta(days=2)).isoformat()}"
        ).json()
        self.assertNotIn(sold_out.id, [item["id"] for item in body["results"]])

    def test_cold_start_user_gets_popular_not_error(self):
        body = self.auth(self.guest).get("/api/recommendations").json()
        self.assertEqual(body["strategy"], "popular")
        self.assertTrue(body["results"])

    def test_established_user_gets_personalized_strategy(self):
        for hotel in self.hotels[:3]:
            self.create_booking(self.guest, hotel)
        body = self.auth(self.guest).get("/api/recommendations").json()
        self.assertEqual(body["strategy"], "personalized")
        self.assertFalse(body["cold_start"])

    def test_draft_hotels_hidden_from_anonymous(self):
        self.create_hotel("Secret", status=Hotel.STATUS_DRAFT)
        body = APIClient().get("/api/recommendations").json()
        self.assertNotIn("Secret", [item["name"] for item in body["results"]])

    def test_archived_hotels_hidden_from_anonymous(self):
        self.create_hotel("Retired", status=Hotel.STATUS_ARCHIVED)
        body = APIClient().get("/api/recommendations").json()
        self.assertNotIn("Retired", [item["name"] for item in body["results"]])

    def test_owner_sees_own_draft(self):
        draft = self.create_hotel("My Draft", owner=self.owner,
                                  status=Hotel.STATUS_DRAFT)
        body = self.auth(self.owner).get("/api/recommendations").json()
        self.assertIn(draft.id, [item["id"] for item in body["results"]])

    def test_hotel_without_rooms_never_recommended(self):
        empty = Hotel.objects.create(
            owner=self.owner, name="No Rooms", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED,
        )
        body = APIClient().get("/api/recommendations").json()
        self.assertNotIn(empty.id, [item["id"] for item in body["results"]])

    def test_repeated_calls_are_deterministic(self):
        first = APIClient().get("/api/recommendations").json()["results"]
        second = APIClient().get("/api/recommendations").json()["results"]
        self.assertEqual([item["id"] for item in first], [item["id"] for item in second])

    def test_caching_does_not_leak_between_users(self):
        draft = self.create_hotel("Mine", owner=self.owner,
                                  status=Hotel.STATUS_DRAFT)
        owner_ids = [item["id"] for item in self.auth(self.owner).get("/api/recommendations").json()["results"]]
        anon_ids = [item["id"] for item in APIClient().get("/api/recommendations").json()["results"]]
        self.assertIn(draft.id, owner_ids)
        self.assertNotIn(draft.id, anon_ids)


class SimilarHotelApiTests(CacheIsolationMixin, FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("sowner")
        self.location = self.create_location()
        self.seed = self.create_hotel("Seed", property_type="villa")

    def test_seed_is_never_in_its_own_results(self):
        self.create_hotel("Neighbour", property_type="villa")
        body = APIClient().get(f"/api/recommendations/similar/{self.seed.id}").json()
        self.assertEqual(body["strategy"], "similar")
        self.assertNotIn(self.seed.id, [item["id"] for item in body["results"]])

    def test_matching_property_type_ranks_first(self):
        match = self.create_hotel("Match", property_type="villa")
        self.create_hotel("Other", property_type="hostel")
        body = APIClient().get(f"/api/recommendations/similar/{self.seed.id}").json()
        self.assertEqual(body["results"][0]["id"], match.id)

    def test_exclude_cannot_reintroduce_seed(self):
        self.create_hotel("Neighbour")
        body = APIClient().get(
            f"/api/recommendations/similar/{self.seed.id}?exclude={self.seed.id}"
        ).json()
        self.assertNotIn(self.seed.id, [item["id"] for item in body["results"]])

    def test_missing_hotel_is_404(self):
        self.assertEqual(
            APIClient().get("/api/recommendations/similar/999999").status_code, 404
        )

    def test_draft_seed_is_404_for_anonymous(self):
        draft = self.create_hotel("Draft", status=Hotel.STATUS_DRAFT)
        self.assertEqual(
            APIClient().get(f"/api/recommendations/similar/{draft.id}").status_code, 404
        )

    def test_draft_hotels_hidden_from_results(self):
        self.create_hotel("Draft", status=Hotel.STATUS_DRAFT)
        body = APIClient().get(f"/api/recommendations/similar/{self.seed.id}").json()
        self.assertNotIn("Draft", [item["name"] for item in body["results"]])

    def test_sold_out_seed_still_returns_alternatives(self):
        # Seed has one unit and it is taken for the requested window; the caller
        # should still get alternatives rather than an empty list.
        guest = self.create_user("sguest")
        self.create_hotel("Alternative", property_type="villa")
        self.create_booking(
            guest, self.seed, status=Booking.STATUS_CONFIRMED,
            check_in=TODAY, check_out=TODAY + timedelta(days=3),
        )
        body = APIClient().get(
            f"/api/recommendations/similar/{self.seed.id}"
            f"?check_in={TODAY.isoformat()}&check_out={(TODAY + timedelta(days=2)).isoformat()}"
        ).json()
        self.assertEqual([item["name"] for item in body["results"]], ["Alternative"])

    def test_limit_is_honoured(self):
        for index in range(3):
            self.create_hotel(f"Neighbour {index}", property_type="villa")
        body = APIClient().get(
            f"/api/recommendations/similar/{self.seed.id}?limit=2"
        ).json()
        self.assertEqual(len(body["results"]), 2)


class HotelSortTests(CacheIsolationMixin, FactoryMixin, TestCase):
    def setUp(self):
        self.owner = self.create_user("hso")
        self.location = self.create_location()

    def test_default_ordering_is_newest_first(self):
        first = self.create_hotel("First")
        second = self.create_hotel("Second")
        body = APIClient().get("/api/hotels").json()
        self.assertEqual([item["id"] for item in body["results"]],
                         [second.id, first.id])

    def test_sort_recommended_reranks_without_breaking_count(self):
        for index in range(3):
            self.create_hotel(f"Hotel {index}")
        body = APIClient().get("/api/hotels?sort=recommended").json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 3)

    def test_sort_recommended_is_deterministic(self):
        for index in range(3):
            self.create_hotel(f"Hotel {index}")
        first = APIClient().get("/api/hotels?sort=recommended").json()["results"]
        second = APIClient().get("/api/hotels?sort=recommended").json()["results"]
        self.assertEqual([item["id"] for item in first], [item["id"] for item in second])

    def test_unknown_sort_falls_back_to_default(self):
        first = self.create_hotel("First")
        second = self.create_hotel("Second")
        body = APIClient().get("/api/hotels?sort=nonsense").json()
        self.assertEqual([item["id"] for item in body["results"]],
                         [second.id, first.id])

    def test_sort_price_uses_cheapest_room(self):
        expensive = Hotel.objects.create(
            owner=self.owner, name="Pricey", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED)
        Room.objects.create(hotel=expensive, name="R", base_price=Decimal("9000.00"),
                            max_guests=2, total_units=1)
        cheap = Hotel.objects.create(
            owner=self.owner, name="Bargain", property_type="hotel",
            location=self.location, status=Hotel.STATUS_PUBLISHED)
        Room.objects.create(hotel=cheap, name="R", base_price=Decimal("900.00"),
                            max_guests=2, total_units=1)
        body = APIClient().get("/api/hotels?sort=price").json()
        self.assertEqual([item["id"] for item in body["results"]], [cheap.id, expensive.id])

    def test_sort_recommended_hides_drafts_from_anonymous(self):
        self.create_hotel("Public")
        self.create_hotel("Hidden", status=Hotel.STATUS_DRAFT)
        body = APIClient().get("/api/hotels?sort=recommended").json()
        self.assertEqual(body["count"], 1)

    def test_pagination_still_works_with_recommended_sort(self):
        for index in range(5):
            self.create_hotel(f"Hotel {index}")
        body = APIClient().get("/api/hotels?sort=recommended&page_size=2").json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])