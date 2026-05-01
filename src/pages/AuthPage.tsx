import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Zap, Trophy, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loginSchema, signupSchema } from "@/lib/validation";

function readableAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Invalid email or password. Double-check both and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Email not confirmed yet. Open your inbox and click the confirmation link first.";
  }
  if (m.includes("user already registered") || m.includes("already registered")) {
    return "This email already has an account. Try Sign In or use Forgot Password.";
  }
  if (m.includes("too many requests")) {
    return "Too many attempts right now. Wait a minute and try again.";
  }
  return message;
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchParams] = useSearchParams();
  const { signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (searchParams.get("mode") === "forgot") {
      setMode("forgot");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      if (mode === "forgot") {
        const emailResult = loginSchema.shape.email.safeParse(email);
        if (!emailResult.success) {
          setErrors({ email: emailResult.error.errors[0]?.message ?? "Invalid email address" });
          return;
        }
        const { error } = await resetPassword(emailResult.data);
        if (error) throw error;
        toast({
          title: "Reset email sent",
          description: "Check your inbox for the password reset link.",
        });
        setMode("login");
        setPassword("");
      } else if (mode === "login") {
        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
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
      const msg = readableAuthError(err instanceof Error ? err.message : "Something went wrong");
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "hsl(var(--electric-blue))" }} />
      <div className="pointer-events-none absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full opacity-8 blur-3xl"
        style={{ background: "hsl(var(--stadium-yellow))" }} />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3 mb-10 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl gradient-electric flex items-center justify-center glow-blue">
          <Video className="w-8 h-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Fan<span className="text-electric">Cam</span>
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Stadium Highlights</p>
        </div>
      </div>

      {/* Features row */}
      {mode !== "forgot" && (
        <div className="relative z-10 flex gap-6 mb-8 animate-fade-in">
          {[
            { icon: Video, label: "Upload Clips" },
            { icon: Zap, label: "AI Enhanced" },
            { icon: Trophy, label: "Earn Rewards" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <Icon className="w-5 h-5 text-electric" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm gradient-card border border-border rounded-2xl p-6 shadow-card animate-scale-in">
        {mode === "forgot" ? (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setErrors({});
            }}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </button>
        ) : (
          <div className="flex rounded-xl bg-secondary/50 p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setErrors({}); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? "bg-electric text-primary-foreground glow-blue"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "forgot" && (
            <p className="text-sm text-muted-foreground">Enter your account email to receive a reset link.</p>
          )}
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground text-sm font-medium">Username</Label>
              <Input
                id="username"
                placeholder="fanname"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
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
                maxLength={128}
                className={`bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground h-12 text-base pr-12 ${errors.password ? "border-destructive" : ""}`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>
          )}

          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setPassword("");
                setErrors({});
              }}
              className="text-xs font-semibold text-electric hover:underline"
            >
              Forgot password?
            </button>
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
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErrors({}); }}
              className="text-electric font-semibold hover:underline"
            >
              {mode === "login" ? "Join FanCam" : "Sign in"}
            </button>
          </p>
        )}
      </div>

      <p className="relative z-10 text-xs text-muted-foreground mt-6 animate-fade-in">
        Browse the feed without signing in — just tap Back
      </p>
      <button
        onClick={() => navigate("/")}
        className="relative z-10 text-sm text-electric hover:underline mt-2 animate-fade-in"
      >
        ← Back to Feed
      </button>
      <button
        onClick={() => navigate("/about")}
        className="relative z-10 text-xs text-muted-foreground hover:underline mt-2 animate-fade-in"
      >
        About, rewards, safety & legal
      </button>
    </div>
  );
}
