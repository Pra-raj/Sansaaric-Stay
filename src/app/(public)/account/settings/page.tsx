import { SettingsView } from "@/components/accounts/SettingsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage your Sansaaric Stay account, password, and notification preferences.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
