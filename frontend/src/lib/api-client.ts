import { dummyBookings, dummyHotels, dummyReviews, topDestinations } from "./placeholder-data";
import { getAccessToken } from "./auth";
import { simulateNetwork } from "./simulate-network";
import type { Booking, Destination, Hotel, Review } from "@/types";

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