import Link from "next/link";
import { me } from "@/lib/access";
import { saveSettings } from "@/lib/actions";
import { stripeEnabled } from "@/lib/payments";
import TimezoneSelect from "@/components/TimezoneSelect";

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { user } = await me();
  const sp = await searchParams;
  return (
    <main className="container narrow">
      <div className="card">
        <h1>Settings</h1>
        {sp.error && <p className="error">{sp.error}</p>}
        {sp.saved && <p className="ok-text small">Saved.</p>}
        <form action={saveSettings} key={`${user.handle}${user.timezone}`}>
          <div className="field">
            <label htmlFor="handle">Your link</label>
            <div className="row" style={{ alignItems: "center", gap: 4 }}><span className="muted">/@</span><input id="handle" name="handle" defaultValue={user.handle} required maxLength={30} autoCapitalize="none" /></div>
            <p className="small muted" style={{ margin: "4px 0 0" }}>Changing it breaks links you&apos;ve already shared to the old one.</p>
          </div>
          <div className="field"><label htmlFor="timezone">Time zone (for stats days and scheduled links)</label><TimezoneSelect value={user.timezone} /></div>
          <button type="submit">Save</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Payments</h2>
        {stripeEnabled() ? (
          <p className="small" style={{ margin: 0 }}>Stripe Checkout is on. Payment confirmations arrive by webhook at <code>/api/stripe/webhook</code> (event <code>checkout.session.completed</code>).</p>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            <b>Test mode.</b> Set <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> on the server to take real payments through Stripe Checkout.
            Until then buyers see a clearly marked test checkout and no money moves. Card details never touch this app either way.
          </p>
        )}
        <p className="small" style={{ marginBottom: 0 }}><Link href="/outbox">Emails sent</Link></p>
      </div>
    </main>
  );
}
