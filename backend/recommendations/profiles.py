"""Derives a user's taste profile from past bookings and reviews.

The profile is a small weighted summary rather than a stored model, so it can
never drift out of sync with the underlying rows. Two weight conventions are
used deliberately:

* **Presence weights** (``abs``) drive the categorical and geographic features.
  A guest who stayed somewhere and hated it was still physically in that region
  and still looked at that property type — those facts do not become false
  because the experience was bad.
* **Signed weights** drive the collaborative item-item map. A one-star review
  must actively pull a property's peers *down*, not merely fail to push them up.
"""
import logging
import math
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)

# How much a past interaction counts for, by booking status. A completed stay is
# the strongest evidence; a cancelled booking is weak but not zero, since the
# guest still chose the property.
BOOKING_WEIGHTS = {
    "completed": 1.0,
    "confirmed": 0.8,
    "pending": 0.4,
    "cancelled": 0.1,
}

# Ratings carry an opinion, not just a visit. 3 is a shrug; 1-2 are strong enough
# to cancel out a completed booking, so a guest who was burned stops
# recommending that property's peers to anyone with a similar history.
REVIEW_WEIGHTS = {1: -1.2, 2: -0.8, 3: 0.3, 4: 1.0, 5: 1.0}
DEFAULT_REVIEW_WEIGHT = 1.0


@dataclass(frozen=True)
class TasteProfile:
    """Weighted summary of what a user has stayed at and how they felt about it."""

    user_id: int | None = None
    property_types: dict[str, float] = field(default_factory=dict)
    regions: dict[str, float] = field(default_factory=dict)
    latitude: float | None = None
    longitude: float | None = None
    mean_price: float | None = None
    mean_guests: float | None = None
    interactions: dict[int, float] = field(default_factory=dict)
    interaction_count: int = 0

    @property
    def is_empty(self) -> bool:
        return not self.interactions

    def dominant_property_type(self) -> str | None:
        if not self.property_types:
            return None
        return max(self.property_types.items(), key=lambda item: (item[1], item[0]))[0]

    def dominant_region(self) -> str | None:
        if not self.regions:
            return None
        return max(self.regions.items(), key=lambda item: (item[1], item[0]))[0]


def _recency_weight(when, half_life_days: float) -> float:
    """Exponential decay by age; 1.0 for today, 0.5 at one half-life."""
    if when is None:
        return 0.5
    if isinstance(when, date) and not isinstance(when, timezone.datetime):
        reference = timezone.now().date()
        age_days = max(0, (reference - when).days)
    else:
        reference = timezone.now()
        age_days = max(0.0, (reference - when).total_seconds() / 86400.0)
    if half_life_days <= 0:
        return 1.0
    return math.pow(0.5, age_days / half_life_days)


def _weighted_mean(pairs) -> float | None:
    """Mean of ``(value, weight)`` pairs; None when there is no weight at all."""
    total_weight = sum(weight for _, weight in pairs)
    if total_weight <= 0:
        return None
    return sum(value * weight for value, weight in pairs) / total_weight


def _as_float(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def build_profile(user, half_life_days: float = 180.0) -> TasteProfile:
    """Build a :class:`TasteProfile` for ``user``; an empty one for anonymous."""
    if user is None or not getattr(user, "is_authenticated", False):
        return TasteProfile()

    from bookings.models import Booking
    from reviews.models import Review

    interactions: dict[int, float] = {}
    property_types: dict[str, float] = {}
    regions: dict[str, float] = {}
    geo_points: list[tuple[float, float, float]] = []
    price_pairs: list[tuple[float, float]] = []
    guest_pairs: list[tuple[float, float]] = []
    count = 0

    bookings = (
        Booking.objects.select_related("room", "room__hotel", "room__hotel__location")
        .filter(user=user)
        .order_by("-check_in")
    )
    for booking in bookings:
        hotel = booking.room.hotel
        decay = _recency_weight(booking.check_in, half_life_days)
        signed = BOOKING_WEIGHTS.get(booking.status, DEFAULT_REVIEW_WEIGHT) * decay
        presence = abs(signed)

        interactions[hotel.id] = interactions.get(hotel.id, 0.0) + signed
        property_types[hotel.property_type] = (
            property_types.get(hotel.property_type, 0.0) + presence
        )
        region = hotel.location.region or ""
        if region:
            regions[region] = regions.get(region, 0.0) + presence
        if presence > 0:
            latitude = _as_float(hotel.location.latitude)
            longitude = _as_float(hotel.location.longitude)
            if latitude is not None and longitude is not None:
                geo_points.append((latitude, longitude, presence))

        price = _as_float(booking.room.base_price)
        if price is not None and presence > 0:
            price_pairs.append((price, presence))
        guest_pairs.append((float(booking.guests), presence or 1.0))
        count += 1

    reviews = (
        Review.objects.select_related("hotel", "hotel__location")
        .filter(user=user)
        .order_by("-created_at")
    )
    for review in reviews:
        hotel = review.hotel
        decay = _recency_weight(review.created_at, half_life_days)
        signed = REVIEW_WEIGHTS.get(review.rating, DEFAULT_REVIEW_WEIGHT) * decay
        presence = abs(signed)

        interactions[hotel.id] = interactions.get(hotel.id, 0.0) + signed
        property_types[hotel.property_type] = (
            property_types.get(hotel.property_type, 0.0) + presence
        )
        region = hotel.location.region or ""
        if region:
            regions[region] = regions.get(region, 0.0) + presence
        count += 1

    latitude = longitude = None
    total_geo_weight = sum(weight for _, _, weight in geo_points)
    if total_geo_weight > 0:
        latitude = sum(lat * w for lat, _, w in geo_points) / total_geo_weight
        longitude = sum(lon * w for _, lon, w in geo_points) / total_geo_weight

    profile = TasteProfile(
        user_id=user.id,
        property_types=property_types,
        regions=regions,
        latitude=latitude,
        longitude=longitude,
        mean_price=_weighted_mean(price_pairs),
        mean_guests=_weighted_mean(guest_pairs),
        interactions=interactions,
        interaction_count=count,
    )
    logger.debug(
        "Built taste profile for user=%s interactions=%s", user.id, count
    )
    return profile