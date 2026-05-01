import { useState } from "react";
import { Video } from "lucide-react";
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
  const desktopTabs: Array<{ id: Tab; label: string }> = [
    { id: "feed", label: "Feed" },
    { id: "clips", label: "My Clips" },
    { id: "upload", label: "Upload" },
    { id: "rewards", label: "Rewards" },
    { id: "profile", label: "Profile" },
  ];

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
    <div className="h-full w-full overflow-x-hidden bg-gradient-to-b from-background via-background to-[hsl(220_22%_4%)] px-3 md:px-8 lg:px-12 py-0 md:py-5">
      <div className="h-full mx-auto w-full max-w-[960px]">
        <div className="relative h-full flex flex-col bg-background md:border md:border-border/90 md:rounded-[1.25rem] md:overflow-hidden md:shadow-[0_8px_40px_hsl(220_20%_2%/0.55),0_0_0_1px_hsl(210_100%_56%/0.06)]">
          <header className="hidden md:flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-gradient-to-r from-card/90 via-card/70 to-card/90 px-5 py-3.5 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(240_100%_58%)] text-primary-foreground shadow-md ring-1 ring-white/10"
                aria-hidden
              >
                <Video className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-foreground">Fan Flash Moments</p>
                <p className="truncate text-[11px] text-muted-foreground">Highlights from the crowd</p>
              </div>
            </div>
            <nav className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none" aria-label="Main">
              {desktopTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`focus-ring min-h-11 rounded-full px-4 text-sm font-semibold transition-[color,background-color,box-shadow,transform] active:scale-[0.98] ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(210_100%_70%/0.35),0_6px_20px_hsl(210_100%_50%/0.25)]"
                        : "bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </header>
          <main className="relative flex-1 overflow-hidden pb-[calc(var(--bottom-nav-height)+var(--safe-area-inset-bottom))] md:pb-0">
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
