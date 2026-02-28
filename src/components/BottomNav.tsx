import { Home, Upload, Film, Trophy, User } from "lucide-react";
import type { Tab } from "@/pages/Index";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs = [
  { id: "feed" as Tab, icon: Home, label: "Feed" },
  { id: "clips" as Tab, icon: Film, label: "My Clips" },
  { id: "upload" as Tab, icon: Upload, label: "" }, // center button
  { id: "rewards" as Tab, icon: Trophy, label: "Rewards" },
  { id: "profile" as Tab, icon: User, label: "Profile" },
];

export default function BottomNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex-none h-20 bg-card border-t border-border flex items-center justify-around px-2 relative z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {tabs.map((tab) => {
        const isUpload = tab.id === "upload";
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        if (isUpload) {
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center justify-center -mt-6 relative"
              aria-label="Upload Clip"
            >
              <div className={`w-16 h-16 rounded-full gradient-electric flex items-center justify-center transition-all ${
                isActive ? "glow-blue scale-110" : "hover:scale-105"
              }`}>
                <Icon className="w-7 h-7 text-primary-foreground" strokeWidth={2.5} />
              </div>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all ${
              isActive ? "text-electric" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              className={`w-6 h-6 transition-transform ${isActive ? "scale-110" : ""}`}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            {tab.label && (
              <span className={`text-xs font-medium ${isActive ? "text-electric" : ""}`}>
                {tab.label}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
