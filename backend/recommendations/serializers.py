"""Request parsing and response shaping for the recommendation endpoints.

Validation lives here rather than in the views so the same rules apply to the
standalone endpoints and to the ``sort=recommended`` re-rank path in
``hotels/views.py``, which imports :class:`RecommendationParams`.
"""
from datetime import date

from rest_framework import serializers

from hotels.serializers import HotelSummarySerializer

from . import cache
from . import scoring
from .availability import available_hotel_ids
from .signals import hotel_features


class RecommendationParams:
    """Parsed and validated query parameters for a recommendation request.

    ``from_query`` raises ``ValidationError`` (rendered as HTTP 400) rather than
    silently falling back on malformed input, so a client that sends a broken
    date finds out instead of quietly receiving unfiltered results.
    """

    def __init__(self, limit, exclude, check_in, check_out, guests):
        self.limit = limit
        self.exclude = exclude
        self.check_in = check_in
        self.check_out = check_out
        self.guests = guests

    @classmethod
    def from_query(cls, query_params, default_limit=None):
        cfg = scoring.config()

        limit = cls._parse_limit(
            query_params.get("limit"),
            default_limit
            if default_limit is not None
            else cfg.get("DEFAULT_LIMIT", 8),
            cfg.get("MAX_LIMIT", 50),
        )

        exclude = set()
        raw_exclude = query_params.get("exclude")
        if raw_exclude:
            for chunk in raw_exclude.split(","):
                chunk = chunk.strip()
                if not chunk:
                    continue
                try:
                    exclude.add(int(chunk))
                except ValueError:
                    raise serializers.ValidationError(
                        {"exclude": "Must be a comma-separated list of hotel ids."}
                    )

        check_in = cls._parse_date(query_params.get("check_in"), "check_in")
        check_out = cls._parse_date(query_params.get("check_out"), "check_out")

        if bool(check_in) != bool(check_out):
            raise serializers.ValidationError(
                {"check_in": "check_in and check_out must be sent together."}
            )
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError(
                {"check_out": "Must be after check_in."}
            )

        guests = cls._parse_guests(query_params.get("guests"))
        if guests and not check_in:
            raise serializers.ValidationError(
                {"guests": "guests requires check_in and check_out."}
            )

        return cls(limit, exclude, check_in, check_out, guests)

    @staticmethod
    def _parse_limit(raw, default, maximum):
        if raw in (None, ""):
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"limit": "Must be an integer."})
        if value < 1:
            raise serializers.ValidationError({"limit": "Must be at least 1."})
        return min(value, maximum)

    @staticmethod
    def _parse_date(raw, field):
        if not raw:
            return None
        try:
            return date.fromisoformat(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {field: "Must be an ISO date (YYYY-MM-DD)."}
            )

    @staticmethod
    def _parse_guests(raw):
        if raw in (None, ""):
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"guests": "Must be an integer."})
        if value < 1:
            raise serializers.ValidationError({"guests": "Must be at least 1."})
        return value

    def available_ids(self):
        """Hotel ids with inventory for the requested window, or None if unfiltered."""
        if not self.check_in or not self.check_out:
            return None
        return available_hotel_ids(self.check_in, self.check_out, self.guests)

    def cache_key(self, user_id, **extra):
        return cache.cache_key(
            user_id,
            self.limit,
            self.exclude,
            self.check_in,
            self.check_out,
            self.guests,
            **extra,
        )


class RecommendationResponseSerializer(serializers.Serializer):
    """Envelope documenting which ranking path produced the results."""

    strategy = serializers.CharField(
        help_text="'personalized' for a user with enough history, else 'popular'."
    )
    cold_start = serializers.BooleanField(
        help_text="True when collaborative signals were not yet trusted."
    )
    results = HotelSummarySerializer(many=True)


def serialize_results(scored, hotels_by_id, strategy, cold_start):
    """Render ``{strategy, cold_start, results}`` preserving the scored order.

    Iterating ``scored`` (rather than the hydrated hotels) is what keeps the
    ranking intact; ``hotels_by_id`` is only a lookup table.
    """
    results = []
    for item in scored:
        hotel = hotels_by_id.get(item.hotel_id)
        if hotel is not None:
            results.append(HotelSummarySerializer(hotel).data)
    return {
        "strategy": strategy,
        "cold_start": cold_start,
        "results": results,
    }


def rank_visible_hotels(user, params, exclude=None):
    """Rank the hotels ``user`` can see, honouring availability and exclusions.

    Availability is applied by filtering the candidate pool rather than
    post-filtering, so a sold-out hotel cannot occupy a top-N slot and push a
    bookable one out of the results.

    Returns ``(scored, hotels_by_id)`` where ``hotels_by_id`` maps ranked ids to
    real ``Hotel`` instances for serialization — the ranking itself runs on
    :class:`~recommendations.signals.HotelFeatures`, which is not serializable.
    """
    from api.visibility import visible_hotel_list

    cfg = scoring.config()
    queryset = visible_hotel_list(user)

    unavailable = params.available_ids()
    if unavailable is not None:
        queryset = queryset.filter(id__in=unavailable)

    features = hotel_features(
        queryset, cfg.get("RATING_PRIOR", 3.5), cfg.get("RATING_PRIOR_WEIGHT", 8.0)
    )
    profile = scoring.build_profile(
        user if getattr(user, "is_authenticated", False) else None
    )

    blocked = set(params.exclude) | set(exclude or ())
    scored = scoring.rank(features, profile, cfg, exclude=blocked)
    return scored, hydrate_hotels(scored, features, queryset)


def hydrate_hotels(scored, features, queryset):
    """Fetch the ``Hotel`` rows for ranked ids that actually have features."""
    wanted = [item.hotel_id for item in scored if item.hotel_id in features]
    if not wanted:
        return {}
    hotels = queryset.select_related("location").filter(id__in=wanted)
    return {hotel.id: hotel for hotel in hotels}