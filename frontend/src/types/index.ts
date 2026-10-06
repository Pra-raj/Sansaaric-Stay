export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Destination {
  id: string;
  name: string;
  hotelCount: number;
}

export interface Hotel {
  id: string;
  name: string;
  location: string;
  propertyType: "Hotel" | "Resort" | "Homestay";
  rating: number;
  startingPrice: number;
  tags: string[];
  description: string;
  amenities: string[];
}

export interface Review {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
}

export interface BookingDraft {
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  pricePerNight: number;
  serviceFee: number;
  total: number;
}

export interface Booking {
  id: string;
  hotelName: string;
  location: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  status: "Upcoming" | "Completed" | "Cancelled";
}


// ---------------------------------------------------------------------------
// Admin section
// ---------------------------------------------------------------------------

export type UserRole = "guest" | "admin";

/** Where a conversation came from. Add new channels here as they get wired in. */
export type InboxChannel = "chatbot" | "contact-form" | "email";

export type InboxStatus = "Unread" | "Open" | "Resolved";

export interface InboxEntry {
  id: string;
  /** "bot" = an automated chatbot answer, shown so admins can see what the guest was told. */
  from: "guest" | "admin" | "bot";
  body: string;
  sentAt: string; // ISO timestamp
}

/** One conversation (thread) in the unified inbox. */
export interface InboxMessage {
  id: string;
  channel: InboxChannel;
  guestName: string;
  guestEmail: string;
  subject: string;
  status: InboxStatus;
  lastMessageAt: string; // ISO timestamp
  entries: InboxEntry[];
}

export type TrainingDocumentStatus = "Processing" | "Indexed" | "Failed";

export interface TrainingDocument {
  id: string;
  name: string;
  fileType: "pdf" | "docx" | "txt";
  sizeBytes: number;
  status: TrainingDocumentStatus;
  uploadedAt: string; // ISO timestamp
  errorMessage?: string;
}


// ---------------------------------------------------------------------------
// Admin: hotels, bookings, revenue
// ---------------------------------------------------------------------------

export type HotelStatus = "Active" | "Inactive";

export interface AdminHotel {
  id: string;
  name: string;
  location: string;
  propertyType: Hotel["propertyType"];
  startingPrice: number; // NPR per night
  description: string;
  amenities: string[];
  status: HotelStatus;
}

export type AdminHotelInput = Omit<AdminHotel, "id">;

export interface AdminBooking {
  id: string;
  guestName: string;
  guestEmail: string;
  hotelName: string;
  location: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  status: Booking["status"];
  totalAmount: number; // NPR
  bookedAt: string; // ISO timestamp
}

export interface RevenueMonth {
  month: string; // YYYY-MM
  revenue: number;
  bookings: number;
}

export interface RevenueSummary {
  totalRevenue: number;
  totalBookings: number;
  cancelledBookings: number;
  averageBooking: number;
  months: RevenueMonth[];
}


// ---------------------------------------------------------------------------
// Admin: activity log
// ---------------------------------------------------------------------------

export type ActivityCategory = "hotel" | "booking" | "inbox" | "document" | "security";

export interface ActivityEntry {
  id: string;
  at: string; // ISO timestamp
  actor: string; // who did it
  actorEmail: string;
  category: ActivityCategory;
  action: string; // e.g. "added hotel"
  target: string; // e.g. "Lake View Homestay" (may be empty)
  level: "info" | "warning";
}
