import { Link } from "react-router-dom";

const LAST_UPDATED = "May 1, 2026";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <header className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">FanCam Platform Docs</p>
          <h1 className="text-3xl md:text-4xl font-black text-foreground mt-1">About & Legal Hub</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {LAST_UPDATED}. This hub explains how FanCam works and links to dedicated legal pages for
            compliance workflows in the US and EU.
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Link className="px-3 py-2 rounded-xl bg-secondary border border-border text-foreground text-center" to="/terms">Terms</Link>
            <Link className="px-3 py-2 rounded-xl bg-secondary border border-border text-foreground text-center" to="/privacy">Privacy</Link>
            <Link className="px-3 py-2 rounded-xl bg-secondary border border-border text-foreground text-center" to="/community-guidelines">Guidelines</Link>
            <Link className="px-3 py-2 rounded-xl bg-secondary border border-border text-foreground text-center" to="/cookies">Cookies</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <h2 className="text-xl font-black text-foreground">How FanCam Works</h2>
          <div className="mt-3 text-sm text-muted-foreground space-y-3 leading-6">
          <p>
            FanCam lets users upload sports fan highlight clips, interact with other fans, discover clips by interests,
            and earn points for healthy participation. The app includes a feed, profile pages, comments, follows,
            reposts, notifications, and reward redemption features.
          </p>
          <p>
            User accounts are required for uploading, liking, commenting, gifting points, and redeeming rewards. Public
            browsing may be available without sign-in depending on product settings.
          </p>
          <p>
            Platform reliability and user trust are core priorities. We build with transparent activity records,
            permissioned actions, and moderation-oriented safety controls.
          </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <h2 className="text-xl font-black text-foreground">Legal Documentation</h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link to="/terms" className="rounded-xl border border-border p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <p className="text-sm font-semibold text-foreground">Terms of Use</p>
              <p className="text-xs text-muted-foreground mt-1">Rules, responsibilities, platform rights, and limits.</p>
            </Link>
            <Link to="/privacy" className="rounded-xl border border-border p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <p className="text-sm font-semibold text-foreground">Privacy Notice</p>
              <p className="text-xs text-muted-foreground mt-1">Data processing, retention, and EU/US rights handling.</p>
            </Link>
            <Link to="/community-guidelines" className="rounded-xl border border-border p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <p className="text-sm font-semibold text-foreground">Community Guidelines</p>
              <p className="text-xs text-muted-foreground mt-1">Safety-first content standards and enforcement model.</p>
            </Link>
            <Link to="/cookies" className="rounded-xl border border-border p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <p className="text-sm font-semibold text-foreground">Cookies & Storage</p>
              <p className="text-xs text-muted-foreground mt-1">How cookies/local storage support app operation.</p>
            </Link>
          </div>
        </section>

        <footer className="rounded-2xl border border-border bg-card/80 p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">FanCam Safety-First Policy Framework • {LAST_UPDATED}</p>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/" className="text-foreground hover:underline">Back to App</Link>
            <Link to="/auth" className="text-foreground hover:underline">Sign In</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

