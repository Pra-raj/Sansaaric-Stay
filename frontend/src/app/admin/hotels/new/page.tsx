import type { Metadata } from "next";
import { HotelEditor } from "@/components/admin/HotelEditor";

export const metadata: Metadata = { title: "Add hotel" };

export default function AdminNewHotelPage() {
  return <HotelEditor />;
}
