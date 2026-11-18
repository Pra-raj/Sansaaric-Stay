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
  /** Title-cased backend property_type (Hotel, Resort, Homestay, Villa, ...). */
  propertyType: string;
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
  /** ISO timestamp, when the backend sends one. */
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Media (hotel photos/video + the guest reel feed)
// ---------------------------------------------------------------------------

export interface HotelPhoto {
  id: string;
  url: string;
  /** 0 = cover photo. */
  position: number;
}

export interface HotelVideo {
  url: string;
  posterUrl?: string;
}

/** Shape of GET /hotels/{id}/media. */
export interface HotelMediaApi {
  photos: HotelPhoto[];
  video: HotelVideo | null;
}

/** One item of the guest video feed (GET /reels). */
export interface Reel {
  id: string;
  hotelId: string;
  hotelName: string;
  location: string;
  videoUrl: string;
  posterUrl: string;
  /** Price per night in NPR, when the API sends one. */
  startingPrice?: number;
  caption?: string;
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
  /** Backend status, kept so actions can depend on the real state. */
  rawStatus?: "pending" | "confirmed" | "cancelled" | "completed";
  /** Server-provided shortcut: this stay has already been reviewed. */
  hasReview?: boolean;
  /** Owner of the booking (staff accounts receive everyone's bookings). */
  userId?: string;
}


// ---------------------------------------------------------------------------
// Admin section
// ---------------------------------------------------------------------------

/** Mirrors backend Profile.role choices, plus "admin" which comes from is_staff. */
export type UserRole = "guest" | "hotel_owner" | "admin";

/** Mirrors chat.Conversation.CHANNEL_CHOICES. */
export type InboxChannel = "Website" | "Facebook" | "Instagram" | "WhatsApp";

export const INBOX_CHANNELS: readonly InboxChannel[] = [
  "Website",
  "Facebook",
  "Instagram",
  "WhatsApp",
];

export interface InboxEntry {
  id: string;
  /** Who wrote it: the guest, the AI bot, or a staff member. */
  from: "guest" | "admin" | "bot";
  body: string;
  sentAt: string; // ISO timestamp
  /** Mirrors chat.services.chunk_citation, when the answer came from documents. */
  citations?: {
    source?: string;
    title?: string;
    page?: number | null;
    text?: string;
  }[];
}

/** One row of the conversation list (GET /admin/inbox). */
export interface InboxListItem {
  id: string;
  channel: InboxChannel;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
  lastMessageAt: string; // ISO timestamp
  snippet: string;
  /** Present on thread payloads (list rows may omit them). */
  createdAt?: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
}

/** A list row plus its full message history (GET /admin/inbox/{id}). */
export interface InboxThread extends InboxListItem {
  entries: InboxEntry[];
}

/** Mirrors ReferenceDocument.status choices from document_ingestion. */
export type TrainingDocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface TrainingDocument {
  id: string;
  name: string;
  fileType: "pdf" | "docx" | "txt" | "md" | "csv" | "xlsx" | "xls";
  sizeBytes: number;
  status: TrainingDocumentStatus;
  uploadedAt: string; // ISO timestamp
  errorMessage?: string;
  chunkCount: number;
}

export interface TrainingChunk {
  index: number;
  content: string;
}

export interface TrainingDocumentDetail extends TrainingDocument {
  chunks: TrainingChunk[];
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
