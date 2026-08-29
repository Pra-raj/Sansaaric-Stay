"use client";

import {
  type ReactNode,
  useContext,
  useMemo,
  useState,
  createContext,
} from "react";

interface AuthUser {
  name: string;
  email: string;
  initials: string;
}

interface AuthContextValue {
  isLoggedIn: boolean;
  user: AuthUser | null;
  logIn: () => void;
  loggedOut: () => void;
}

const demoUser: AuthUser = {
  name: "Prayag Raj Karki",
  email: "prayag@email.com",
  initials: "P",
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsloggedIn] = useState(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn,
      user: isLoggedIn ? demoUser : null,
      logIn: () => setIsloggedIn(true),
      loggedOut: () => setIsloggedIn(false),
    }),
    [isLoggedIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
