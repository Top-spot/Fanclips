import { Link } from "react-router-dom";

const LAST_UPDATED = "May 1, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4">
        <header className="rounded-2xl border border-border bg-card/80 p-5 md:p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Safety</p>
          <h1 className="text-3xl font-black text-foreground mt-1">Community Guidelines</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="rounded-2xl border border-border bg-card/80 p-5 md:p-6 text-sm text-muted-foreground space-y-3 leading-6">
          <p>Safety comes first. Users are responsible for what they upload, comment, and share.</p>
          <p>Do not post illegal, hateful, harassing, violent, exploitative, or sexually abusive content.</p>
          <p>Do not impersonate people, spread scams, coordinate fraud, or attempt to manipulate engagement with bots or fake accounts.</p>
          <p>Respect privacy, intellectual property, and likeness rights. Do not upload content you do not have permission to use.</p>
          <p>Do not use rewards, gifting, or stars for coercion, abuse, extortion, or off-platform illicit transactions.</p>
          <p>FanCam may remove content, reduce distribution, disable rewards, suspend accounts, and escalate serious risks to authorities.</p>
          <p>Repeated or severe violations can result in permanent account restrictions and forfeiture of platform benefits.</p>
          <p>If someone is in immediate danger, contact local emergency services first.</p>
        </section>

        <footer className="rounded-2xl border border-border bg-card/80 p-5 flex gap-4 text-sm">
          <Link to="/about" className="text-foreground hover:underline">About Hub</Link>
          <Link to="/terms" className="text-foreground hover:underline">Terms</Link>
          <Link to="/privacy" className="text-foreground hover:underline">Privacy</Link>
          <Link to="/cookies" className="text-foreground hover:underline">Cookies</Link>
        </footer>
      </div>
    </div>
  );
}

