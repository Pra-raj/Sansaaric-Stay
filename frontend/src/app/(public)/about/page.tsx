import type { Metadata } from "next";
import { AboutHero } from "@/components/about/AboutHero";
import { WhatWeDo } from "@/components/about/WhatWeDo";
import { HowItWorks } from "@/components/about/HowItWorks";
import { WhyGuests } from "@/components/about/WhyGuests";
import { HostsCta } from "@/components/about/HostsCta";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Sansaaric Stay is a digital booking partner for independently owned homestays, small hotels and resorts in Nepal.",
};

export default function AboutPage() {
  return (
    <div>
      <AboutHero />
      <WhatWeDo />
      <HowItWorks />
      <WhyGuests />
      <HostsCta />
    </div>
  );
}
