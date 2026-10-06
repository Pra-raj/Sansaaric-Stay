"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { verifyAdminAccess } from "@/lib/api-client";
import { IDLE_NOTICE_KEY } from "./useIdleLogout";

/**
 * Wraps everything under /admin. Same idea as the "log in to view" prompt on
 * /account, plus a role check.
 *
 * The role saved in the browser can be edited by anyone, so after the local
 * check the server is asked to confirm the role (verifyAdminAccess) before any
 * admin page renders. The backend must also reject /admin/* API requests from
 * non-admin tokens: this gate only controls what the browser shows.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, isAdmin } = useAuth();
  const { openLogin } = useAuthModal();
  const [verified, setVerified] = useState<"checking" | "yes" | "no">("checking");
  // Set by useIdleLogout when the session timed out; cleared after a good login.
  const [idleNotice] = useState(() => {
    try {
      return (
        typeof window !== "undefined" &&
        sessionStorage.getItem(IDLE_NOTICE_KEY) === "1"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    let cancelled = false;
    verifyAdminAccess().then((ok) => {
      if (cancelled) return;
      if (ok) {
        try {
          sessionStorage.removeItem(IDLE_NOTICE_KEY);
        } catch {
          // ignore
        }
      }
      setVerified(ok ? "yes" : "no");
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isAdmin]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold">Log in to open the admin area</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          {idleNotice
            ? "You were signed out after 30 minutes of inactivity. Please sign in again."
            : "Sign in with an admin account to manage hotels, bookings, the inbox and documents."}
        </p>
        <Button className="mt-6" onClick={openLogin}>
          Log in
        </Button>
      </div>
    );
  }

  if (!isAdmin || verified === "no") {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Your account doesn&apos;t have access to this area. If you think it
          should, ask an existing admin to update your role.
        </p>
        <Link
          href="/"
          className="mt-6 text-sm font-semibold text-brand-600 hover:underline"
        >
          Back to the site
        </Link>
      </div>
    );
  }

  if (verified === "checking") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  return <>{children}</>;
}
