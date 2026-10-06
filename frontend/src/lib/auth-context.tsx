"use client";

import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  createContext,
} from "react";
import { loadStoredUser } from "./auth";
import * as auth from "./auth";
import type { UserRole } from "@/types";

export interface AuthUser {
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
  signup: (name: string, email: string, password: string) => Promise<void>;
  logOut: () => void;
  updateProfile: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setUser(loadStoredUser());
      setIsLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn: user !== null,
      isLoading,
      isAdmin: user?.role === "admin",
      user,
      login: async (email: string, password: string) => {
        const result = await auth.login(email, password);
        auth.storeSession(result);
        setUser(result.user);
      },
      signup: async (name, email, password) => {
        const result = await auth.signup(name, email, password);
        auth.storeSession(result);
        setUser(result.user);
      },
      logOut: () => {
        auth.clearSession();
        setUser(null);
      },
      updateProfile: (patch) => {
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, ...patch };
          auth.updateStoredUser(next);
          return next;
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