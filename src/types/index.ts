import { AbsoluteString } from "next/dist/lib/metadata/types/metadata-types";

export interface Destination {
  id: string;
  name: string;
  HotelCount: number;
}

export interface Hotel{
  id: string;
  name: string;
  location: string
  propertyType: "hotel" | "Resort" | "Homestay",
  rating: number;
  startingPrice: number;
  tags: string[];
  description: string;
  amenities: string;
}

export interface Review{
  id: string;
  authorName: string
  rating: number;
  comment: string;

}

export interface BookingDraft {
  hotelId: string
  hotelName: string
  checkIn: string
  checkOut: string
  guests: number
  nights: number
  pricePerNight: number
  serviceFee: number
  total: number
}

export interface Booking{
  id: string
  hotelName:string
  location: string
  checkIn: string
  checkOut: string
  guests: number;
  status: "Upcoming" | "Completed" | "Cancelled";
}