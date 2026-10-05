"""Per-hotel feature extraction for ranking.

Everything the recommender needs about a hotel is pulled in a single query and
folded into a frozen :class:`HotelFeatures` record, so scoring is pure
arithmetic over plain numbers with no further database round-trips.

Two details are load-bearing:

* ``Count("reviews")`` **must** be ``distinct=True``. Annotating reviews and
  rooms in one query produces a cartesian product, so a hotel with 3 rooms and
  10 reviews would otherwise report 30 reviews and look far more popular than
  it is. ``Avg("reviews__rating")`` survives duplication unchanged (averaging a
  repeated value is idempotent), as do ``Min``/``Max`` over rooms.
* Rating is **Bayesian**, not raw. Without the prior a single 5-star review
  would outrank a 4.6-star hotel with 200 reviews, which is a well-known way to
  surface unvetted properties at the top of a list.
"""
import math
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.db.models import Avg, Count, Max, Min

EARTH_RADIUS_KM = 6371.0088

# Distance at which the geo feature contributes nothing. Beyond this the score
# floors at zero rather than decaying forever, which keeps a far-away hotel from
# being scored as a large negative preference.
GEO_FLOOR_KM = 500.0


@dataclass(frozen=True)
class HotelFeatures:
    """Immutable ranking features for a single hotel."""

    hotel_id: int
    property_type: str
    region: str
    location_name: str
    latitude: float | None
    longitude: float | None
    price: float | None
    max_guests: int | None
    room_count: int
    review_count: int
    bayesian_rating: float
    created_at: datetime | None

    def distance_km(
        self, latitude: float | None, longitude: float | None
    ) -> float | None:
        """Great-circle distance to a reference point, None if a coord is missing."""
        if None in (self.latitude, self.longitude, latitude, longitude):
            return None
        return haversine_km(self.latitude, self.longitude, latitude, longitude)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two WGS84 points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def as_float(value):
    """Coerce a Decimal from the DB into a plain float, preserving None."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def bayesian_rating(
    avg: float | None, count: int, prior: float, prior_weight: float
) -> float:
    """Shrink a rating toward a prior in proportion to how little data backs it."""
    if count <= 0:
        return prior
    observed = avg if avg is not None else prior
    return (prior_weight * prior + observed * count) / (prior_weight + count)


def annotate_hotels(queryset):
    """Add the aggregate annotations :func:`hotel_features` reads.

    Kept separate so callers filter the queryset (visibility, availability)
    *before* paying for the aggregation, and so tests can exercise the SQL
    independently of the scoring maths.
    """
    return queryset.annotate(
        review_count=Count("reviews", distinct=True),
        avg_review_rating=Avg("reviews__rating"),
        min_price=Min("rooms__base_price"),
        max_room_guests=Max("rooms__max_guests"),
        room_count=Count("rooms", distinct=True),
    ).select_related("location")


def hotel_features(queryset, prior: float, prior_weight: float) -> dict[int, HotelFeatures]:
    """Fold an annotated hotel queryset into ``{hotel_id: HotelFeatures}``."""
    features: dict[int, HotelFeatures] = {}

    for hotel in annotate_hotels(queryset):
        count = hotel.review_count or 0
        avg = as_float(hotel.avg_review_rating)
        rating = bayesian_rating(avg, count, prior, prior_weight)

        if count == 0:
            # Nothing in Review to trust. Hotel.avg_rating is a denormalized
            # field that no signal in this codebase maintains, so it is only
            # consulted as a last resort, and a zero there means "unknown"
            # rather than "zero stars".
            stored = float(hotel.avg_rating or 0)
            if stored > 0:
                rating = stored

        features[hotel.id] = HotelFeatures(
            hotel_id=hotel.id,
            property_type=hotel.property_type,
            region=hotel.location.region or "",
            location_name=hotel.location.name,
            latitude=as_float(hotel.location.latitude),
            longitude=as_float(hotel.location.longitude),
            price=as_float(hotel.min_price),
            max_guests=hotel.max_room_guests,
            room_count=hotel.room_count or 0,
            review_count=count,
            bayesian_rating=rating,
            created_at=hotel.created_at,
        )

    return features