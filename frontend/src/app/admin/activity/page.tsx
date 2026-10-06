import type { Metadata } from "next";
import { ActivityView } from "@/components/admin/ActivityView";

export const metadata: Metadata = { title: "Activity log" };

export default function AdminActivityPage() {
  return <ActivityView />;
}
