import { SavedView } from "@/components/accounts/SavedView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved stays",
  description: "Hotels and homestays you've saved for later.",
};

export default function SavedPage() {
  return <SavedView />;
}
