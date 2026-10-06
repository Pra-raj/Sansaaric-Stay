import type {
  ActivityCategory,
  AdminBooking,
  HotelStatus,
  InboxChannel,
  InboxStatus,
  TrainingDocumentStatus,
} from "@/types";

export const ALLOWED_DOC_EXTENSIONS: readonly string[] = ["pdf", "docx", "txt"];
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOC_ACCEPT_ATTR = ".pdf,.docx,.txt";

export function getFileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i + 1).toLowerCase();
}

/** Returns an error message, or null when the file can be uploaded. */
export function validateTrainingFile(file: File): string | null {
  if (!ALLOWED_DOC_EXTENSIONS.includes(getFileExtension(file.name))) {
    return `${file.name}: only PDF, DOCX, and TXT files are supported.`;
  }
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > MAX_DOC_BYTES) return `${file.name}: larger than 10 MB.`;
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const channelLabels: Record<InboxChannel, string> = {
  chatbot: "Chatbot",
  "contact-form": "Contact form",
  email: "Email",
};

export function inboxStatusTone(status: InboxStatus) {
  if (status === "Unread") return "brand" as const;
  if (status === "Open") return "warning" as const;
  return "neutral" as const;
}

export function docStatusTone(status: TrainingDocumentStatus) {
  if (status === "Indexed") return "success" as const;
  if (status === "Processing") return "warning" as const;
  return "danger" as const;
}

export function formatCurrency(amount: number): string {
  return `NPR ${Math.round(amount).toLocaleString("en-US")}`;
}

/** Formats a YYYY-MM-DD date without timezone shifting it a day. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function bookingStatusTone(status: AdminBooking["status"]) {
  if (status === "Upcoming") return "brand" as const;
  if (status === "Completed") return "success" as const;
  return "danger" as const;
}

export function hotelStatusTone(status: HotelStatus) {
  return status === "Active" ? ("success" as const) : ("neutral" as const);
}

/** Fired by the inbox page so the sidebar's unread badge can refresh. */
export const INBOX_CHANGED = "admin:inbox-changed";

export const activityCategoryLabels: Record<ActivityCategory, string> = {
  hotel: "Hotels",
  booking: "Bookings",
  inbox: "Inbox",
  document: "Documents",
  security: "Security",
};

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "Today", "Yesterday", or a short date, for grouping the activity log. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Compact axis number: 12500 -> "12.5k". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}
