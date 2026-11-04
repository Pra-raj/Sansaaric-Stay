import type { AuthUser } from "./auth-context";
import type { UserRole } from "@/types";
import { API_BASE_URL as AUTH_BASE_URL } from "./api-base";

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
  /** Machine-readable `error` code from the API (e.g. email_not_verified). */
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "AuthError";
    if (status !== undefined) this.status = status;
    if (code !== undefined) this.code = code;
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

function readErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const code = (data as Record<string, unknown>).error;
  return typeof code === "string" ? code : undefined;
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
    throw new AuthError(
      readError(data) ?? "Something went wrong. Try again.",
      res.status,
      readErrorCode(data),
    );
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

export interface SignupResult {
  /** True when the account is created but the emailed code must be entered. */
  requiresVerification: boolean;
  email: string;
  /** Human-readable note the UI can show verbatim. */
  message: string;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<SignupResult> {
  const data = await authPost<AuthPayload>("/auth/signup", {
    email,
    password,
    full_name: name,
  });
  if (data.session) {
    // Backwards-compatible with a backend that issues a session immediately.
    storeTokens({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
    return {
      requiresVerification: false,
      email,
      message: data.message ?? "",
    };
  }
  return {
    requiresVerification: true,
    email,
    message:
      data.message ?? "Check your email for the 6-digit confirmation code.",
  };
}

/** Confirms the signup code and signs the new account in. */
export async function verifySignupCode(
  email: string,
  code: string,
): Promise<SessionTokens> {
  const tokens = toTokens(
    await authPost<AuthPayload>("/auth/signup/verify", { email, code }),
  );
  storeTokens(tokens);
  return tokens;
}

/** Sends a fresh confirmation code. Returns the server's confirmation text. */
export async function resendSignupCode(email: string): Promise<string> {
  const data = await authPost<{ detail: string }>("/auth/signup/resend", {
    email,
  });
  return data.detail;
}

export interface PasswordResetRequestResult {
  /** Human-readable confirmation the UI can show verbatim. */
  detail: string;
  /** Only returned by the backend in DEBUG, so the flow works without SMTP. */
  resetUrl?: string;
}

/**
 * Asks Django to email a reset link. The server always answers with the same
 * message, whether or not the address belongs to an account.
 */
export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetRequestResult> {
  const data = await authPost<{ detail: string; reset_url?: string }>(
    "/auth/password-reset",
    { email },
  );
  return { detail: data.detail, resetUrl: data.reset_url };
}

/** Completes the reset using the uid/token from the emailed link. */
export async function confirmPasswordReset(
  uid: string,
  token: string,
  password: string,
): Promise<string> {
  const data = await authPost<{ detail: string }>("/auth/password-reset/confirm", {
    uid,
    token,
    password,
  });
  return data.detail;
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
  return { id: String(me.user.id), name, email: me.user.email, initials: initials(name), role: me.role };
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