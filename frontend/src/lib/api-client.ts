import { dummyBookings, dummyHotels, dummyReviews } from "./placeholder-data";
import { getAccessToken, refreshAccessToken, clearSession } from "./auth";
import { API_BASE_URL } from "./api-base";
import { simulateNetwork } from "./simulate-network";
import { matchesLocation } from "./hotel-filter";
import { getFileExtension } from "./admin-utils";
import {
  LIMITS,
  isMockAllowed,
  isSafeId,
  sanitizeFileName,
} from "./admin-security";
import type {
  ActivityCategory,
  ActivityEntry,
  AdminBooking,
  AdminHotel,
  AdminHotelInput,
  Booking,
  Destination,
  Hotel,
  InboxChannel,
  InboxListItem,
  InboxThread,
  Review,
  RevenueSummary,
  TrainingChunk,
  TrainingDocument,
  TrainingDocumentDetail,
  TrainingDocumentStatus,
} from "@/types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function doApiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hadToken = Boolean(getAccessToken());
  let res = await doApiFetch(path, options);
  if (res.status === 401 && hadToken) {
    // Access token expired mid-session: refresh once and retry. A failed
    // refresh means the session is gone for good.
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doApiFetch(path, options);
    } else {
      clearSession();
    }
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body — leave body as null
    }
    throw new ApiError(
      apiErrorMessage(body) ?? `Request to ${path} failed (${res.status})`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Pulls a human-readable message out of a DRF-style error body: {detail},
 * {error}, {message}, or a field map of messages. Returns null when none.
 */
function apiErrorMessage(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) return body;
  if (Array.isArray(body) && body.some((m) => typeof m === "string")) {
    return (body as string[]).join("; ");
  }
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  for (const key of ["detail", "error", "message"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const field = Object.entries(record).find(
    ([, value]) => typeof value === "string" || (Array.isArray(value) && value.some((m) => typeof m === "string")),
  );
  if (!field) return null;
  const value = field[1];
  return Array.isArray(value) ? (value as string[]).join("; ") : (value as string);
}

// List endpoints are paginated: {count, next, previous, results}.
// Unwrap so callers get the bare array they expect.
async function apiList<T>(path: string): Promise<T[]> {
  const data = await apiFetch<T[] | { results: T[] }>(path);
  return Array.isArray(data) ? data : data.results ?? [];
}

// ---------------------------------------------------------------------------
// Backend → UI normalizers (same pattern as normalizeInbox/normalizeDocument)
// ---------------------------------------------------------------------------

/** Backend HotelSummarySerializer payload (hotels, recommendations). */
interface RawHotel {
  id: number | string;
  name: string;
  property_type?: string;
  location?: { name?: string; region?: string } | null;
  description?: string;
  avg_rating?: number | string;
  min_price?: number | string | null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeHotel(raw: RawHotel): Hotel {
  const loc = raw.location;
  return {
    id: String(raw.id),
    name: raw.name ?? "",
    location: [loc?.name, loc?.region].filter(Boolean).join(", "),
    propertyType: titleCase(raw.property_type ?? "hotel"),
    rating: Number(raw.avg_rating ?? 0),
    startingPrice: Number(raw.min_price ?? 0),
    tags: [],
    amenities: [],
    description: raw.description ?? "",
  };
}

/** Backend public review: identity is deliberately never exposed. */
interface RawHotelReview {
  id: number | string;
  rating: number | string;
  comment?: string;
}

function normalizeReview(raw: RawHotelReview): Review {
  return {
    id: String(raw.id),
    authorName: "Guest",
    rating: Number(raw.rating),
    comment: raw.comment ?? "",
  };
}

/** Backend PublicReviewSerializer payload (my reviews). */
interface RawMyReview {
  id: string;
  booking_id: number | string;
  hotel_id: number | string;
  rating: number | string;
  comment?: string;
  created_at?: string;
}

export interface MyReview {
  id: string;
  bookingId: string;
  hotelId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

function normalizeMyReview(raw: RawMyReview): MyReview {
  return {
    id: String(raw.id),
    bookingId: String(raw.booking_id),
    hotelId: String(raw.hotel_id),
    rating: Number(raw.rating),
    comment: raw.comment ?? "",
    createdAt: raw.created_at ?? "",
  };
}

/** Backend BookingSummarySerializer payload. */
interface RawBooking {
  id: string;
  user_id?: number | string;
  hotel_name?: string;
  hotel_location?: string;
  check_in: string;
  check_out: string;
  guests: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
}

function normalizeBooking(raw: RawBooking): Booking {
  const status: Booking["status"] =
    raw.status === "completed"
      ? "Completed"
      : raw.status === "cancelled"
        ? "Cancelled"
        : "Upcoming";
  return {
    id: String(raw.id),
    hotelName: raw.hotel_name ?? "Hotel",
    location: raw.hotel_location ?? "",
    checkIn: raw.check_in,
    checkOut: raw.check_out,
    guests: raw.guests,
    status,
    userId: raw.user_id !== undefined ? String(raw.user_id) : undefined,
  };
}

export interface HotelSearchParams {
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  propertyType?: string;
  minRating?: number;
}

/** Reaches for dummy data only when the server was unreachable (no HTTP
 * response) AND mock mode is allowed. A real server error (4xx/5xx) always
 * propagates so UIs never show fake data in place of a failed request. */
function fallbackOrThrow<T>(err: unknown, makeDummy: () => Promise<T>): Promise<T> {
  if (err instanceof ApiError || !isMockAllowed()) throw err;
  return makeDummy();
}

// All published hotels, fetched once and shared (home counts + search use the
// same list, so the numbers always match). Pages through the API 100 at a time.
let hotelsCache: { at: number; promise: Promise<RawHotel[]> } | null = null;
const HOTELS_TTL_MS = 60_000;

export function clearHotelsCache(): void {
  hotelsCache = null;
}

function fetchAllHotelRows(): Promise<RawHotel[]> {
  const now = Date.now();
  if (hotelsCache && now - hotelsCache.at < HOTELS_TTL_MS) return hotelsCache.promise;
  const promise = (async () => {
    const all: RawHotel[] = [];
    for (let page = 1; page <= 20; page++) {
      const data = await apiFetch<RawHotel[] | { results?: RawHotel[]; next?: string | null }>(
        `/hotels?page_size=100&page=${page}`,
      );
      if (Array.isArray(data)) return data;
      all.push(...(data.results ?? []));
      if (!data.next) break;
    }
    return all;
  })();
  hotelsCache = { at: now, promise };
  promise.catch(() => {
    if (hotelsCache?.promise === promise) hotelsCache = null;
  });
  return promise;
}

export async function getHotels(params: HotelSearchParams = {}): Promise<Hotel[]> {
  const search = new URLSearchParams();
  if (params.location) search.set("location", params.location);
  if (params.minPrice !== undefined) search.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) search.set("maxPrice", String(params.maxPrice));
  if (params.propertyType) search.set("propertyType", params.propertyType);
  if (params.minRating !== undefined) search.set("minRating", String(params.minRating));
  const qs = search.toString();
  try {
    const rows = qs
      ? await apiList<RawHotel>(`/hotels?${qs}&page_size=100`)
      : await fetchAllHotelRows();
    return rows.map(normalizeHotel);
  } catch (err) {
    return fallbackOrThrow(err, () => {
      let results = dummyHotels;
      if (params.location) {
        const q = params.location.toLowerCase();
        results = results.filter((h) => h.location.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
      }
      if (params.minPrice !== undefined) results = results.filter((h) => h.startingPrice >= params.minPrice!);
      if (params.maxPrice !== undefined) results = results.filter((h) => h.startingPrice <= params.maxPrice!);
      if (params.propertyType) results = results.filter((h) => h.propertyType === params.propertyType);
      if (params.minRating !== undefined) results = results.filter((h) => h.rating >= params.minRating!);
      return simulateNetwork(results);
    });
  }
}

export async function getHotelById(id: string): Promise<Hotel | null> {
  try {
    return await apiFetch<RawHotel>(`/hotels/${id}`).then(normalizeHotel);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return fallbackOrThrow(err, () => simulateNetwork(dummyHotels.find((h) => h.id === id) ?? null));
  }
}

export async function getHotelReviews(hotelId: string): Promise<Review[]> {
  try {
    const rows = await apiList<RawHotelReview>(`/hotels/${hotelId}/reviews`);
    return rows.map(normalizeReview);
  } catch (err) {
    return fallbackOrThrow(err, () => simulateNetwork(dummyReviews));
  }
}

/** Personalized (or popularity-ranked) picks from the recommendation engine. */
export async function getRecommendations(limit = 8): Promise<Hotel[]> {
  try {
    const rows = await apiList<RawHotel>(`/recommendations?limit=${limit}`);
    return rows.map(normalizeHotel);
  } catch (err) {
    return fallbackOrThrow(err, () => simulateNetwork(dummyHotels));
  }
}

export async function getMyBookings(): Promise<Booking[]> {
  try {
    const rows = await apiList<RawBooking>("/bookings");
    return rows.map(normalizeBooking);
  } catch (err) {
    return fallbackOrThrow(err, () => simulateNetwork(dummyBookings));
  }
}

/** Reviews written by the logged-in customer. */
export async function getMyReviews(): Promise<MyReview[]> {
  const rows = await apiList<RawMyReview>("/reviews?page_size=100");
  return rows.map(normalizeMyReview);
}

/** Leave a review for a finished stay (backend: POST /api/reviews). */
export async function createReview(payload: {
  bookingId: string;
  rating: number;
  comment: string;
}): Promise<MyReview> {
  const raw = await apiFetch<RawMyReview>("/reviews", {
    method: "POST",
    body: JSON.stringify({
      booking_id: Number.isNaN(Number(payload.bookingId)) ? payload.bookingId : Number(payload.bookingId),
      rating: payload.rating,
      comment: payload.comment,
    }),
  });
  clearHotelsCache(); // the hotel's average rating just changed
  return normalizeMyReview(raw);
}

/** Top places with the real number of hotels (same list and same match rule as the search page). */
export async function getDestinations(limit = 4): Promise<Destination[]> {
  const hotels = await getHotels();
  const names = new Map<string, number>();
  for (const h of hotels) {
    const name = h.location.split(",")[0].trim();
    if (name) names.set(name, 0);
  }
  return [...names.keys()]
    .map((name) => ({
      id: name.toLowerCase(),
      name,
      hotelCount: hotels.filter((h) => matchesLocation(h, name)).length,
    }))
    .sort((a, b) => b.hotelCount - a.hotelCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface Room {
  id: string;
  name: string;
  price: number;
  maxGuests: number;
}

interface RawRoom {
  id: string;
  name: string;
  base_price: number | string;
  max_guests: number;
}

/** Rooms a guest can book at a hotel (backend: GET /api/hotels/{id}/rooms). */
export async function getHotelRooms(hotelId: string): Promise<Room[]> {
  try {
    const rows = await apiList<RawRoom>(`/hotels/${hotelId}/rooms?page_size=100`);
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      price: Number(r.base_price),
      maxGuests: r.max_guests,
    }));
  } catch {
    return [];
  }
}

export interface CreateBookingPayload {
  hotelId: string;
  /** Room to book (from getHotelRooms). */
  roomId?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  paymentMethod: "eSewa" | "Khalti" | "Card";
}

export async function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  try {
    if (!payload.roomId) throw new Error("Please choose a room.");
    const raw = await apiFetch<RawBooking>("/bookings", {
      method: "POST",
      body: JSON.stringify({
        room_id: payload.roomId,
        check_in: payload.checkIn,
        check_out: payload.checkOut,
        guests: payload.guests,
      }),
    });
    return normalizeBooking(raw);
  } catch (err) {
    // Real server answers (validation, 401...) always reach the user. The fake
    // confirmation is only for dev when the server cannot be reached at all.
    if (err instanceof ApiError || !(err instanceof TypeError) || !isMockAllowed()) throw err;
    const hotel = dummyHotels.find((h) => h.id === payload.hotelId);
    const fakeBooking: Booking = {
      id: `bk-${Math.floor(Math.random() * 9000 + 1000)}`,
      hotelName: hotel?.name ?? "Unknown hotel",
      location: hotel?.location ?? "",
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      guests: payload.guests,
      status: "Upcoming",
    };
    return simulateNetwork(fakeBooking, 800);
  }
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------
// Every admin call goes through adminRequest():
//  - A real error from the server (401, 403, 404, 500...) is ALWAYS re-thrown,
//    so the UI never shows fake data in place of a real "access denied".
//  - Dummy data is used only in development, and only when the server can't be
//    reached, or when NEXT_PUBLIC_USE_MOCK_ADMIN=true is set. In production
//    builds there is no dummy fallback at all.

async function adminRequest<T>(
  real: () => Promise<T>,
  mock: () => Promise<T>,
): Promise<T> {
  const mockAllowed = isMockAllowed();
  if (mockAllowed && process.env.NEXT_PUBLIC_USE_MOCK_ADMIN === "true") {
    return mock();
  }
  try {
    return await real();
  } catch (err) {
    if (err instanceof ApiError || !mockAllowed) throw err;
    return mock();
  }
}

/** Builds /admin/<resource>/<id> and refuses ids that aren't path-safe. */
function adminPath(resource: string, id?: string, suffix = ""): string {
  if (id === undefined) return `/admin/${resource}`;
  if (!isSafeId(id)) throw new Error("Invalid id");
  return `/admin/${resource}/${encodeURIComponent(id)}${suffix}`;
}

/**
 * Asks the server whether this session really is an admin. The role saved in
 * the browser can be edited by anyone, so in production the admin pages only
 * open after the server confirms it (GET /auth/me must return { role }).
 */
export async function verifyAdminAccess(): Promise<boolean> {
  if (isMockAllowed() && process.env.NEXT_PUBLIC_USE_MOCK_ADMIN === "true") {
    return true;
  }
  try {
    const me = await apiFetch<{ role?: string }>("/auth/me");
    return me.role === "admin";
  } catch {
    // A failed or unreachable server never grants admin access.
    return false;
  }
}

// ----- Activity log ---------------------------------------------------------
// The real log MUST be written by the backend (it knows who really did what).
// In dummy mode the actions below add entries here so the demo feels alive.

// D-12: the mock corpus is loaded lazily (dynamic import) so it never ships in
// a production build. Every mock branch awaits ensureMockData() before reading.

let mockDataLoaded: Promise<void> | null = null;
let mockActivity: ActivityEntry[] = [];
let mockInbox: InboxListItem[] = [];
let mockThreads: Record<string, InboxThread> = {};
let mockDocuments: TrainingDocument[] = [];
let mockHotels: AdminHotel[] = [];
let mockAdminBookings: AdminBooking[] = [];

async function ensureMockData(): Promise<void> {
  mockDataLoaded ??= import("./admin-placeholder-data").then((p) => {
    mockActivity = [...p.dummyActivity];
    mockInbox = p.dummyInbox.map((t) => ({ ...t }));
    mockThreads = Object.fromEntries(
      Object.entries(p.dummyInboxThreads).map(([id, thread]) => [
        id,
        { ...thread, entries: [...thread.entries] },
      ]),
    );
    mockDocuments = [...p.dummyTrainingDocuments];
    mockHotels = p.dummyAdminHotels.map((h) => ({ ...h }));
    mockAdminBookings = p.dummyAdminBookings;
  });
  return mockDataLoaded;
}

function logMock(category: ActivityCategory, action: string, target = "") {
  mockActivity = [
    {
      id: `ac-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      at: new Date().toISOString(),
      actor: "You",
      actorEmail: "",
      category,
      action,
      target,
      level: "info" as const,
    },
    ...mockActivity,
  ];
}

export function getActivityLog(): Promise<ActivityEntry[]> {
  return adminRequest(
    () => apiFetch<ActivityEntry[]>(adminPath("activity")),
    async () => {
      await ensureMockData();
      return simulateNetwork([...mockActivity], 300);
    },
  );
}

// ----- Unified inbox --------------------------------------------------------
// Mirrors chat.Conversation. There is no Unread/Open/Resolved workflow.

/** Newest-ISO-date-first sort shared by the inbox, documents, and bookings lists. */
function newestFirst<T>(items: T[], pick: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) => new Date(pick(b)).getTime() - new Date(pick(a)).getTime(),
  );
}

export interface InboxQuery {
  q?: string;
  channel?: InboxChannel | "All";
}

/**
 * Backend responses are snake_case (contact_name, last_message_at, email/phone,
 * int ids); mock data is already camelCase. Normalize both into the InboxThread
 * shape the UI reads.
 */
interface RawInboxRow extends Partial<InboxThread> {
  email?: string;
  phone?: string;
  contact_name?: string;
  last_message_at?: string;
  created_at?: string;
  updated_at?: string;
}

function normalizeInbox(raw: RawInboxRow): InboxThread {
  return {
    id: String(raw.id ?? ""),
    channel: raw.channel ?? "Website",
    contactName: raw.contact_name ?? raw.contactName ?? "Guest",
    contactEmail: raw.contactEmail ?? raw.email ?? "",
    contactPhone: raw.contactPhone ?? raw.phone ?? "",
    note: raw.note ?? "",
    lastMessageAt: raw.lastMessageAt ?? raw.last_message_at ?? raw.updated_at ?? "",
    snippet: raw.snippet ?? "",
    createdAt: raw.createdAt ?? raw.created_at ?? "",
    updatedAt: raw.updatedAt ?? raw.updated_at ?? "",
    entries: raw.entries ?? [],
  };
}

export function getInboxMessages(query: InboxQuery = {}): Promise<InboxListItem[]> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.channel && query.channel !== "All") params.set("channel", query.channel);
  const qs = params.toString();
  return adminRequest(
    () =>
      apiFetch<RawInboxRow[]>(`${adminPath("inbox")}${qs ? `?${qs}` : ""}`).then(
        (rows) => rows.map(normalizeInbox),
      ),
    async () => {
      await ensureMockData();
      return simulateNetwork(
        newestFirst(mockInbox, (t) => t.lastMessageAt).filter(
          (t) =>
            (!query.channel || query.channel === "All" || t.channel === query.channel) &&
            (!query.q ||
              [t.contactName, t.contactEmail, t.contactPhone].join(" ").toLowerCase().includes(query.q.toLowerCase())),
),
        300,
      );
    },
  );
}

export function getInboxThread(threadId: string): Promise<InboxThread> {
  return adminRequest(
    () => apiFetch<RawInboxRow>(adminPath("inbox", threadId)).then(normalizeInbox),
    async () => {
      await ensureMockData();
      const thread = mockThreads[threadId];
      if (!thread) throw new Error("Conversation not found");
      return simulateNetwork(thread, 250);
    },
  );
}

/**
 * Subscribe to the admin inbox event stream (Django SSE, Bearer auth). On every
 * `refresh` frame the server has observed a new message somewhere in the inbox,
 * so the caller re-fetches its list + selected thread. The connection idles
 * ~25s server-side, so this reconnects after each `done` until aborted.
 */
export function subscribeInboxEvents(onRefresh: () => void, signal: AbortSignal): void {
  if (process.env.NEXT_PUBLIC_USE_MOCK_ADMIN === "true") return;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const handle = window.setTimeout(resolve, ms);
      signal.addEventListener("abort", () => window.clearTimeout(handle), { once: true });
    });

  (async () => {
    while (!signal.aborted) {
      let reconnectIn = 3000;
      try {
        const res = await fetch(`${API_BASE_URL}/admin/inbox/events`, {
          headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
          cache: "no-store",
          signal,
        });
        if (!res.ok || !res.body) {
          await sleep(10_000);
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let ended = false;
        while (!signal.aborted && !ended) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let frameEnd: number;
          while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, frameEnd);
            buffer = buffer.slice(frameEnd + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            let event: { type?: string };
            try {
              event = JSON.parse(dataLine.slice(5).trim()) as { type?: string };
            } catch {
              continue;
            }
            if (event.type === "refresh") onRefresh();
            else if (event.type === "done") ended = true;
          }
        }
      } catch {
        reconnectIn = 10_000;
      }
      await sleep(reconnectIn);
    }
  })();
}

export function sendReply(threadId: string, body: string): Promise<InboxThread> {
  const text = body.trim();
  if (!text || text.length > LIMITS.replyBody) {
    return Promise.reject(new Error(`Reply must be 1-${LIMITS.replyBody} characters`));
  }
  return adminRequest(
    () =>
      apiFetch<RawInboxRow>(adminPath("inbox", threadId, "/replies"), {
        method: "POST",
        body: JSON.stringify({ content: text }),
      }).then(normalizeInbox),
    async () => {
      await ensureMockData();
      const thread = mockThreads[threadId];
      if (!thread) throw new Error("Conversation not found");
      const now = new Date().toISOString();
      const updated: InboxThread = {
        ...thread,
        lastMessageAt: now,
        snippet: text,
        entries: [...thread.entries, { id: `en-${Date.now()}`, from: "admin", body: text, sentAt: now }],
      };
      mockThreads[threadId] = updated;
      mockInbox = mockInbox.map((t) => (t.id === threadId ? { ...t, lastMessageAt: now, snippet: text } : t));
      logMock("inbox", "replied to", updated.contactName);
      return simulateNetwork(updated, 400);
    },
  );
}

// ----- Training / hotel documents ------------------------------------------
// Mirrors document_ingestion.ReferenceDocument. Statuses stay lower-case so
// the API needs no mapping layer; use docStatusLabel() for display.

/**
 * The backend emits snake_case rows (file_name, file_size, chunk_count,
 * created_at, error); the UI reads camelCase. Map one shape onto the other so
 * a real response and the mock data agree.
 */
interface RawDocument {
  id: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  status?: string;
  error?: string | null;
  chunk_count?: number;
  created_at?: string;
  updated_at?: string;
}

function normalizeDocument(raw: RawDocument): TrainingDocument {
  const name = raw.file_name ?? "";
  return {
    id: raw.id,
    name,
    fileType: (raw.file_type as TrainingDocument["fileType"]) ?? "txt",
    sizeBytes: raw.file_size ?? 0,
    status: (raw.status as TrainingDocumentStatus) ?? "pending",
    uploadedAt: raw.created_at ?? raw.updated_at ?? "",
    errorMessage: raw.error || undefined,
    chunkCount: raw.chunk_count ?? 0,
  };
}

interface RawDocumentDetail extends RawDocument {
  chunks?: TrainingChunk[];
}

function normalizeDocumentDetail(raw: RawDocumentDetail): TrainingDocumentDetail {
  return { ...normalizeDocument(raw), chunks: raw.chunks ?? [] };
}

export function getTrainingDocuments(): Promise<TrainingDocument[]> {
  return adminRequest(
    () => apiFetch<RawDocument[]>(adminPath("documents")).then((rows) => rows.map(normalizeDocument)),
    async () => {
      await ensureMockData();
      return simulateNetwork(newestFirst(mockDocuments, (d) => d.uploadedAt), 300);
    },
  );
}

export function getTrainingDocumentContent(id: string): Promise<TrainingDocumentDetail> {
  return adminRequest(
    () => apiFetch<RawDocumentDetail>(adminPath("documents", id, "/content")).then(normalizeDocumentDetail),
    async () => {
      await ensureMockData();
      const doc = mockDocuments.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      return simulateNetwork(
        {
          ...doc,
          chunks:
            doc.chunkCount > 0
              ? Array.from({ length: doc.chunkCount }, (_, i) => ({
                  index: i,
                  content: `Chunk ${i}: extracted text from ${doc.name}.`,
                }))
              : [],
        },
        250,
      );
    },
  );
}

/** Re-queues a document for training; the worker picks it up and moves it to ready. */
export function trainTrainingDocument(id: string): Promise<TrainingDocument> {
  return adminRequest(
    () =>
      apiFetch<RawDocument>(adminPath("documents", id, "/train"), { method: "POST" }).then(normalizeDocument),
    async () => {
      await ensureMockData();
      const doc = mockDocuments.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      const updated = { ...doc, status: "pending" as const, errorMessage: undefined };
      mockDocuments = mockDocuments.map((d) => (d.id === id ? updated : d));
      return simulateNetwork(updated, 400);
    },
  );
}

/**
 * Uploads files as multipart/form-data (field name: "files"). Can't use
 * apiFetch because it forces a JSON Content-Type; the browser must set the
 * multipart boundary itself.
 */
export function uploadTrainingDocuments(files: File[]): Promise<TrainingDocument[]> {
  const safeName = files.map((f) => sanitizeFileName(f.name));
  return adminRequest(
    async () => {
      const hadToken = Boolean(getAccessToken());
      const form = new FormData();
      files.forEach((file) => form.append("files", file, sanitizeFileName(file.name)));
      const postForm = () =>
        fetch(`${API_BASE_URL}${adminPath("documents")}`, {
          method: "POST",
          headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
          body: form,
        });
      let res = await postForm();
      if (res.status === 401 && hadToken) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          res = await postForm();
        } else {
          clearSession();
        }
      }
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // no JSON body
        }
        throw new ApiError(
          apiErrorMessage(body) ?? `Upload failed (${res.status})`,
          res.status,
          body,
        );
      }
      return ((await res.json()) as RawDocument[]).map(normalizeDocument);
    },
    async () => {
      await ensureMockData();
      const created = safeName.map((name, i) => ({
        id: `doc-${Date.now()}-${i}`,
        name,
        fileType: getFileExtension(name) as TrainingDocument["fileType"],
        sizeBytes: files[i].size,
        status: "pending" as const,
        uploadedAt: new Date().toISOString(),
        chunkCount: 0,
      }));
      mockDocuments = [...created, ...mockDocuments];
      created.forEach((doc) => logMock("document", "uploaded document", doc.name));
      setTimeout(() => {
        mockDocuments = mockDocuments.map((d) =>
          created.some((c) => c.id === d.id) ? { ...d, status: "ready", chunkCount: 18 } : d,
        );
      }, 4000);
      return simulateNetwork(created, 700);
    },
  );
}

export function deleteTrainingDocument(id: string): Promise<void> {
  return adminRequest(
    () => apiFetch<void>(adminPath("documents", id), { method: "DELETE" }),
    async () => {
      await ensureMockData();
      logMock("document", "deleted document", mockDocuments.find((d) => d.id === id)?.name ?? id);
      mockDocuments = mockDocuments.filter((d) => d.id !== id);
      await simulateNetwork(undefined, 300);
    },
  );
}

// ----- Hotels ---------------------------------------------------------------
// (mock corpus is lazy-loaded via ensureMockData(); see the activity-log header)

export function getAdminHotels(): Promise<AdminHotel[]> {
  return adminRequest(
    () => apiFetch<AdminHotel[]>(adminPath("hotels")),
    async () => {
      await ensureMockData();
      return simulateNetwork(mockHotels.map((h) => ({ ...h })), 300);
    },
  );
}

export function getAdminHotel(id: string): Promise<AdminHotel | null> {
  return adminRequest(
    async () => {
      try {
        return await apiFetch<AdminHotel>(adminPath("hotels", id));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    async () => {
      await ensureMockData();
      return simulateNetwork(mockHotels.find((h) => h.id === id) ?? null, 250);
    },
  );
}

export function createAdminHotel(input: AdminHotelInput): Promise<AdminHotel> {
  return adminRequest(
    () =>
      apiFetch<AdminHotel>(adminPath("hotels"), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    async () => {
      await ensureMockData();
      const hotel: AdminHotel = { id: `h-${Date.now()}`, ...input };
      mockHotels = [hotel, ...mockHotels];
      logMock("hotel", "added hotel", hotel.name);
      return simulateNetwork(hotel, 500);
    },
  );
}

export function updateAdminHotel(
  id: string,
  input: Partial<AdminHotelInput>,
): Promise<AdminHotel> {
  return adminRequest(
    () =>
      apiFetch<AdminHotel>(adminPath("hotels", id), {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    async () => {
      await ensureMockData();
      const current = mockHotels.find((h) => h.id === id);
      if (!current) throw new Error("Hotel not found");
      const updated = { ...current, ...input };
      mockHotels = mockHotels.map((h) => (h.id === id ? updated : h));
      logMock(
        "hotel",
        input.status && input.status !== current.status
          ? input.status === "Active" ? "activated hotel" : "deactivated hotel"
          : "updated hotel",
        updated.name,
      );
      return simulateNetwork(updated, 400);
    },
  );
}

export function deleteAdminHotel(id: string): Promise<void> {
  return adminRequest(
    () => apiFetch<void>(adminPath("hotels", id), { method: "DELETE" }),
    async () => {
      await ensureMockData();
      logMock("hotel", "deleted hotel", mockHotels.find((h) => h.id === id)?.name ?? id);
      mockHotels = mockHotels.filter((h) => h.id !== id);
      await simulateNetwork(undefined, 300);
    },
  );
}

// ----- Bookings and revenue -------------------------------------------------

export function getAdminBookings(): Promise<AdminBooking[]> {
  return adminRequest(
    () => apiFetch<AdminBooking[]>(adminPath("bookings")),
    async () => {
      await ensureMockData();
      return simulateNetwork(newestFirst(mockAdminBookings, (b) => b.bookedAt), 300);
    },
  );
}

export function getRevenueSummary(): Promise<RevenueSummary> {
  return adminRequest(
    () => apiFetch<RevenueSummary>(adminPath("revenue")),
    async () => {
      await ensureMockData();
      const paid = mockAdminBookings.filter((b) => b.status !== "Cancelled");
      const byMonth = new Map<string, { revenue: number; bookings: number }>();
      for (const b of paid) {
        const key = b.checkIn.slice(0, 7);
        const row = byMonth.get(key) ?? { revenue: 0, bookings: 0 };
        row.revenue += b.totalAmount;
        row.bookings += 1;
        byMonth.set(key, row);
      }
      const totalRevenue = paid.reduce((sum, b) => sum + b.totalAmount, 0);
      return simulateNetwork(
        {
          totalRevenue,
          totalBookings: paid.length,
          cancelledBookings: mockAdminBookings.length - paid.length,
          averageBooking: paid.length ? totalRevenue / paid.length : 0,
          months: [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, v]) => ({ month, ...v })),
        },
        350,
      );
    },
  );
}
