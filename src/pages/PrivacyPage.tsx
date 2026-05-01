import { Link } from "react-router-dom";

const LAST_UPDATED = "May 1, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <header className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Legal</p>
          <h1 className="text-3xl font-black text-foreground mt-1">Privacy Notice</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6 text-sm text-muted-foreground space-y-3 leading-6">
          <p>FanCam processes personal data needed to provide account access, feed personalization, rewards, notifications, and platform security.</p>
          <p>Data may include account identifiers, profile details, uploaded content, interaction history, reward transactions, and operational logs.</p>
          <p>We process data for contract performance, legitimate interests, legal obligations, consent-based features, and trust-and-safety enforcement.</p>
          <p>We use technical controls to protect data and retain records only as long as necessary for legal, security, and operational needs.</p>
          <p>You may request access, correction, deletion, or other rights as required by your region (including GDPR and applicable US state laws).</p>
          <p>Identity verification may be required before we process sensitive requests such as account-level deletions or exports.</p>
          <p>Where required, users may submit objections or complaint requests through configured support and supervisory/legal channels.</p>
        </section>

        <footer className="rounded-2xl border border-border bg-card/80 p-5 flex gap-4 text-sm">
          <Link to="/about" className="text-foreground hover:underline">About Hub</Link>
          <Link to="/terms" className="text-foreground hover:underline">Terms</Link>
          <Link to="/community-guidelines" className="text-foreground hover:underline">Guidelines</Link>
          <Link to="/cookies" className="text-foreground hover:underline">Cookies</Link>
        </footer>
      </div>
    </div>
  );
}

