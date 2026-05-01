import { useCallback, useEffect, useState } from "react";
import { X, Heart, MessageCircle, Star, Gift, Repeat2, UserPlus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notificationsService";

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
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    if (!opts?.silent) setLoading(true);
    const result = await listNotifications(user.id, 50);
    if (result.error && !opts?.silent) {
      toast({ title: "Failed to load notifications", description: result.error, variant: "destructive" });
    }
    if (result.data) setNotifications(result.data as Notification[]);
    if (!opts?.silent) setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    if (open && user) {
      void fetchNotifications();
      const channel = supabase
        .channel(`notif-drawer-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
          void fetchNotifications({ silent: true });
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [open, user, fetchNotifications]);

  const handleTap = async (n: Notification) => {
    if (!user) return;
    if (!n.read) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    }
    if (!n.read) {
      const result = await markNotificationRead(user.id, n.id);
      if (result.error) {
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: false } : item)));
        toast({ title: "Could not mark as read", variant: "destructive" });
      }
    }
    onClose();
    if (n.type === "follow" && n.reference_id) {
      navigate(`/u/${n.reference_id}`);
      return;
    }
    if (n.reference_id) navigate(`/clip/${n.reference_id}`);
  };

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const result = await markAllNotificationsRead(user.id);
    if (result.error) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: unreadIds.includes(n.id) ? false : n.read }))
      );
      toast({ title: "Could not mark all as read", variant: "destructive" });
    }
  };

  const refreshNow = async () => {
    setRefreshing(true);
    await fetchNotifications({ silent: true });
    setRefreshing(false);
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <h2 className="text-lg font-black text-foreground">Notifications</h2>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button onClick={() => void markAllRead()} className="text-xs text-electric font-semibold hover:underline">
              Mark all read
            </button>
          )}
          <button onClick={() => void refreshNow()} className="p-2 rounded-full bg-secondary border border-border" aria-label="Refresh notifications">
            <RefreshCw className={`w-4 h-4 text-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-secondary border border-border">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        )}
        {notifications.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">No notifications yet 🔔</p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => handleTap(n)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border transition-colors ${
              n.read ? "opacity-60" : "bg-electric/5"
            }`}
          >
            <div className="mt-0.5">{icon(n.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            {!n.read && <div className="w-2 h-2 rounded-full bg-electric mt-2 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
