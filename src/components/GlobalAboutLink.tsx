import { Link, useLocation } from "react-router-dom";
import { Info } from "lucide-react";

export function GlobalAboutLink() {
  const { pathname } = useLocation();
  if (pathname === "/about") return null;

  return (
    <Link
      to="/about"
      className="focus-ring fixed z-[45] flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-2 text-sm font-medium text-foreground shadow-card backdrop-blur-md transition-colors hover:border-border hover:bg-card hover:text-primary"
      style={{
        top: "max(env(safe-area-inset-top, 0px), 12px)",
        right: "max(env(safe-area-inset-right, 0px), 12px)",
      }}
      aria-label="About and legal hub"
    >
      <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>About</span>
    </Link>
  );
}
