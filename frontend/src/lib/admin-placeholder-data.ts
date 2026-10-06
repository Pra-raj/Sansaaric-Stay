import type {
  ActivityEntry,
  AdminBooking,
  AdminHotel,
  InboxMessage,
  TrainingDocument,
} from "@/types";

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

/** Dummy data used until the backend inbox endpoints exist. */
export const dummyInbox: InboxMessage[] = [
  {
    id: "th-1001",
    channel: "chatbot",
    guestName: "Anita Gurung",
    guestEmail: "anita.gurung@example.com",
    subject: "Check-in time for the Pokhara homestay",
    status: "Unread",
    lastMessageAt: minutesAgo(12),
    entries: [
      {
        id: "en-1",
        from: "guest",
        body: "Hi, what time can we check in? Our bus arrives in Pokhara around 9 AM.",
        sentAt: minutesAgo(15),
      },
      {
        id: "en-2",
        from: "bot",
        body: "Standard check-in starts at 2 PM. I couldn't find early check-in details for this property, so I've passed your question to the team.",
        sentAt: minutesAgo(14),
      },
      {
        id: "en-3",
        from: "guest",
        body: "Okay, please let me know if early check-in is possible.",
        sentAt: minutesAgo(12),
      },
    ],
  },
  {
    id: "th-1002",
    channel: "contact-form",
    guestName: "Rohan Shrestha",
    guestEmail: "rohan.shrestha@example.com",
    subject: "Refund for a cancelled booking",
    status: "Unread",
    lastMessageAt: minutesAgo(95),
    entries: [
      {
        id: "en-4",
        from: "guest",
        body: "I cancelled booking bk-2041 three days ago but the refund hasn't reached my eSewa account yet. Can you check the status?",
        sentAt: minutesAgo(95),
      },
    ],
  },
  {
    id: "th-1003",
    channel: "email",
    guestName: "Mira Thapa",
    guestEmail: "mira.thapa@example.com",
    subject: "Do you have homestays near Bandipur?",
    status: "Open",
    lastMessageAt: minutesAgo(60 * 5),
    entries: [
      {
        id: "en-5",
        from: "guest",
        body: "We're a family of five looking for a homestay near Bandipur in November. Do you have anything with two rooms?",
        sentAt: minutesAgo(60 * 6),
      },
      {
        id: "en-6",
        from: "admin",
        body: "Namaste Mira! We have two family-friendly homestays near Bandipur. I'll send the details shortly.",
        sentAt: minutesAgo(60 * 5),
      },
    ],
  },
  {
    id: "th-1004",
    channel: "chatbot",
    guestName: "Kabir Rai",
    guestEmail: "kabir.rai@example.com",
    subject: "Are pets allowed?",
    status: "Open",
    lastMessageAt: minutesAgo(60 * 26),
    entries: [
      {
        id: "en-7",
        from: "guest",
        body: "Can I bring my dog to the homestays in Nagarkot?",
        sentAt: minutesAgo(60 * 26),
      },
      {
        id: "en-8",
        from: "bot",
        body: "Pet policies are set by each host. I don't have a policy on file for Nagarkot stays, so a team member will follow up.",
        sentAt: minutesAgo(60 * 26),
      },
    ],
  },
  {
    id: "th-1005",
    channel: "contact-form",
    guestName: "Sita Karki",
    guestEmail: "sita.karki@example.com",
    subject: "Thank you!",
    status: "Resolved",
    lastMessageAt: minutesAgo(60 * 50),
    entries: [
      {
        id: "en-9",
        from: "guest",
        body: "Just wanted to say our stay in Ghandruk was wonderful. Thank you for the quick help with the booking.",
        sentAt: minutesAgo(60 * 51),
      },
      {
        id: "en-10",
        from: "admin",
        body: "Thank you, Sita! We're glad you enjoyed it. Hope to host you again soon.",
        sentAt: minutesAgo(60 * 50),
      },
    ],
  },
];

export const dummyTrainingDocuments: TrainingDocument[] = [
  {
    id: "doc-1",
    name: "cancellation-and-refund-policy.pdf",
    fileType: "pdf",
    sizeBytes: 482_000,
    status: "Indexed",
    uploadedAt: minutesAgo(60 * 24 * 6),
  },
  {
    id: "doc-2",
    name: "homestay-house-rules.docx",
    fileType: "docx",
    sizeBytes: 96_500,
    status: "Indexed",
    uploadedAt: minutesAgo(60 * 24 * 3),
  },
  {
    id: "doc-3",
    name: "scanned-host-agreement.pdf",
    fileType: "pdf",
    sizeBytes: 2_310_000,
    status: "Failed",
    uploadedAt: minutesAgo(60 * 24),
    errorMessage: "No text could be extracted. The PDF looks like a scan.",
  },
];

// ---------------------------------------------------------------------------
// Hotels and bookings (dummy data until the backend exists)
// ---------------------------------------------------------------------------


export const dummyAdminHotels: AdminHotel[] = [
  {
    id: "h-1",
    name: "Lake View Homestay",
    location: "Pokhara, Nepal",
    propertyType: "Homestay",
    startingPrice: 4500,
    description: "Family-run homestay a short walk from Phewa Lake, with home-cooked Nepali meals.",
    amenities: ["Wi-Fi", "Breakfast", "Lake view"],
    status: "Active",
  },
  {
    id: "h-2",
    name: "Thamel Boutique Stay",
    location: "Kathmandu, Nepal",
    propertyType: "Hotel",
    startingPrice: 6800,
    description: "Small boutique hotel in the middle of Thamel, close to cafes and trekking shops.",
    amenities: ["Wi-Fi", "Air conditioning", "Airport pickup"],
    status: "Active",
  },
  {
    id: "h-3",
    name: "Nagarkot Sunrise Resort",
    location: "Nagarkot, Nepal",
    propertyType: "Resort",
    startingPrice: 9200,
    description: "Hilltop resort with Himalayan sunrise views and a garden restaurant.",
    amenities: ["Wi-Fi", "Restaurant", "Garden", "Parking"],
    status: "Inactive",
  },
];

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

function booking(
  n: number,
  guestName: string,
  hotel: AdminHotel,
  startDaysAgo: number,
  nights: number,
  guests: number,
  status: AdminBooking["status"],
): AdminBooking {
  const checkIn = daysAgo(startDaysAgo);
  const checkOut = daysAgo(startDaysAgo - nights);
  return {
    id: `bk-${2000 + n}`,
    guestName,
    guestEmail: `${guestName.split(" ")[0].toLowerCase()}@example.com`,
    hotelName: hotel.name,
    location: hotel.location,
    checkIn: dateOnly(checkIn),
    checkOut: dateOnly(checkOut),
    guests,
    status,
    totalAmount: hotel.startingPrice * nights,
    bookedAt: new Date(checkIn.getTime() - 9 * 86_400_000).toISOString(),
  };
}

const [h1, h2, h3] = dummyAdminHotels;

export const dummyAdminBookings: AdminBooking[] = [
  booking(1, "Anita Gurung", h1, -12, 3, 2, "Upcoming"),
  booking(2, "Rohan Shrestha", h2, -5, 2, 1, "Upcoming"),
  booking(3, "Mira Thapa", h3, 8, 2, 4, "Completed"),
  booking(4, "Kabir Rai", h1, 22, 4, 3, "Completed"),
  booking(5, "Sita Karki", h2, 41, 3, 2, "Completed"),
  booking(6, "Dipesh Lama", h3, 55, 2, 2, "Cancelled"),
  booking(7, "Anju Magar", h1, 70, 5, 4, "Completed"),
  booking(8, "Bikash Tamang", h2, 96, 2, 1, "Completed"),
  booking(9, "Nisha Basnet", h1, 125, 3, 2, "Completed"),
  booking(10, "Suman Adhikari", h3, 150, 2, 2, "Completed"),
];

// ---------------------------------------------------------------------------
// Activity log (dummy data; the real log must be written by the backend)
// ---------------------------------------------------------------------------


const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function entry(
  n: number,
  minutes: number,
  actor: string,
  category: ActivityEntry["category"],
  action: string,
  target = "",
  level: ActivityEntry["level"] = "info",
): ActivityEntry {
  return {
    id: `ac-${n}`,
    at: ago(minutes),
    actor,
    actorEmail: `${actor.split(" ")[0].toLowerCase()}@sansaaric.example.com`,
    category,
    action,
    target,
    level,
  };
}

export const dummyActivity: ActivityEntry[] = [
  entry(1, 6, "Prayag Raj Karki", "inbox", "replied to", "Mira Thapa"),
  entry(2, 22, "Prayag Raj Karki", "hotel", "updated hotel", "Thamel Boutique Stay"),
  entry(3, 48, "Subesh Pandey", "document", "uploaded document", "cancellation-and-refund-policy.pdf"),
  entry(4, 95, "Subesh Pandey", "security", "signed in"),
  entry(5, 140, "Unknown", "security", "failed sign-in attempt", "admin@sansaaric.example.com", "warning"),
  entry(6, 60 * 5, "Prayag Raj Karki", "hotel", "deactivated hotel", "Nagarkot Sunrise Resort"),
  entry(7, 60 * 7, "Sabin Shrestha", "document", "document failed to index", "scanned-host-agreement.pdf", "warning"),
  entry(8, 60 * 26, "Prayag Raj Karki", "inbox", "resolved conversation with", "Sita Karki"),
  entry(9, 60 * 28, "Prayag Raj Karki", "hotel", "added hotel", "Lake View Homestay"),
  entry(10, 60 * 30, "Subesh Pandey", "booking", "cancelled booking", "bk-2006"),
  entry(11, 60 * 50, "Prayag Raj Karki", "security", "signed in"),
  entry(12, 60 * 52, "Sabin Shrestha", "document", "deleted document", "old-house-rules.txt"),
  entry(13, 60 * 75, "Prayag Raj Karki", "hotel", "updated hotel", "Lake View Homestay"),
];
