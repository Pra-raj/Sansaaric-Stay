import type { AuthUser } from "./auth-context";
import type { UserRole } from "@/types";

const AUTH_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

const ACCESS_TOKEN_KEY = "sansaaric-access-token";
const REFRESH_TOKEN_KEY = "sansaaric-refresh-token";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/** Thrown by every function here so the UI can show `message` verbatim. */
export class AuthError extends Error {
  /** Present when the server returned an HTTP error; missed on network failure. */
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AuthError";
    if (status !== undefined) this.status = status;
  }
}

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface AuthPayload {
  session: SessionPayload | null;
  message: string | null;
}

interface MePayload {
  user: { id: number; supabase_uid: string; email: string; full_name: string };
  role: UserRole;
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** DRF sends {detail} or {field: ["msg"]}; the auth views send {error, detail}. */
function readError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  if (typeof record.error === "string") return record.error;
  const first = Object.values(record)[0];
  if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  return null;
}

async function authPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  const token = getAccessToken();
  try {
    res = await fetch(`${AUTH_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AuthError(readError(data) ?? "Something went wrong. Try again.", res.status);
  }
  return data as T;
}

function toTokens(payload: AuthPayload): SessionTokens {
  if (!payload.session) {
    throw new AuthError(payload.message ?? "Check your email to confirm your account.");
  }
  return {
    accessToken: payload.session.access_token,
    refreshToken: payload.session.refresh_token,
  };
}

export async function signIn(email: string, password: string): Promise<SessionTokens> {
  const tokens = toTokens(await authPost<AuthPayload>("/auth/login", { email, password }));
  storeTokens(tokens);
  return tokens;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SessionTokens> {
  const tokens = toTokens(
    await authPost<AuthPayload>("/auth/signup", { email, password, full_name: name }),
  );
  storeTokens(tokens);
  return tokens;
}

/** The role comes from /auth/me, not the login payload — that is where is_staff lives. */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const token = getAccessToken();
  if (!token) throw new AuthError("Not signed in.");

  let res: Response;
  try {
    res = await fetch(`${AUTH_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new AuthError("Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AuthError(readError(data) ?? "Your session has expired.", res.status);
  }
  const me = data as MePayload;
  const name = me.user.full_name || me.user.email;
  return { name, email: me.user.email, initials: initials(name), role: me.role };
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const data = await authPost<{ session: SessionPayload }>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    setAccessToken(data.session.access_token);
    return data.session.access_token;
  } catch {
    return null;
  }
}

/** Best-effort: the local session is cleared regardless of what the server says. */
export async function revokeSession(): Promise<void> {
  const token = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!token || !refreshToken) return;
  try {
    await authPost<null>("/auth/logout", { refresh_token: refreshToken });
  } catch {
    // Revocation is best-effort; the access token expires on its own.
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function storeTokens(tokens: SessionTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // A thread owned by the logged-out account must not stay on this device.
  localStorage.removeItem("sansaaric-chat-state");
}