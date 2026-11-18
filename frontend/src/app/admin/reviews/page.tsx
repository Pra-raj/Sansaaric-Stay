import type { Metadata } from "next";
import { ReviewsModerationView } from "@/components/admin/ReviewsModerationView";

export const metadata: Metadata = { title: "Reviews" };

export default function AdminReviewsPage() {
  return <ReviewsModerationView />;
}
