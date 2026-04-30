import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import HomeFeed from "@/components/HomeFeed";
import UploadPage from "@/components/UploadPage";
import MyClipsPage from "@/components/MyClipsPage";
import RewardsPage from "@/components/RewardsPage";
import ProfilePage from "@/components/ProfilePage";

export type Tab = "feed" | "upload" | "clips" | "rewards" | "profile";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [isFeedWatching, setIsFeedWatching] = useState(false);

  const renderTab = () => {
    switch (activeTab) {
      case "feed": return <HomeFeed onWatchModeChange={setIsFeedWatching} />;
      case "upload": return <UploadPage onDone={() => setActiveTab("clips")} />;
      case "clips": return <MyClipsPage />;
      case "rewards": return <RewardsPage />;
      case "profile": return <ProfilePage />;
    }
  };

  return (
    <div className="h-full bg-background px-3 md:px-8 lg:px-12 py-0 md:py-4">
      <div className="h-full mx-auto w-full max-w-[860px]">
        <div className="relative h-full flex flex-col bg-background md:border md:border-border md:rounded-2xl md:overflow-hidden md:shadow-card">
          <main className={`flex-1 overflow-hidden relative ${activeTab === "feed" ? "pb-0" : "pb-20"}`}>
            {renderTab()}
          </main>
          <BottomNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            autoHide={activeTab === "feed"}
            forceHidden={isFeedWatching}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
