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
          type="button"
          onClick={() => setVisible(true)}
          className="focus-ring fixed bottom-[calc(var(--safe-area-inset-bottom)+10px)] left-1/2 z-50 flex h-7 w-[4.25rem] -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-card/90 shadow-card backdrop-blur-md md:hidden"
          aria-label="Show menu"
        >
          <span className="h-1 w-9 rounded-full bg-muted-foreground/60" />
        </button>
      )}
      <nav
        className={`fixed bottom-0 left-2 right-2 z-50 flex h-[72px] items-center justify-around rounded-[1.35rem] border border-border/80 bg-card/92 px-2 shadow-[0_-4px_32px_hsl(220_20%_2%/0.45)] backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${navHidden ? "translate-y-[130%]" : "translate-y-0"}`}
        style={{ paddingBottom: "max(var(--safe-area-inset-bottom), 0px)" }}
        aria-label="Primary"
      >
      {tabs.map((tab) => {
        const isUpload = tab.id === "upload";
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        if (isUpload) {
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className="focus-ring relative -mt-6 flex min-h-11 min-w-11 flex-col items-center justify-center rounded-full"
              aria-label="Upload Clip"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(240_100%_58%)] shadow-lg transition-transform motion-reduce:transition-none ${
                isActive ? "glow-blue scale-110 motion-reduce:scale-100" : "hover:scale-105 motion-reduce:hover:scale-100"
              }`}>
                <Icon className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
              </div>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`focus-ring flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 transition-colors ${
              isActive ? "text-electric" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={tab.label}
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
