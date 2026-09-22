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
