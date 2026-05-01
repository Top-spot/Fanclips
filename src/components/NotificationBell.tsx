import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { countUnreadNotifications } from "@/services/notificationsService";

export default function NotificationBell({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const result = await countUnreadNotifications(user.id);
    if (!result.error) {
      setCount(result.data);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }

    void fetchCount();
    const channel = supabase
      .channel(`notif-count-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        void fetchCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchCount]);

  if (!user) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-full border border-border bg-secondary p-2",
        className,
      )}
    >
      <Bell className="w-5 h-5 text-foreground" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
