import { Link } from "react-router-dom";

const LAST_UPDATED = "May 1, 2026";

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <header className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Legal</p>
          <h1 className="text-3xl font-black text-foreground mt-1">Cookie & Local Storage Notice</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6 text-sm text-muted-foreground space-y-3 leading-6">
          <p>FanCam uses cookies, local storage, and similar technical storage to run core features and improve reliability.</p>
          <p>Essential storage is used for login sessions, security checks, preference persistence, and fraud prevention.</p>
          <p>Operational storage may be used for performance tuning, feature quality checks, and diagnostics.</p>
          <p>Where required by law, additional consent controls can be presented for non-essential analytics or personalization tracking.</p>
          <p>Disabling some storage features may reduce app functionality, including notifications, sign-in continuity, and settings memory.</p>
          <p>You can manage browser storage preferences in your browser settings and device-level controls.</p>
        </section>

        <footer className="rounded-2xl border border-border bg-card/80 p-5 flex gap-4 text-sm">
          <Link to="/about" className="text-foreground hover:underline">About Hub</Link>
          <Link to="/terms" className="text-foreground hover:underline">Terms</Link>
          <Link to="/privacy" className="text-foreground hover:underline">Privacy</Link>
          <Link to="/community-guidelines" className="text-foreground hover:underline">Guidelines</Link>
        </footer>
      </div>
    </div>
  );
}

