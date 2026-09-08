import type { AuthUser } from "./auth-context";

const ACCESS_TOKEN_KEY = "sansaaric-access-token";
const REFRESH_TOKEN_KEY = "sansaaric-refresh-token";
const USER_KEY = "sansaaric-user";

function simulateNetwork<T>(value: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export async function login(email: string, _password: string): Promise<AuthResult> {
  const user: AuthUser = { name: "Prayag Raj Karki", email, initials: initials("Prayag Raj Karki") };
  return simulateNetwork({
    user,
    accessToken: `fake-access-${Date.now()}`,
    refreshToken: `fake-refresh-${Date.now()}`,
  });
}

export async function signup(name: string, email: string, _password: string): Promise<AuthResult> {
  const user: AuthUser = { name, email, initials: initials(name) };
  return simulateNetwork({
    user,
    accessToken: `fake-access-${Date.now()}`,
    refreshToken: `fake-refresh-${Date.now()}`,
  });
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const newToken = `fake-access-${Date.now()}`;
  setAccessToken(newToken);
  return newToken;
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

export function storeSession(result: AuthResult): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
}

export function loadStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function updateStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}