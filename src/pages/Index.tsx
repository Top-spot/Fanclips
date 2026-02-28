import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import HomeFeed from "@/components/HomeFeed";
import UploadPage from "@/components/UploadPage";
import MyClipsPage from "@/components/MyClipsPage";
import RewardsPage from "@/components/RewardsPage";
import ProfilePage from "@/components/ProfilePage";
import NotificationsDrawer from "@/components/NotificationsDrawer";

export type Tab = "feed" | "upload" | "clips" | "rewards" | "profile";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [notifOpen, setNotifOpen] = useState(false);

  const renderTab = () => {
    switch (activeTab) {
      case "feed": return <HomeFeed onOpenNotifications={() => setNotifOpen(true)} />;
      case "upload": return <UploadPage onDone={() => setActiveTab("clips")} />;
      case "clips": return <MyClipsPage />;
      case "rewards": return <RewardsPage />;
      case "profile": return <ProfilePage />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <main className="flex-1 overflow-hidden relative">
        {renderTab()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
};

export default Index;
