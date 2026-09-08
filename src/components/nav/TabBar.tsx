import Link from "next/link";
import type { SVGProps } from "react";

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function BookingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  );
}
function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M4 5h16v11H9l-5 4V5Z" />
    </svg>
  );
}
function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-5 4.2-6 7-6s5.5 2 7 6" />
    </svg>
  );
}

const tabs = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/account", label: "Bookings", icon: BookingsIcon },
  { href: "/#chat", label: "Chat", icon: ChatIcon },
  { href: "/account", label: "Profile", icon: ProfileIcon },
];

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-black/90 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-1 text-white/70 hover:text-white"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default TabBar;
