import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase auto-exchanges the recovery token from the URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // User is now in recovery mode — they can update their password
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      toast({ title: "Password updated! 🎉", description: "You can now sign in with your new password." });
      setTimeout(() => navigate("/"), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full gradient-electric flex items-center justify-center glow-blue mb-6 animate-scale-in">
          <CheckCircle className="w-10 h-10 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">Password Updated!</h2>
        <p className="text-muted-foreground">Redirecting you to the app…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "hsl(var(--primary))" }} />

      <div className="flex items-center gap-3 mb-10 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl gradient-electric flex items-center justify-center glow-blue">
          <Video className="w-8 h-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Fan<span className="text-primary">Cam</span>
          </h1>
        </div>
      </div>

      <div className="w-full max-w-sm gradient-card border border-border rounded-2xl p-6 shadow-card animate-scale-in">
        <h2 className="text-xl font-bold text-foreground mb-1">Set New Password</h2>
        <p className="text-sm text-muted-foreground mb-6">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-foreground text-sm font-medium">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                maxLength={128}
                className="bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-foreground text-sm font-medium">Confirm Password</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={128}
              className="bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-bold gradient-electric text-primary-foreground border-0 glow-blue hover:opacity-90 transition-opacity mt-2"
          >
            {loading ? "Updating…" : "Update Password"}
          </Button>
        </form>

        <button
          onClick={() => navigate("/auth")}
          className="text-sm text-primary hover:underline mt-4 block mx-auto"
        >
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
}
