"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type panel = "login" | "signup" | "verify" | "forgot";

interface AuthModalContextValue {
  isOpen: boolean;
  panel: panel;
  openLogin: () => void;
  openSignup: () => void;
  openForgot: () => void;
  switchPanel: (panel: panel) => void;
  close: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(
  undefined,
);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<panel>("login");

  const value = useMemo<AuthModalContextValue>(
    () => ({
      isOpen,
      panel,
      openLogin: () => {
        setPanel("login");
        setIsOpen(true);
      },
      openSignup: () => {
        setPanel("signup");
        setIsOpen(true);
      },
      openForgot: () => {
        setPanel("forgot");
        setIsOpen(true);
      },
      switchPanel: (p: panel) => setPanel(p),
      close: () => setIsOpen(false),
    }),
    [isOpen, panel],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx)
    throw new Error("useAuthModal must be used within an AuthModalProvider");
  return ctx;
}
