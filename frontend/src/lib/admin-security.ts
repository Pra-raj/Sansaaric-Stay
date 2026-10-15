import type { AdminHotelInput, HotelStatus } from "@/types";

/**
 * Client-side safety helpers for the admin area.
 *
 * Important: these make bad input harder to send and give admins quick
 * feedback, but the backend MUST repeat every check. Anything that runs in the
 * browser can be bypassed.
 */

/** Mock/dummy data is for development only. Never serve it in production. */
export const isMockAllowed = () => process.env.NODE_ENV !== "production";

// Control characters + zero-width / bidi override characters (used for spoofing).
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Single-line text: strips invisible characters and collapses whitespace. */
export function cleanText(value: string): string {
  return value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Multi-line text: strips invisible characters but keeps line breaks. */
export function cleanMultiline(value: string): string {
  return value
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** IDs are put into URL paths, so only allow a safe character set. */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

export const LIMITS = {
  hotelName: 100,
  location: 100,
  description: 2000,
  amenity: 40,
  amenities: 20,
  maxPrice: 1_000_000,
  replyBody: 4000,
} as const;

const PROPERTY_TYPES = ["Hotel", "Resort", "Homestay"] as const;

export interface HotelFormValues {
  name: string;
  location: string;
  propertyType: string;
  startingPrice: string;
  description: string;
  amenities: string; // comma separated
  status: string;
}

export type HotelFormErrors = Partial<Record<keyof HotelFormValues, string>>;

export function validateHotelForm(
  raw: HotelFormValues,
): { errors: HotelFormErrors; value: AdminHotelInput | null } {
  const errors: HotelFormErrors = {};

  const name = cleanText(raw.name);
  if (name.length < 2 || name.length > LIMITS.hotelName) {
    errors.name = `Enter a name between 2 and ${LIMITS.hotelName} characters.`;
  }

  const location = cleanText(raw.location);
  if (location.length < 2 || location.length > LIMITS.location) {
    errors.location = `Enter a location between 2 and ${LIMITS.location} characters.`;
  }

  const propertyType = PROPERTY_TYPES.find((t) => t === raw.propertyType);
  if (!propertyType) errors.propertyType = "Choose a property type.";

  const price = Number(raw.startingPrice);
  if (
    !raw.startingPrice.trim() ||
    !Number.isInteger(price) ||
    price < 1 ||
    price > LIMITS.maxPrice
  ) {
    errors.startingPrice = `Enter a whole number between 1 and ${LIMITS.maxPrice.toLocaleString("en-US")}.`;
  }

  const description = cleanMultiline(raw.description);
  if (description.length < 10 || description.length > LIMITS.description) {
    errors.description = `Write between 10 and ${LIMITS.description} characters.`;
  }

  const amenities = Array.from(
    new Set(
      raw.amenities
        .split(",")
        .map(cleanText)
        .filter(Boolean),
    ),
  );
  if (
    amenities.length > LIMITS.amenities ||
    amenities.some((a) => a.length > LIMITS.amenity)
  ) {
    errors.amenities = `Up to ${LIMITS.amenities} amenities, ${LIMITS.amenity} characters each.`;
  }

  const status: HotelStatus | null =
    raw.status === "Active" || raw.status === "Inactive" ? raw.status : null;
  if (!status) errors.status = "Choose a status.";

  if (Object.keys(errors).length > 0 || !propertyType || !status) {
    return { errors, value: null };
  }
  return {
    errors,
    value: {
      name,
      location,
      propertyType,
      startingPrice: price,
      description,
      amenities,
      status,
    },
  };
}

/** Removes path parts and odd characters from an uploaded file's name. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = cleanText(base)
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "");
  return (cleaned || "document").slice(0, 120);
}

/**
 * Checks the file's first bytes match its extension, so a renamed .exe or .html
 * can't pass as a PDF. Returns an error message, or null when it looks right.
 */
export async function validateFileSignature(file: File): Promise<string | null> {
  const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const startsWith = (sig: number[]) => sig.every((b, i) => head[i] === b);

  if (ext === "pdf" && !startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return `${file.name}: this doesn't look like a real PDF.`;
  }
  const zipTypes = ["docx", "xlsx"];
  if (zipTypes.includes(ext) && !startsWith([0x50, 0x4b, 0x03, 0x04])) {
    return `${file.name}: this doesn't look like a real .${ext} file.`;
  }
  if (ext === "xls" && !startsWith([0xd0, 0xcf, 0x11, 0xe0])) {
    return `${file.name}: this doesn't look like a real .xls file.`;
  }
  if (["txt", "md", "csv"].includes(ext) && head.includes(0)) {
    return `${file.name}: this doesn't look like plain text.`;
  }
  return null;
}

/**
 * Escapes one CSV cell. Values starting with = + - @ (or tab / carriage return)
 * are prefixed with an apostrophe so Excel/Sheets can't run them as formulas.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
