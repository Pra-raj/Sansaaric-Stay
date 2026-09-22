import type { Booking } from "@/types";

export function statusTone(status: Booking["status"]) {
  if (status === "Upcoming") return "brand" as const;
  if (status === "Completed") return "success" as const;
  return "neutral" as const;
}