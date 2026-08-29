import { ChatWidget } from "@/components/chatbot/ChatWidget";
import SiteFooter from "@/components/nav/SiteFooter";
import TabBar from "@/components/nav/TabBar";
import TopNav from "@/components/nav/TopNav";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav />
      <main className="pb-20 md:pb-0">{children}</main>
      <SiteFooter />
      <TabBar />
      <ChatWidget />
    </>
  );
}
