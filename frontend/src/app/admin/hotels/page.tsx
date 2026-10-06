import type { Metadata } from "next";
import { HotelsView } from "@/components/admin/HotelView";

export const metadata: Metadata = { title: "Hotels" };

export default function AdminHotelsPage() {
  return <HotelsView />;
}
