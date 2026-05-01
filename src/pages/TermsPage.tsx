import { Link } from "react-router-dom";

const LAST_UPDATED = "May 1, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <header className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Legal</p>
          <h1 className="text-3xl font-black text-foreground mt-1">Terms of Use</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6 text-sm text-muted-foreground space-y-3 leading-6">
          <p>By using FanCam, you agree to these Terms. You must be legally able to enter into this agreement in your jurisdiction.</p>
          <p>You are responsible for all activity under your account and for all content you post, upload, or share.</p>
          <p>You must only post content you have the legal right to use, including music, video, branding, and identifiable individuals where required.</p>
          <p>You grant FanCam a non-exclusive, worldwide, royalty-free license to host and display your content to operate the service.</p>
          <p>FanCam may remove content, limit features, or suspend accounts for policy violations, fraud, abuse, security risk, or legal compliance.</p>
          <p>Rewards, points, and promotional features may change, be paused, or be removed at any time according to program rules and law.</p>
          <p>To the maximum extent allowed by law, FanCam is provided as available and liability is limited. Mandatory consumer rights still apply.</p>
          <p>Use of bots, scraping, impersonation, harassment, scams, and illegal behavior is prohibited.</p>
        </section>

        <footer className="rounded-2xl border border-border bg-card/80 p-5 flex gap-4 text-sm">
          <Link to="/about" className="text-foreground hover:underline">About Hub</Link>
          <Link to="/privacy" className="text-foreground hover:underline">Privacy</Link>
          <Link to="/community-guidelines" className="text-foreground hover:underline">Guidelines</Link>
          <Link to="/cookies" className="text-foreground hover:underline">Cookies</Link>
        </footer>
      </div>
    </div>
  );
}

