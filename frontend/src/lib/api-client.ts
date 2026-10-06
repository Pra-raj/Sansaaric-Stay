import { dummyBookings, dummyHotels, dummyReviews, topDestinations } from "./placeholder-data";
import { getAccessToken } from "./auth";
import { simulateNetwork } from "./simulate-network";
import {
  dummyActivity,
  dummyAdminBookings,
  dummyAdminHotels,
  dummyInbox,
  dummyTrainingDocuments,
} from "./admin-placeholder-data";
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
  InboxMessage,
  InboxStatus,
  Review,
  RevenueSummary,
  TrainingDocument,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

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

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body — leave body as null
    }
    throw new ApiError(`Request to ${path} failed (${res.status})`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface HotelSearchParams {
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  propertyType?: string;
  minRating?: number;
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
    return await apiFetch<Hotel[]>(`/hotels${qs ? `?${qs}` : ""}`);
  } catch {
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
  }
}

export async function getHotelById(id: string): Promise<Hotel | null> {
  try {
    return await apiFetch<Hotel>(`/hotels/${id}`);
  } catch {
    return simulateNetwork(dummyHotels.find((h) => h.id === id) ?? null);
  }
}

export async function getHotelReviews(hotelId: string): Promise<Review[]> {
  try {
    return await apiFetch<Review[]>(`/hotels/${hotelId}/reviews`);
  } catch {
    return simulateNetwork(dummyReviews);
  }
}

export async function getDestinations(): Promise<Destination[]> {
  try {
    return await apiFetch<Destination[]>("/destinations");
  } catch {
    return simulateNetwork(topDestinations);
  }
}

export async function getMyBookings(): Promise<Booking[]> {
  try {
    return await apiFetch<Booking[]>("/bookings");
  } catch {
    return simulateNetwork(dummyBookings);
  }
}

export interface CreateBookingPayload {
  hotelId: string;
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
    return await apiFetch<Booking>("/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
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
  } catch (err) {
    if (err instanceof ApiError) return false;
    return isMockAllowed(); // server unreachable: only OK while developing
  }
}

// ----- Activity log ---------------------------------------------------------
// The real log MUST be written by the backend (it knows who really did what).
// In dummy mode the actions below add entries here so the demo feels alive.

let mockActivity: ActivityEntry[] = [...dummyActivity];

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
    () => simulateNetwork([...mockActivity], 300),
  );
}

// ----- Unified inbox --------------------------------------------------------

let mockInbox: InboxMessage[] = dummyInbox.map((t) => ({
  ...t,
  entries: [...t.entries],
}));

function newestFirst(threads: InboxMessage[]): InboxMessage[] {
  return [...threads].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function getInboxMessages(): Promise<InboxMessage[]> {
  return adminRequest(
    () => apiFetch<InboxMessage[]>(adminPath("inbox")),
    () => simulateNetwork(newestFirst(mockInbox), 300),
  );
}

export function sendReply(threadId: string, body: string): Promise<InboxMessage> {
  const text = body.trim();
  if (!text || text.length > LIMITS.replyBody) {
    return Promise.reject(new Error("Reply must be 1-5000 characters"));
  }
  return adminRequest(
    () =>
      apiFetch<InboxMessage>(adminPath("inbox", threadId, "/replies"), {
        method: "POST",
        body: JSON.stringify({ body: text }),
      }),
    async () => {
      const thread = mockInbox.find((t) => t.id === threadId);
      if (!thread) throw new Error("Conversation not found");
      const now = new Date().toISOString();
      const updated: InboxMessage = {
        ...thread,
        status: thread.status === "Unread" ? "Open" : thread.status,
        lastMessageAt: now,
        entries: [
          ...thread.entries,
          { id: `en-${Date.now()}`, from: "admin", body: text, sentAt: now },
        ],
      };
      mockInbox = mockInbox.map((t) => (t.id === threadId ? updated : t));
      logMock("inbox", "replied to", thread.guestName);
      return simulateNetwork(updated, 400);
    },
  );
}

export function updateInboxStatus(
  threadId: string,
  status: InboxStatus,
): Promise<InboxMessage> {
  return adminRequest(
    () =>
      apiFetch<InboxMessage>(adminPath("inbox", threadId), {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    async () => {
      const thread = mockInbox.find((t) => t.id === threadId);
      if (!thread) throw new Error("Conversation not found");
      const updated = { ...thread, status };
      mockInbox = mockInbox.map((t) => (t.id === threadId ? updated : t));
      if (status === "Resolved") logMock("inbox", "resolved conversation with", thread.guestName);
      else if (thread.status === "Resolved") logMock("inbox", "reopened conversation with", thread.guestName);
      return simulateNetwork(updated, 200);
    },
  );
}

// ----- Training / hotel documents ------------------------------------------

let mockDocuments: TrainingDocument[] = [...dummyTrainingDocuments];

export function getTrainingDocuments(): Promise<TrainingDocument[]> {
  return adminRequest(
    () => apiFetch<TrainingDocument[]>(adminPath("documents")),
    () =>
      simulateNetwork(
        [...mockDocuments].sort(
          (a, b) =>
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        ),
        300,
      ),
  );
}

/**
 * Uploads one file as multipart/form-data (field name: "file"). Can't use
 * apiFetch because it forces a JSON Content-Type; the browser must set the
 * multipart boundary itself.
 */
export function uploadTrainingDocument(file: File): Promise<TrainingDocument> {
  const safeName = sanitizeFileName(file.name);
  return adminRequest(
    async () => {
      const token = getAccessToken();
      const form = new FormData();
      form.append("file", file, safeName);
      const res = await fetch(`${API_BASE_URL}${adminPath("documents")}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // no JSON body
        }
        throw new ApiError(`Upload failed (${res.status})`, res.status, body);
      }
      return (await res.json()) as TrainingDocument;
    },
    async () => {
      const doc: TrainingDocument = {
        id: `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: safeName,
        fileType: getFileExtension(safeName) as TrainingDocument["fileType"],
        sizeBytes: file.size,
        status: "Processing",
        uploadedAt: new Date().toISOString(),
      };
      mockDocuments = [doc, ...mockDocuments];
      logMock("document", "uploaded document", safeName);
      setTimeout(() => {
        mockDocuments = mockDocuments.map((d) =>
          d.id === doc.id ? { ...d, status: "Indexed" } : d,
        );
      }, 4000);
      return simulateNetwork(doc, 700);
    },
  );
}

export function deleteTrainingDocument(id: string): Promise<void> {
  return adminRequest(
    () => apiFetch<void>(adminPath("documents", id), { method: "DELETE" }),
    async () => {
      logMock("document", "deleted document", mockDocuments.find((d) => d.id === id)?.name ?? id);
      mockDocuments = mockDocuments.filter((d) => d.id !== id);
      await simulateNetwork(undefined, 300);
    },
  );
}

// ----- Hotels ---------------------------------------------------------------

let mockHotels: AdminHotel[] = dummyAdminHotels.map((h) => ({ ...h }));

export function getAdminHotels(): Promise<AdminHotel[]> {
  return adminRequest(
    () => apiFetch<AdminHotel[]>(adminPath("hotels")),
    () => simulateNetwork(mockHotels.map((h) => ({ ...h })), 300),
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
    () => simulateNetwork(mockHotels.find((h) => h.id === id) ?? null, 250),
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
    () =>
      simulateNetwork(
        [...dummyAdminBookings].sort(
          (a, b) => b.bookedAt.localeCompare(a.bookedAt),
        ),
        300,
      ),
  );
}

export function getRevenueSummary(): Promise<RevenueSummary> {
  return adminRequest(
    () => apiFetch<RevenueSummary>(adminPath("revenue")),
    async () => {
      const paid = dummyAdminBookings.filter((b) => b.status !== "Cancelled");
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
          cancelledBookings: dummyAdminBookings.length - paid.length,
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
