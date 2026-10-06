import type { Metadata } from "next";
import { DocumentsView } from "@/components/admin/DocumentsView";

export const metadata: Metadata = { title: "Training documents" };

export default function AdminDocumentsPage() {
  return <DocumentsView />;
}
