import { useEffect, useState, useCallback } from "react";
import { X, Heart, MessageCircle, Star } from "lucide-react";
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

export default function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Failed to fetch notifications:", error);
        return;
      }
      if (data) setNotifications(data as Notification[]);
    } catch (err) {
      console.error("Notifications fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      fetchNotifications();
      const channel = supabase
        .channel(`notif-drawer-${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
          fetchNotifications();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [open, user, fetchNotifications]);

  const handleTap = async (n: Notification) => {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
    onClose();
    if (n.reference_id) navigate(`/clip/${n.reference_id}`);
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const icon = (type: string) => {
    if (type === "like") return <Heart className="w-4 h-4 text-destructive" />;
    if (type === "comment") return <MessageCircle className="w-4 h-4 text-primary" />;
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <h2 className="text-lg font-black text-foreground">Notifications</h2>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-full bg-secondary border border-border">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No notifications yet 🔔</p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleTap(n)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border transition-colors ${
              n.read ? "opacity-60" : "bg-primary/5"
            }`}
          >
            <div className="mt-0.5">{icon(n.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
