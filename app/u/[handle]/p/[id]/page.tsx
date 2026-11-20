import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buy } from "@/lib/actions";
import { db, plain, THEMES, type Creator, type Product } from "@/lib/db";
import { stripeEnabled } from "@/lib/payments";
import { money } from "@/lib/time";

export const dynamic = "force-dynamic";

function load(handle: string, id: string) {
  const u = db.prepare("SELECT * FROM users WHERE handle = ?").get(handle.toLowerCase()) as Creator | undefined;
  const p = u && (db.prepare("SELECT * FROM products WHERE id = ? AND user_id = ? AND active = 1").get(Number(id), u.id) as Product | undefined);
  return u && p ? { u: plain<Creator>(u), p: plain<Product>(p) } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string; id: string }> }): Promise<Metadata> {
  const { handle, id } = await params;
  const r = load(handle, id);
  return r ? { title: `${r.p.title} by ${r.u.display_name || `@${r.u.handle}`}`, description: r.p.description.slice(0, 160), openGraph: { images: r.p.cover ? [`/media/${r.p.cover}`] : undefined } } : { title: "Not found" };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ handle: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { handle, id } = await params;
  const { error } = await searchParams;
  const r = load(handle, id);
  if (!r) notFound();
  const { u, p } = r;
  const theme = THEMES[u.theme] ?? THEMES.light;
  const test = !stripeEnabled();
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: "32px 16px" }}>
      <main style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ fontSize: 14 }}><a href={`/@${u.handle}`} style={{ color: "inherit" }}>← {u.display_name || `@${u.handle}`}</a></p>
        <div className="card" style={{ color: "var(--text)" }}>
          {p.cover && <img src={`/media/${p.cover}`} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />}
          <h1 style={{ marginTop: 0 }}>{p.title}</h1>
          {p.description && <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>}
          <p className="small muted">Digital download: {p.file_type === "application/pdf" ? "PDF" : p.file_type === "application/zip" ? "ZIP" : p.file_type === "application/epub+zip" ? "EPUB" : p.file_type === "audio/mpeg" ? "MP3" : "image"}, {(p.file_size / 1024 / 1024).toFixed(1)} MB. You get a private link by email right after paying.</p>
          {error && <p className="error">{error}</p>}
          <form action={buy}>
            <input type="hidden" name="product_id" value={p.id} />
            {p.pwyw ? (
              <div className="field">
                <label htmlFor="amount">Pay what you want ($){p.price_cents ? `, minimum ${money(p.price_cents)}` : ""}</label>
                <input id="amount" name="amount" inputMode="decimal" required defaultValue={(Math.max(p.price_cents, 500) / 100).toFixed(0)} />
              </div>
            ) : null}
            <div className="field"><label htmlFor="email">Your email (for the download link)</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <button type="submit" className="big-btn" style={{ width: "100%" }}>{p.pwyw ? "Continue" : `Buy for ${money(p.price_cents)}`}</button>
          </form>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {test ? "This store is in test mode: no real payment is taken." : "Payment is handled by Stripe. Card details never reach this site."}
          </p>
        </div>
      </main>
    </div>
  );
}
