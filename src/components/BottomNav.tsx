import { useEffect, useMemo, useState } from "react";
import { Home, Upload, Film, Trophy, User } from "lucide-react";
import type { Tab } from "@/pages/Index";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  autoHide?: boolean;
  forceHidden?: boolean;
}

const tabs = [
  { id: "feed" as Tab, icon: Home, label: "Feed" },
  { id: "clips" as Tab, icon: Film, label: "My Clips" },
  { id: "upload" as Tab, icon: Upload, label: "" }, // center button
  { id: "rewards" as Tab, icon: Trophy, label: "Rewards" },
  { id: "profile" as Tab, icon: User, label: "Profile" },
];

export default function BottomNav({ activeTab, onTabChange, autoHide = false, forceHidden = false }: Props) {
  const [visible, setVisible] = useState(true);

  const navHidden = useMemo(() => {
    if (forceHidden) return true;
    if (!autoHide) return false;
    return !visible;
  }, [forceHidden, autoHide, visible]);

  useEffect(() => {
    if (!autoHide || forceHidden) {
      setVisible(true);
      return;
    }
    const hideTimer = window.setTimeout(() => setVisible(false), 1600);
    const onPointerDown = (event: PointerEvent) => {
      if (event.clientY >= window.innerHeight - 120) {
        setVisible(true);
        window.setTimeout(() => setVisible(false), 1800);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [autoHide, forceHidden, activeTab]);

  return (
    <>
      {autoHide && !forceHidden && navHidden && (
        <button
          onClick={() => setVisible(true)}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 w-16 h-5 rounded-full bg-card/75 border border-border/70 backdrop-blur-md flex items-center justify-center"
          aria-label="Show menu"
        >
          <span className="w-8 h-1 rounded-full bg-muted-foreground/70" />
        </button>
      )}
      <nav
        className={`absolute bottom-2 left-2 right-2 md:left-4 md:right-4 rounded-2xl border border-border/70 bg-card/88 shadow-card backdrop-blur-xl flex items-center justify-around px-2 z-50 transition-transform duration-300 ${navHidden ? "translate-y-[130%]" : "translate-y-0"} h-14`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
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
              <div className={`w-12 h-12 rounded-full gradient-electric flex items-center justify-center transition-all shadow-lg ${
                isActive ? "glow-blue scale-110" : "hover:scale-105"
              }`}>
                <Icon className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
              </div>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 transition-all ${
              isActive ? "text-electric" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon
              className={`w-[18px] h-[18px] transition-transform ${isActive ? "scale-110" : ""}`}
              strokeWidth={isActive ? 2.5 : 1.5}
            />
            {tab.label && (
              <span className={`text-[11px] font-medium ${isActive ? "text-electric" : ""}`}>
                {tab.label}
              </span>
            )}
          </button>
        );
      })}
      </nav>
    </>
  );
}
