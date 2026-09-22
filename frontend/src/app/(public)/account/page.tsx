import { AccountView } from "@/components/accounts/AccountView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Bookings",
  description:
    "View your upcoming, completed, and cancelled Sansaaric Stay bookings.",
};

export default function AccountPage() {
  return <AccountView />;
}
