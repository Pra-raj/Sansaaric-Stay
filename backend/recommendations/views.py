"""Recommendation endpoints.

Both are public and both delegate visibility to the same helpers the rest of
the API uses, so a draft or archived hotel is unreachable here exactly as it is
on ``/api/hotels``.
"""
import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import DetailErrorSerializer
from api.visibility import visible_hotel_or_404

from . import cache
from . import scoring
from .serializers import (
    RecommendationParams,
    RecommendationResponseSerializer,
    serialize_results,
)

logger = logging.getLogger(__name__)

FIELD_ERRORS = {"type": "object", "additionalProperties": {}}

LIMIT_PARAMETER = OpenApiParameter(
    "limit", int, OpenApiParameter.QUERY, description="Items to return."
)
EXCLUDE_PARAMETER = OpenApiParameter(
    "exclude",
    str,
    OpenApiParameter.QUERY,
    description="Comma-separated hotel ids to leave out.",
)
WINDOW_PARAMETERS = [
    OpenApiParameter(
        "check_in", str, OpenApiParameter.QUERY, description="ISO date; needs check_out."
    ),
    OpenApiParameter(
        "check_out", str, OpenApiParameter.QUERY, description="ISO date; needs check_in."
    ),
    OpenApiParameter(
        "guests", int, OpenApiParameter.QUERY, description="Party size; needs both dates."
    ),
]


class RecommendationListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="recommendations_list",
        tags=["Recommendations"],
        auth=[],
        summary="Personalized hotel picks, or popularity-ranked for anonymous callers.",
        parameters=[LIMIT_PARAMETER, EXCLUDE_PARAMETER, *WINDOW_PARAMETERS],
        responses={
            200: RecommendationResponseSerializer,
            400: FIELD_ERRORS,
        },
    )
    def get(self, request):
        params = RecommendationParams.from_query(request.query_params)
        user_id = request.user.id if request.user.is_authenticated else None

        key = params.cache_key(user_id)
        cached = cache.cached(key)
        if cached is not None:
            return Response(cached)

        from .serializers import rank_visible_hotels

        scored, hotels_by_id = rank_visible_hotels(request.user, params)
        scored = scored[: params.limit]

        profile = scoring.build_profile(
            request.user if request.user.is_authenticated else None
        )
        payload = serialize_results(
            scored,
            hotels_by_id,
            scoring.strategy_for(profile),
            scoring.is_cold_start(profile),
        )
        cache.cache(key, payload)
        logger.info(
            "recommendations user=%s strategy=%s cold_start=%s returned=%d",
            user_id or "anon",
            payload["strategy"],
            payload["cold_start"],
            len(payload["results"]),
        )
        return Response(payload)


class SimilarHotelListView(APIView):
    @extend_schema(
        methods=["GET"],
        operation_id="recommendations_similar",
        tags=["Recommendations"],
        auth=[],
        summary="Hotels similar to the given property, by co-stay and content fit.",
        parameters=[
            OpenApiParameter(
                "limit", int, OpenApiParameter.QUERY, description="Items to return."
            ),
        ],
        responses={
            200: RecommendationResponseSerializer,
            404: DetailErrorSerializer,
        },
    )
    def get(self, request, hotel_id):
        hotel = visible_hotel_or_404(hotel_id, request.user)
        user_id = request.user.id if request.user.is_authenticated else None

        cfg = scoring.config()
        params = RecommendationParams.from_query(
            request.query_params, default_limit=cfg.get("DEFAULT_SIMILAR_LIMIT", 6)
        )
        # The seed can never appear in its own results, whatever `exclude` says.
        params.exclude.add(hotel.id)

        # Keyed on the caller's identity, not a shared anonymous key: owners and
        # staff legitimately see their own draft properties here, and a shared
        # key would hand those results to anonymous callers.
        key = params.cache_key(user_id, seed=hotel.id)
        cached = cache.cached(key)
        if cached is not None:
            return Response(cached)

        from api.visibility import visible_hotel_list
        from .signals import hotel_features

        queryset = visible_hotel_list(request.user)
        unavailable = params.available_ids()
        if unavailable is not None:
            queryset = queryset.filter(id__in=unavailable)

        features = hotel_features(
            queryset, cfg.get("RATING_PRIOR", 3.5), cfg.get("RATING_PRIOR_WEIGHT", 8.0)
        )

        if hotel.id not in features:
            # The seed itself is sold out for the requested window, so the
            # availability filter dropped it. Similarity is still meaningful —
            # people want alternatives, not an empty list — so re-admit the seed
            # for feature extraction only. It can never appear in the output,
            # because `scoring.similar` always excludes the seed id.
            features.update(
                hotel_features(
                    visible_hotel_list(request.user).filter(id=hotel.id),
                    cfg.get("RATING_PRIOR", 3.5),
                    cfg.get("RATING_PRIOR_WEIGHT", 8.0),
                )
            )

        scored = scoring.similar(features, hotel.id, cfg, user_id)[: params.limit]

        hotels = visible_hotel_list(request.user).select_related("location").filter(
            id__in=[item.hotel_id for item in scored]
        )
        payload = serialize_results(
            scored, {item.id: item for item in hotels}, "similar", False
        )
        cache.cache(key, payload)
        return Response(payload)