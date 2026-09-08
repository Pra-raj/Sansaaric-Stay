import Link from "next/link";
import { FacebookIcon } from "../icons/icons";
import { Globe2, Music2 } from "lucide-react";

const columns = [
  {
    heading: "Explore",
    links: [
      {
        label: "Search Stays",
        href: "/search",
      },
      {
        label: "My Bookings",
        href: "/account",
      },
    ],
  },
  {
    heading: "Company",
    links: [
      {
        label: "About us",
        href: "/about",
      },
      {
        label: "Contact us",
        href: "/contact",
      },
    ],
  },
  {
    heading: "Hosts",
    links: [
      {
        label: "List your property",
        href: "/partner",
      },
    ],
  },
];

const socialLinks = [
  { label: "Facebook", href: "#", icon: FacebookIcon },
  { label: "Instagram", href: "#", icon: Globe2 },
  { label: "TikTok", href: "#", icon: Music2 },
];

//footer

export default function SiteFooter() {
  return (
    <footer className="border-t border-black/5 bg-surface px-6 pb-24 pt-10 lg:pb-10">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-10">
        <div className="max-w-xs">
          <p className="text-lg font-bold text-brand-600">Sansaaric Stay</p>
          <p className="mt-2 text-sm text-ink-soft">
            Discover independently owned hotels, resorts, and homestays across
            Nepal through short video, then book online.
          </p>

          <div className="mt-4 flex gap-3">
            {socialLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/10 text-ink-soft transition-colors hover:border-brand-500 hover:text-brand-600"
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-12">
          {columns.map((col) => (
            <div key={col.heading}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {col.heading}
              </p>
              {col.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block py-1 text-sm text-ink hover:text-brand-600"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-16 flex flex-col justify-between gap-3 border-t border-black/10 pt-6 text-xs text-white/35 sm:flex-row">
        <p className="mx-auto mt-8 max-w-6xl text-xs text-ink-soft">
          &copy; {new Date().getFullYear()} Sansaaric Stay. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
