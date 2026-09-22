"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "../ui/Avatar";
import type { AuthUser } from "../../lib/auth-context";

interface AccountSidebarProps {
  user: AuthUser;
}

const navItems = [
  { name: "Bookings", href: "/account" },
  {name:"Saved", href:"/account/saved"},
  { name: "Reviews", href: "/account/reviews" },
  {name:"Payment methods", href:"/account/payment-methods"},
  { name: "Settings", href: "/account/settings" },
];

export function AccountSidebar({ user }: AccountSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="space-y-4">
      <div className="rounded-card border border-border/10 bg-surface p-4">
       <div className="mb-2">
        <Avatar user={user}  size={48}/>
       </div>
       <p className="font-semibold">{user.name}</p>
       <p className="text-xs text-ink-soft">{user.email}</p>
      </div>
      <nav className="space-y-1 text-sm font-medium">
        {navItems.map((item) => {
          const active = pathname  === item.href;
          return(
            <Link key={item.href} href={item.href} className={`block rounded-lg px-3 py-2 ${active ?"bg-brand-50 text-brand-600": "text-ink-soft hover:bg-bg"}`}>
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  );
}
