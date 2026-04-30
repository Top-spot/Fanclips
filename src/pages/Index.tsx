import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import HomeFeed from "@/components/HomeFeed";
import UploadPage from "@/components/UploadPage";
import MyClipsPage from "@/components/MyClipsPage";
import RewardsPage from "@/components/RewardsPage";
import ProfilePage from "@/components/ProfilePage";
import NotificationsDrawer from "@/components/NotificationsDrawer";
import OnboardingPreferences from "@/components/OnboardingPreferences";
import { useAuth } from "@/context/AuthContext";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export type Tab = "feed" | "upload" | "clips" | "rewards" | "profile";

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [notifOpen, setNotifOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user } = useAuth();
  const { hasPreferences, loaded, refresh } = useUserPreferences();

  useEffect(() => {
    if (loaded && user && hasPreferences === false) {
      setShowOnboarding(true);
    }
  }, [loaded, user, hasPreferences]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    refresh();
  };

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
    <div className="h-full flex flex-col bg-background max-w-lg mx-auto">
      {showOnboarding ? (
        <OnboardingPreferences onComplete={handleOnboardingComplete} />
      ) : (
        <>
          <main className="flex-1 overflow-hidden relative">
            {renderTab()}
          </main>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
          <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
        </>
      )}
    </div>
  );
};

export default Index;
