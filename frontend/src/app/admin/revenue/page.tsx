import type { Metadata } from "next";
import { RevenueView } from "@/components/admin/RevenueView";

export const metadata: Metadata = { title: "Revenue" };

export default function AdminRevenuePage() {
  return <RevenueView />;
}
