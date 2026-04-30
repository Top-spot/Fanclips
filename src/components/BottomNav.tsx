import { useState, useEffect } from "react";
import { Home, Upload, Film, Trophy, User } from "lucide-react";
import type { Tab } from "@/pages/Index";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs = [
  { id: "feed" as Tab, icon: Home, label: "Feed" },
  { id: "clips" as Tab, icon: Film, label: "My Clips" },
  { id: "upload" as Tab, icon: Upload, label: "" },
  { id: "rewards" as Tab, icon: Trophy, label: "Rewards" },
  { id: "profile" as Tab, icon: User, label: "Profile" },
];

export default function BottomNav({ activeTab, onTabChange }: Props) {
  const [tappedTab, setTappedTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (tappedTab) {
      const t = setTimeout(() => setTappedTab(null), 350);
      return () => clearTimeout(t);
    }
  }, [tappedTab]);

  const handleTap = (tab: Tab) => {
    setTappedTab(tab);
    onTabChange(tab);
  };

  return (
    <nav
      className="flex-none h-16 bg-card border-t border-border flex items-center justify-around px-2 relative z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const isUpload = tab.id === "upload";
        const isActive = activeTab === tab.id;
        const isTapped = tappedTab === tab.id;
        const Icon = tab.icon;

        if (isUpload) {
          return (
            <button
              key={tab.id}
              onClick={() => handleTap(tab.id)}
              className="flex flex-col items-center justify-center -mt-5 relative"
              aria-label="Upload Clip"
            >
              <div
                className={`w-14 h-14 rounded-full gradient-electric flex items-center justify-center transition-all ${
                  isActive ? "glow-blue scale-110" : "hover:scale-105"
                } ${isTapped ? "ring-pulse" : ""}`}
              >
                <Icon className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
              </div>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => handleTap(tab.id)}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1.5 transition-all ${
              isActive ? "text-electric" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              className={`w-5 h-5 transition-transform ${isTapped ? "bounce-tap" : isActive ? "scale-110" : ""}`}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            {tab.label && (
              <span className={`text-[10px] font-medium ${isActive ? "text-electric" : ""}`}>
                {tab.label}
              </span>
            )}
            {isActive && (
              <span className="w-1 h-1 rounded-full bg-electric glow-blue animate-fade-in" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
