"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ExternalLink, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import { AdminGate } from "./AdminGate";
import { AdminNav } from "./AdminNav";
import { useIdleLogout } from "./useIdleLogout";

const segmentLabels: Record<string, string> = {
  hotels: "Hotels",
  new: "Add hotel",
  bookings: "Bookings",
  revenue: "Revenue",
  inbox: "Inbox",
  documents: "Documents",
  activity: "Activity log",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(1); // drop "admin"
  const crumbs = [
    { label: "Dashboard", href: "/admin" },
    ...parts.map((seg, i) => ({
      label: segmentLabels[seg] ?? "Edit",
      href: `/admin/${parts.slice(0, i + 1).join("/")}`,
    })),
  ];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-soft" />}
              {last ? (
                <span aria-current="page" className="truncate font-semibold">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate text-ink-soft hover:text-ink">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { isAdmin, logOut } = useAuth();
  useIdleLogout(isAdmin, logOut);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/20 bg-surface lg:block">
        <AdminNav />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside
            role="dialog"
            aria-label="Admin menu"
            className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl"
          >
            <button
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-4 rounded-lg p-2 text-ink-soft hover:bg-bg"
            >
              <X aria-hidden className="size-5" />
            </button>
            <AdminNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/20 bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-2 text-ink-soft hover:bg-bg lg:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <Breadcrumbs />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-bg hover:text-ink sm:flex"
            >
              View site <ExternalLink aria-hidden className="size-3.5" />
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Sidebar + top bar + content frame for every /admin page. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <Frame>{children}</Frame>
    </AdminGate>
  );
}
