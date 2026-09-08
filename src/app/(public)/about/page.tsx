import ComingSoon from "@/components/ui/ComingSoon";
import { Metadata } from "next";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return <ComingSoon title="About us" note="Our story is coming soon." />;
}