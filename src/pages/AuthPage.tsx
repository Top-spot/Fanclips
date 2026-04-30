import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Zap, Trophy, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loginSchema, signupSchema } from "@/lib/validation";

type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setErrors({});
    setEmail("");
    setPassword("");
    setUsername("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      if (mode === "forgot") {
        if (!email.trim()) {
          setErrors({ email: "Please enter your email" });
          setLoading(false);
          return;
        }
        const { error } = await resetPassword(email.trim());
        if (error) throw error;
        toast({
          title: "Reset link sent! 📧",
          description: "Check your email for a password reset link.",
        });
        switchMode("login");
      } else if (mode === "login") {
        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }
        const { error } = await signIn(result.data.email, result.data.password);
        if (error) throw error;
        navigate("/");
      } else {
        const result = signupSchema.safeParse({ email, password, username });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }
        const { error } = await signUp(result.data.email, result.data.password, result.data.username);
        if (error) throw error;
        toast({
          title: "Check your email! 📧",
          description: "We sent you a confirmation link to complete sign up.",
        });
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "hsl(var(--primary))" }} />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full opacity-8 blur-3xl"
        style={{ background: "hsl(var(--accent))" }} />

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl gradient-electric flex items-center justify-center glow-blue">
          <Video className="w-8 h-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Fan<span className="text-primary">Cam</span>
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Stadium Highlights</p>
        </div>
      </div>

      {/* Features row */}
      {mode !== "forgot" && (
        <div className="flex gap-6 mb-8 animate-fade-in">
          {[
            { icon: Video, label: "Upload Clips" },
            { icon: Zap, label: "AI Enhanced" },
            { icon: Trophy, label: "Earn Rewards" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm gradient-card border border-border rounded-2xl p-6 shadow-card animate-scale-in">
        {mode === "forgot" ? (
          <>
            <button onClick={() => switchMode("login")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors p-1 -ml-1">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
            <h2 className="text-xl font-bold text-foreground mb-1">Reset Password</h2>
            <p className="text-sm text-muted-foreground mb-6">Enter your email and we'll send you a reset link.</p>
          </>
        ) : (
          /* Tabs */
          <div className="flex rounded-xl bg-secondary/50 p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? "gradient-electric text-primary-foreground glow-blue"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground text-sm font-medium">Username</Label>
              <Input
                id="username"
                placeholder="fanname"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                autoComplete="username"
                autoFocus
                maxLength={30}
                className={`bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base ${errors.username ? "border-destructive" : ""}`}
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="fan@stadium.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus={mode !== "signup"}
              maxLength={255}
              className={`bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base ${errors.email ? "border-destructive" : ""}`}
              required
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  maxLength={128}
                  className={`bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base pr-12 ${errors.password ? "border-destructive" : ""}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-primary hover:underline font-medium mt-1"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-bold gradient-electric text-primary-foreground border-0 glow-blue hover:opacity-90 transition-opacity mt-2"
          >
            {loading
              ? "Loading..."
              : mode === "forgot"
              ? "Send Reset Link"
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            {mode === "login" ? "No account?" : "Already a fan?"}{" "}
            <button
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="text-primary font-semibold hover:underline"
            >
              {mode === "login" ? "Join FanCam" : "Sign in"}
            </button>
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-6 animate-fade-in">
        Browse the feed without signing in — just tap Back
      </p>
      <button
        onClick={() => navigate("/")}
        className="text-sm text-primary hover:underline mt-2 animate-fade-in"
      >
        ← Back to Feed
      </button>
    </div>
  );
}
