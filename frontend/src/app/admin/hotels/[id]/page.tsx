import type { Metadata } from "next";
import { HotelEditor } from "@/components/admin/HotelEditor";

export const metadata: Metadata = { title: "Edit hotel" };

export default async function AdminEditHotelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HotelEditor hotelId={id} />;
}
