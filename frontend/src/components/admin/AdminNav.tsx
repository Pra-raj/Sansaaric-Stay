"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth-context";
import { useUnreadCount } from "./useUnreadCount";

const groups = [
  {
    label: "Dashboard",
    items: [{ name: "Overview", href: "/admin", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Manage",
    items: [
      { name: "Hotels", href: "/admin/hotels", icon: Building2 },
      { name: "Bookings", href: "/admin/bookings", icon: CalendarCheck },
      { name: "Revenue", href: "/admin/revenue", icon: TrendingUp },
    ],
  },
  {
    label: "Support",
    items: [
      { name: "Inbox", href: "/admin/inbox", icon: Inbox, badge: true },
      { name: "Documents", href: "/admin/documents", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [{ name: "Activity log", href: "/admin/activity", icon: ScrollText }],
  },
] as const;

/** Brand, grouped navigation and the signed-in admin. Used by the sidebar and the mobile drawer. */
export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logOut } = useAuth();
  const unread = useUnreadCount();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border/20 px-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="text-lg font-bold tracking-wide text-brand-700"
        >
          Sansaaric Stay
        </Link>
        <Badge tone="brand">Admin</Badge>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const exact = "exact" in item && item.exact;
                const active = exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                const showBadge = "badge" in item && item.badge && unread > 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-soft hover:bg-bg hover:text-ink"
                      }`}
                    >
                      <Icon aria-hidden className="size-[18px] shrink-0" />
                      <span className="flex-1">{item.name}</span>
                      {showBadge && (
                        <span
                          aria-label={`${unread} unread`}
                          className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white"
                        >
                          {unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="border-t border-border/20 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar user={user} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-soft">{user.email}</p>
            </div>
            <button
              onClick={logOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-ink-soft hover:bg-bg hover:text-red-600"
            >
              <LogOut aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
