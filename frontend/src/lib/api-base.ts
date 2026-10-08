// Single source of truth for the Django API origin.
// - In the browser, NEXT_PUBLIC_API_BASE_URL is inlined at build time.
// - In server components (SSR / Docker), localhost:8000 is wrong — the backend
//   lives at BACKEND_URL (e.g. http://backend:8000 in compose).
const LOCALHOST = "http://localhost:8000";

function resolveBaseUrl(): string {
  if (typeof window === "undefined") {
    return `${process.env.BACKEND_URL ?? LOCALHOST}/api`;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? `${LOCALHOST}/api`;
}

export const API_BASE_URL = resolveBaseUrl();
