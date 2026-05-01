import { PropsWithChildren, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function RequireAdmin({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const [checkingRole, setCheckingRole] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setCheckingRole(false);
        }
        return;
      }

      setCheckingRole(true);
      const { data: rpcData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });

      if (!cancelled) {
        setIsAdmin(Boolean(rpcData));
        setCheckingRole(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || checkingRole) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Verifying access...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
