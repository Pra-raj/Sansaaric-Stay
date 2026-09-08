import { PaymentMethodsView } from "@/components/accounts/PaymentMethodsView";
import { Metadata } from "next";

export const metadata: Metadata = { title: "Payment Methods" };

export default function PaymentMethodsPage() {
  return <PaymentMethodsView />;
}
