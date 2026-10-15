import type { Metadata } from "next";
import { InboxView } from "@/components/admin/InboxView";

export const metadata: Metadata = { title: "Inbox" };

export default function AdminInboxPage() {
  return <InboxView />;
}
