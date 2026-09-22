import Link from "next/link";
import {
  BookingsIcon,
  ChatIcon,
  HomeIcon,
  ProfileIcon,
  SearchIcon,
} from "../icons/icons";

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
