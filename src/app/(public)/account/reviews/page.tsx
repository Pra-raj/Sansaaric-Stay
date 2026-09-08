import { ReviewsView } from "@/components/accounts/ReviewsView";
import { Metadata } from "next";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return <ReviewsView />;
}
