import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Star, Gift, Repeat2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  type: string;
  message: string;
  reference_id: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationsPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);
    setNotifications((data as Notification[] | null) ?? []);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  const handleTap = async (n: Notification) => {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
    onClose();
    if (n.type === "follow" && n.reference_id) {
      navigate(`/u/${n.reference_id}`);
      return;
    }
    if (n.reference_id) navigate(`/clip/${n.reference_id}`);
  };

  const icon = (type: string) => {
    if (type === "like") return <Heart className="w-4 h-4 text-destructive" />;
    if (type === "comment") return <MessageCircle className="w-4 h-4 text-electric" />;
    if (type === "gift") return <Gift className="w-4 h-4 text-stadium-yellow" />;
    if (type === "star") return <Star className="w-4 h-4 text-stadium-yellow" />;
    if (type === "repost") return <Repeat2 className="w-4 h-4 text-electric" />;
    if (type === "follow") return <UserPlus className="w-4 h-4 text-electric" />;
    return <Star className="w-4 h-4 text-accent" />;
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  if (!open) return null;

  return (
    <div ref={rootRef} className="fixed right-3 top-36 z-[80] w-[min(92vw,360px)] rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Notifications</p>
        <button onClick={onClose} className="text-xs text-muted-foreground">Close</button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {notifications.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-10">No new activity yet</p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => void handleTap(n)}
            className={`w-full text-left px-3.5 py-2.5 border-b border-border/60 flex items-start gap-2.5 ${n.read ? "opacity-65" : "bg-electric/5"}`}
          >
            <div className="mt-0.5">{icon(n.type)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground leading-snug">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!n.read && <span className="w-2 h-2 rounded-full bg-electric mt-1.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}
