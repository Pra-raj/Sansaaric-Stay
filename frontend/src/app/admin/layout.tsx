import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: {
    default: "Admin · Sansaaric Stay",
    template: "%s · Sansaaric Admin",
  },
  robots: { index: false, follow: false },
};

// Lives outside the (public) route group on purpose, so admin pages don't
// get the guest TopNav, footer, mobile tab bar, or chat widget.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
