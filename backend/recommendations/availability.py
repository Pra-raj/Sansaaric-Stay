"""Read-only availability filtering for recommendations.

No availability logic exists elsewhere in this codebase — ``BookingCreateSerializer``
never compares ``Room.total_units`` against overlapping bookings — so a
recommender that ignored this could routinely surface a sold-out property as a
top pick. This module supplies the missing check for the read path only; it does
not change how bookings are created.

Overlap test is the standard half-open interval one, ``existing.check_in <
requested.check_out AND existing.check_out > requested.check_in``, which
correctly treats a checkout day as available for a new check-in.
"""
import logging
from collections import Counter

logger = logging.getLogger(__name__)

# Pending holds inventory: a guest mid-checkout flow should not be shown a room
# that is already earmarked for them. Cancelled bookings release it.
BLOCKING_STATUSES = ("pending", "confirmed", "completed")


def available_hotel_ids(check_in, check_out, guests=None) -> set[int]:
    """Ids of hotels with at least one room that fits the party and is not sold out.

    ``guests`` of None means "any size"; otherwise only rooms whose
    ``max_guests`` can seat the party qualify.
    """
    from bookings.models import Booking
    from rooms.models import Room

    overlapping = (
        Booking.objects.filter(
            status__in=BLOCKING_STATUSES,
            check_in__lt=check_out,
            check_out__gt=check_in,
        )
        .values_list("room_id", flat=True)
    )
    # One query to count competing bookings per room...
    taken = Counter(overlapping)

    rooms = Room.objects.all()
    if guests:
        rooms = rooms.filter(max_guests__gte=guests)

    # ...and one to read capacity. Avoids the row-per-booking explosion of
    # counting overlaps inside a per-room loop.
    inventory = rooms.values_list("id", "hotel_id", "total_units")

    available = {
        hotel_id
        for room_id, hotel_id, units in inventory
        if units and taken.get(room_id, 0) < units
    }
    logger.debug(
        "Availability window %s..%s guests=%s -> %s hotels",
        check_in,
        check_out,
        guests,
        len(available),
    )
    return available