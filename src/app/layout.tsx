import type { Metadata } from "next";
import "../styles/globals.css";
import SiteFooter from "@/components/nav/SiteFooter";
import TopNav from "@/components/nav/TopNav";
import AuthModalHost from "@/components/auth/AuthModalHost";
import TabBar from "@/components/nav/TabBar";
import AuthProvider from "@/lib/auth-context";
import { AuthModalProvider } from "@/lib/auth-modal-context";

export const metadata: Metadata = {
  title: "Sansaaric Stay",
  description: "Travel the World, One Hotel at a Time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AuthModalProvider>
            {children}
            <AuthModalHost />
          </AuthModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
