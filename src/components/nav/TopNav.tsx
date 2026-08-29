"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "../ui/Button";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useAuth } from "@/lib/auth-context";

const links = [
  {
    href: "/",
    label: "Home",
  },
  {
    href: "/search",
    label: "Search",
  },
  {
    href: "/account",
    label: "Bookings",
  },
];

// Header section
function TopNav() {
  const { openLogin, openSignup } = useAuthModal();
  const { isLoggedIn, user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6 lg:gap-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-wide text-brand-700"
        >
          Sansaaric Stay
        </Link>

        <form action="/search" className="hidden flex-1 lg:block">
          <div className="relative flex max-w-sm items-center gap-2 rounded-full border border-brand-100 bg-bg px-3.5 py-2 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <Search aria-hidden className="size-4 text-brand-600" />
            <input
              name="q"
              type="text"
              placeholder="Search destinations, hotels.."
              aria-label="Search destinations and hotels"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft"
            />
          </div>
        </form>

        <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-link">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          {isLoggedIn && user ? (
            <Link href="/account" aria-label={`Your account, ${user.name}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
                {user.initials || user.name.charAt(0).toUpperCase()}
              </span>
            </Link>
          ) : (
            <>
              <Button variant="ghost" onClick={openLogin}>
                Log in
              </Button>
              <Button variant="ghost" onClick={openSignup}>
                Sign up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopNav;
