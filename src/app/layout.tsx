import type { Metadata } from "next";
import Script from "next/script";
import "../styles/globals.css";
import AuthModalHost from "@/components/auth/AuthModalHost";
import AuthProvider from "@/lib/auth-context";
import { AuthModalProvider } from "@/lib/auth-modal-context";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme-context";
import { SavedProvider } from "@/lib/saved-context";
import { ChatProvider } from "@/lib/chat-context";

export const metadata: Metadata = {
  title: "Sansaaric Stay",
  description: "Travel the World, One Hotel at a Time.",
  icons: {
    icon: "/logo.jpg?v=2",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <SavedProvider>
            <AuthProvider>
              <AuthModalProvider>
                <ChatProvider>
                  {children}
                  <AuthModalHost />
                </ChatProvider>
              </AuthModalProvider>
            </AuthProvider>
          </SavedProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}