import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [supported, setSupported] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-push.js").catch(() => {});
    }
  }, []);

  // Check if VAPID is configured
  useEffect(() => {
    supabase.functions.invoke("push-vapid-key").then(({ data }) => {
      setVapidConfigured(!!data?.publicKey);
    }).catch(() => setVapidConfigured(false));
  }, []);

  const subscribe = async () => {
    if (!user || !supported) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      // Get VAPID public key from edge function
      const { data: vapidData } = await supabase.functions.invoke("push-vapid-key");
      if (!vapidData?.publicKey) return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys) return false;

      // Use raw RPC to avoid type issues with new table
      const { error } = await supabase.rpc("save_push_subscription" as any, {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys.p256dh!,
        p_auth: json.keys.auth!,
      });

      if (error) {
        // Fallback: direct insert using fetch
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/push_subscriptions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "Authorization": `Bearer ${session.access_token}`,
              "Prefer": "resolution=merge-duplicates",
            },
            body: JSON.stringify({
              user_id: user.id,
              endpoint: json.endpoint,
              p256dh: json.keys.p256dh!,
              auth: json.keys.auth!,
            }),
          });
        }
      }

      return true;
    } catch {
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!user) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
            {
              method: "DELETE",
              headers: {
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${session.access_token}`,
              },
            }
          );
        }
      }
    } catch {}
  };

  return { supported, permission, subscribe, unsubscribe, vapidConfigured };
}
