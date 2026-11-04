"""
Test data for Sansaaric Stay.

Run from the backend folder (venv on):
    python seed.py            add test data (safe to run twice)
    python seed.py --reset    delete the test data first, then add it again
    python seed.py --clear    delete the test data only

Only touches rows it made itself (users named seed-*). Your own data is safe.
Run it ONLY on your own Supabase project.
"""
import os
import sys
import uuid
import random
from datetime import date, timedelta
from decimal import Decimal

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE, ".env"))
except ImportError:
    pass

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.db import transaction  # noqa: E402
from django.db.models import Avg, Q  # noqa: E402

from auth.models import Profile  # noqa: E402
from bookings.models import Booking  # noqa: E402
from hotels.models import Hotel, Location  # noqa: E402
from reviews.models import Review  # noqa: E402
from rooms.models import Room  # noqa: E402

User = get_user_model()
NS = uuid.UUID("5a5a5a5a-0000-4000-8000-000000000001")  # fixed, so reruns match

LOCATIONS = [
    ("Pokhara", "Gandaki", "28.209600", "83.985600"),
    ("Kathmandu", "Bagmati", "27.717200", "85.324000"),
    ("Nagarkot", "Bagmati", "27.715000", "85.520000"),
    ("Bandipur", "Gandaki", "27.937000", "84.411000"),
    ("Ghandruk", "Gandaki", "28.375000", "83.807000"),
    ("Chitwan", "Bagmati", "27.529000", "84.354000"),
    ("Lumbini", "Lumbini", "27.469000", "83.276000"),
]

OWNERS = [f"seed-owner-{i}" for i in range(1, 6)]
GUESTS = [f"seed-guest-{i}" for i in range(1, 9)]

# name, type, location, status, owner idx, address, description, rooms[(name, price, guests, units)]
# Places have different numbers of published stays on purpose:
# Pokhara 7, Kathmandu 6, Chitwan 4, Nagarkot 3, Lumbini 3, Bandipur 2, Ghandruk 2
# (plus one draft in Kathmandu and one archived in Nagarkot, hidden from guests)
HOTELS = [
    # ---- Pokhara (7)
    ("Lakeside Retreat Pokhara", "hotel", "Pokhara", "published", 0, "Lakeside Rd, Pokhara",
     "Calm rooms a short walk from Phewa Lake. Breakfast on the terrace with Annapurna views.",
     [("Standard Double", 4500, 2, 6), ("Lake View Deluxe", 7200, 3, 4), ("Family Suite", 11000, 5, 2)]),
    ("Pokhara Backpackers Hostel", "hostel", "Pokhara", "published", 1, "Damside, Pokhara",
     "Clean, friendly hostel for solo travellers. Dorm beds, a rooftop and a shared kitchen.",
     [("6-Bed Dorm", 900, 1, 10), ("Private Twin", 2200, 2, 3)]),
    ("Phewa View Resort", "resort", "Pokhara", "published", 3, "Khahare, Pokhara",
     "Lakeside resort with a pool, spa and sunset boat rides on Phewa Lake.",
     [("Garden Room", 9500, 2, 8), ("Pool Villa", 16500, 4, 3)]),
    ("Fishtail Mountain Lodge", "guesthouse", "Pokhara", "published", 4, "Sarangkot Road, Pokhara",
     "Family-run lodge with a view of Machhapuchhre. Good base for treks.",
     [("Mountain Room", 3200, 2, 6), ("Triple Room", 4300, 3, 3)]),
    ("Damside Garden Homestay", "homestay", "Pokhara", "published", 1, "Damside, Pokhara",
     "Warm homestay in a quiet garden. Home-cooked Nepali breakfast included.",
     [("Garden Room", 2400, 2, 4), ("Family Room", 3600, 4, 2)]),
    ("Annapurna Panorama Hotel", "hotel", "Pokhara", "published", 3, "Lakeside, Pokhara",
     "Modern hotel with rooftop restaurant and full Annapurna panorama.",
     [("Superior Double", 6000, 2, 10), ("Panorama Suite", 12500, 3, 2)]),
    ("Sarangkot Sunrise Villa", "villa", "Pokhara", "published", 4, "Sarangkot, Pokhara",
     "Private hilltop villa. Sunrise over the Himalayas from the bedroom window.",
     [("Entire Villa", 19000, 6, 2)]),
    # ---- Kathmandu (6 published + 1 draft)
    ("Thamel Heritage Inn", "hotel", "Kathmandu", "published", 0, "Thamel, Kathmandu",
     "Newari-style hotel in the middle of Thamel. Walk to Durbar Square and the markets.",
     [("Single Room", 3000, 1, 5), ("Double Room", 4800, 2, 8), ("Heritage Suite", 9500, 3, 2)]),
    ("Kathmandu Boutique Stay", "hotel", "Kathmandu", "draft", 2, "Patan, Lalitpur",
     "Draft listing: small boutique hotel near Patan Durbar Square. Not public yet.",
     [("Courtyard Room", 6500, 2, 4)]),
    ("Boudha Stupa Guesthouse", "guesthouse", "Kathmandu", "published", 2, "Boudhanath, Kathmandu",
     "Peaceful guesthouse a minute from the Boudha stupa. Monastery views from the roof.",
     [("Standard Room", 3500, 2, 6), ("Deluxe Room", 5200, 3, 3)]),
    ("Patan Durbar Heritage Hotel", "hotel", "Kathmandu", "published", 0, "Patan Durbar Square, Lalitpur",
     "Restored Newari building beside Patan Durbar Square. Courtyard cafe and craft shops.",
     [("Courtyard Double", 7800, 2, 6), ("Heritage Suite", 13500, 4, 2)]),
    ("Swayambhu Hilltop Apartment", "apartment", "Kathmandu", "published", 3, "Swayambhu, Kathmandu",
     "Fully furnished apartment with a kitchen, close to the Monkey Temple.",
     [("1-Bedroom Apartment", 5600, 3, 4), ("2-Bedroom Apartment", 8800, 5, 2)]),
    ("Kathmandu Budget Hostel", "hostel", "Kathmandu", "published", 4, "Jyatha, Kathmandu",
     "Cheap, clean dorms and private rooms for travellers on a budget.",
     [("8-Bed Dorm", 800, 1, 12), ("Private Room", 1900, 2, 4)]),
    ("Valley Courtyard Inn", "hotel", "Kathmandu", "published", 1, "Bhaktapur Road, Kathmandu",
     "Mid-range inn around a quiet courtyard. Airport pickup and a rooftop breakfast.",
     [("Standard Double", 4100, 2, 8), ("Family Room", 6200, 4, 3)]),
    # ---- Chitwan (4)
    ("Chitwan Jungle Villa", "villa", "Chitwan", "published", 2, "Sauraha, Chitwan",
     "Private villa near the national park. Jeep safari, canoe ride and bird watching on request.",
     [("Garden Villa", 12000, 4, 3), ("Riverside Villa", 18000, 6, 2)]),
    ("Rapti River Resort", "resort", "Chitwan", "published", 3, "Rapti River, Sauraha",
     "Riverside resort with an open-air restaurant and elephant-spotting walks.",
     [("Cottage", 8200, 2, 8), ("Family Cottage", 12800, 4, 4)]),
    ("Sauraha Tharu Homestay", "homestay", "Chitwan", "published", 1, "Sauraha, Chitwan",
     "Stay with a Tharu family. Cultural dance in the evening and village walks.",
     [("Mud-House Room", 2600, 2, 4), ("Family Room", 3800, 4, 2)]),
    ("Safari Edge Lodge", "hotel", "Chitwan", "published", 4, "Jungle Edge, Sauraha",
     "Comfortable lodge right on the park edge. Early morning safari packages.",
     [("Standard Room", 5400, 2, 8), ("Deluxe Room", 7600, 3, 4)]),
    # ---- Nagarkot (3 published + 1 archived)
    ("Nagarkot Sunrise Resort", "resort", "Nagarkot", "published", 2, "Nagarkot Hill, Bhaktapur",
     "Hilltop resort known for sunrise over the Himalayan range. Garden, spa and bonfire nights.",
     [("Garden Cottage", 8500, 2, 5), ("Valley Suite", 14500, 4, 3)]),
    ("Old Mountain Lodge", "other", "Nagarkot", "archived", 1, "Nagarkot Ridge",
     "Archived listing: closed for renovation. Kept to test the archived status.",
     [("Lodge Room", 3500, 2, 3)]),
    ("Himalayan View Cottage", "guesthouse", "Nagarkot", "published", 3, "Nagarkot Ridge, Bhaktapur",
     "Simple cottages with a wood stove and a clear view of the peaks.",
     [("Cottage Room", 4200, 2, 5), ("Twin Cottage", 5000, 3, 3)]),
    ("Nagarkot Cloud Homestay", "homestay", "Nagarkot", "published", 4, "Nagarkot Village, Bhaktapur",
     "Village homestay above the clouds. Bonfire dinners and a sunrise walk with your host.",
     [("Hillside Room", 3000, 2, 4), ("Family Room", 4400, 4, 2)]),
    # ---- Lumbini (3)
    ("Lumbini Peace Apartment", "apartment", "Lumbini", "published", 0, "Near Sacred Garden, Lumbini",
     "Self-contained apartment close to the Buddha's birthplace. Kitchen, balcony and parking.",
     [("1-Bedroom Apartment", 5200, 3, 3), ("2-Bedroom Apartment", 8200, 5, 2)]),
    ("Monastery Zone Guesthouse", "guesthouse", "Lumbini", "published", 4, "Monastery Zone, Lumbini",
     "Quiet guesthouse between the monasteries. Cycle rentals available.",
     [("Standard Room", 2800, 2, 6), ("Family Room", 4200, 4, 2)]),
    ("Siddhartha Garden Hotel", "hotel", "Lumbini", "published", 3, "Lumbini Bazaar",
     "Garden hotel with a restaurant and airport pickup.",
     [("Deluxe Room", 5900, 2, 8), ("Suite", 9800, 4, 2)]),
    # ---- Bandipur (2)
    ("Bandipur Old Bazaar House", "guesthouse", "Bandipur", "published", 1, "Bandipur Bazaar, Tanahun",
     "Restored townhouse on a car-free hill town street. Quiet evenings, valley views.",
     [("Bazaar Room", 3200, 2, 4), ("Attic Room", 2800, 2, 2)]),
    ("Thani Mai Homestay", "homestay", "Bandipur", "published", 0, "Thani Mai, Bandipur",
     "Hill homestay next to the Thani Mai temple. Sunset tea on the terrace.",
     [("Valley Room", 2700, 2, 3), ("Family Room", 3900, 4, 1)]),
    # ---- Ghandruk (2)
    ("Himalayan Homestay Ghandruk", "homestay", "Ghandruk", "published", 1, "Ghandruk Village, Kaski",
     "Stay with a Gurung family. Home-cooked dal bhat, a stone-roof house and mountain sunrise.",
     [("Twin Room", 2500, 2, 4), ("Family Room", 4000, 4, 2)]),
    ("Gurung Heritage Lodge", "guesthouse", "Ghandruk", "published", 2, "Upper Ghandruk, Kaski",
     "Stone lodge on the Annapurna trek route with a small Gurung museum next door.",
     [("Trek Room", 2200, 2, 6), ("Family Room", 3500, 4, 2)]),
]

COMMENTS = {
    5: ["Wonderful stay, the staff were so kind.", "Clean, quiet and great views. Will come back.",
        "Best value we found in Nepal."],
    4: ["Very good overall, breakfast could be bigger.", "Nice place, easy to find."],
    3: ["Okay stay. Rooms were a bit small."],
}


def guard():
    if not settings.DEBUG:
        sys.exit("STOP: DJANGO_DEBUG is off. Seed only runs in test mode.")
    host = settings.DATABASES["default"].get("HOST")
    print(f"Database host: {host}")
    if "--yes" not in sys.argv:
        if input("Is this YOUR OWN test Supabase? Type yes to continue: ").strip().lower() != "yes":
            sys.exit("Cancelled.")


def clear():
    users = User.objects.filter(username__startswith="seed-")
    Review.objects.filter(user__in=users).delete()
    Review.objects.filter(hotel__owner__in=users).delete()
    Booking.objects.filter(user__in=users).delete()
    Booking.objects.filter(room__hotel__owner__in=users).delete()
    Room.objects.filter(hotel__owner__in=users).delete()
    Hotel.objects.filter(owner__in=users).delete()
    users.delete()  # profiles go with them
    print("Old test data removed.")


def make_user(username, role):
    user, created = User.objects.get_or_create(
        username=username, defaults={"email": f"{username}@example.test"}
    )
    if created:
        user.set_unusable_password()
        user.save()
    Profile.objects.get_or_create(
        user=user,
        defaults={"supabase_uid": uuid.uuid5(NS, username), "role": role},
    )
    return user


@transaction.atomic
def seed():
    locs = {}
    for name, region, lat, lng in LOCATIONS:
        loc, _ = Location.objects.get_or_create(
            name=name, region=region,
            defaults={"latitude": Decimal(lat), "longitude": Decimal(lng)},
        )
        locs[name] = loc

    owners = [make_user(n, Profile.ROLE_HOTEL_OWNER) for n in OWNERS]
    guests = [make_user(n, Profile.ROLE_GUEST) for n in GUESTS]

    all_rooms = {}
    for name, ptype, loc, status, oi, addr, desc, rooms in HOTELS:
        hotel, _ = Hotel.objects.get_or_create(
            owner=owners[oi], name=name,
            defaults=dict(property_type=ptype, location=locs[loc], address=addr,
                          description=desc, status=status),
        )
        all_rooms[hotel.id] = []
        for rname, price, mg, units in rooms:
            room, _ = Room.objects.get_or_create(
                hotel=hotel, name=rname,
                defaults=dict(base_price=Decimal(price), max_guests=mg, total_units=units),
            )
            all_rooms[hotel.id].append(room)

    # Bookings + reviews: a few per published hotel. A hotel that already has
    # seed bookings is skipped, so running the seed again only fills new hotels.
    today = date.today()
    weights = ["completed"] * 9 + ["confirmed"] * 5 + ["pending"] * 3 + ["cancelled"] * 3
    for hotel in Hotel.objects.filter(owner__in=owners, status="published"):
        if Booking.objects.filter(room__hotel=hotel, user__in=guests).exists():
            continue
        rng = random.Random(hotel.name)  # same result every run
        rooms = all_rooms.get(hotel.id) or list(hotel.rooms.all())
        for i in range(rng.randint(3, 6)):
            status = rng.choice(weights)
            room = rng.choice(rooms)
            guest = rng.choice(guests)
            nights = rng.randint(1, 4)
            if status == "completed":
                cin = today - timedelta(days=rng.randint(10, 150))
            elif status == "cancelled":
                cin = today + timedelta(days=rng.randint(-30, 40))
            else:
                cin = today + timedelta(days=rng.randint(2, 60))
            booking = Booking.objects.create(
                user=guest, room=room, check_in=cin, check_out=cin + timedelta(days=nights),
                guests=min(room.max_guests, rng.randint(1, 3)),
                status=status, total_amount=room.base_price * nights,
            )
            if status == "completed":
                rating = rng.choice([5, 5, 5, 4, 4, 3])
                Review.objects.create(
                    booking=booking, user=guest, hotel=hotel, rating=rating,
                    comment=rng.choice(COMMENTS[rating]),
                )

    for h in Hotel.objects.filter(owner__in=owners):
        avg = Review.objects.filter(hotel=h).aggregate(a=Avg("rating"))["a"]
        h.avg_rating = round(Decimal(str(avg or 0)), 2)
        h.save(update_fields=["avg_rating"])


if __name__ == "__main__":
    guard()
    if "--reset" in sys.argv or "--clear" in sys.argv:
        clear()
    if "--clear" not in sys.argv:
        seed()
        from django.db.models import Count
        for loc in Location.objects.annotate(n=Count("hotels", filter=Q(hotels__status="published"))).filter(n__gt=0).order_by("-n"):
            print(f"  {loc.name}: {loc.n} published stays")
        print(f"Done: {Location.objects.count()} locations, {Hotel.objects.count()} hotels, "
              f"{Room.objects.count()} rooms, {Booking.objects.count()} bookings, "
              f"{Review.objects.count()} reviews.")
