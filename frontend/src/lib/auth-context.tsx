"use client";

import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  createContext,
} from "react";
import * as auth from "./auth";
import type { UserRole } from "@/types";

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  initials: string;
  photoUrl?: string;
  /** Missing on sessions stored before roles existed — treat as "guest". */
  role?: UserRole;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<auth.SignupResult>;
  /** Confirm the 6-digit signup code, then sign the new account in. */
  verifySignup: (email: string, code: string) => Promise<void>;
  resendSignupCode: (email: string) => Promise<string>;
  logOut: () => void;
  updateProfile: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // fetchCurrentUser rejects without hitting the network when there is no token,
  // so anonymous visitors cost no request. Every state update below happens in a
  // promise callback, never synchronously in the effect.
  useEffect(() => {
    auth
      .fetchCurrentUser()
      .then((fresh) => {
        // Re-read from the server so a revoked staff flag takes effect without
        // forcing the user to sign out.
        setUser(fresh);
      })
      .catch((err: unknown) => {
        // Only an explicit auth rejection (401/403) means the tokens are dead.
        // A network blip or a 5xx should NOT log the user out mid-session.
        const status = err instanceof auth.AuthError ? err.status : undefined;
        if (status === 401 || status === 403) auth.clearSession();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn: user !== null,
      isLoading,
      isAdmin: user?.role === "admin",
      user,
      login: async (email: string, password: string) => {
        await auth.signIn(email, password);
        const fresh = await auth.fetchCurrentUser();
        setUser(fresh);
      },
      signup: async (name, email, password) => {
        const result = await auth.signUp(name, email, password);
        if (!result.requiresVerification) {
          const fresh = await auth.fetchCurrentUser();
          setUser(fresh);
        }
        return result;
      },
      verifySignup: async (email, code) => {
        await auth.verifySignupCode(email, code);
        const fresh = await auth.fetchCurrentUser();
        setUser(fresh);
      },
      resendSignupCode: (email) => auth.resendSignupCode(email),
      logOut: () => {
        void auth.revokeSession();
        auth.clearSession();
        setUser(null);
      },
      updateProfile: (patch) => {
        setUser((prev) => {
          if (!prev) return prev;
          return { ...prev, ...patch };
        });
      },
    }),
    [user, isLoading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}