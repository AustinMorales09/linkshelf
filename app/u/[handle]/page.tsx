import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { blocksOf, productsOf } from "@/lib/access";
import { getUser } from "@/lib/auth";
import { db, plain, THEMES, type Creator } from "@/lib/db";
import { isBot, isLive } from "@/lib/rules";
import { recordView } from "@/lib/stats";
import { money, today } from "@/lib/time";

export const dynamic = "force-dynamic";

const creator = (handle: string) => {
  const u = db.prepare("SELECT * FROM users WHERE handle = ?").get(handle.toLowerCase()) as Creator | undefined;
  return u ? plain<Creator>(u) : null;
};

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const u = creator((await params).handle);
  if (!u) return { title: "Not found" };
  const name = u.display_name || `@${u.handle}`;
  return { title: `${name} (@${u.handle})`, description: u.bio || `Links from ${name}`, openGraph: { title: name, description: u.bio || undefined, images: u.avatar ? [`/media/${u.avatar}`] : undefined } };
}

export default async function PublicPage({ params }: { params: Promise<{ handle: string }> }) {
  const u = creator((await params).handle);
  if (!u) notFound();
  const t = today(u.timezone);
  const h = await headers();
  // Count real visits only: not bots or link previews, and not the creator looking at their own page.
  const viewer = await getUser();
  if (!isBot(h.get("user-agent") ?? "") && viewer?.id !== u.id) recordView(u.id, t, h.get("referer"), h.get("host"));
  const theme = THEMES[u.theme] ?? THEMES.light;
  const products = new Map(productsOf(u.id).map((p) => [p.id, p]));
  const blocks = blocksOf(u.id).filter((b) => isLive(b, t) && (b.kind !== "product" || products.get(b.product_id!)?.active));
  const name = u.display_name || `@${u.handle}`;
  const btn: React.CSSProperties = { display: "block", background: theme.card, color: theme.cardText, border: `2px solid ${theme.card === theme.bg ? theme.text : theme.card}`, borderRadius: 14, padding: "14px 16px", textAlign: "center", fontWeight: 600, textDecoration: "none", overflowWrap: "anywhere" };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, padding: "40px 16px" }}>
      <main style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        {u.avatar && <img src={`/media/${u.avatar}`} alt="" width={96} height={96} style={{ borderRadius: "50%", objectFit: "cover", border: `3px solid ${theme.card}` }} />}
        <h1 style={{ margin: "12px 0 4px", fontSize: 24 }}>{name}</h1>
        <div style={{ opacity: 0.7, fontSize: 14 }}>@{u.handle}</div>
        {u.bio && <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{u.bio}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          {blocks.map((b) => {
            if (b.kind === "header") return <h2 key={b.id} style={{ fontSize: 15, textTransform: "uppercase", letterSpacing: 1, opacity: 0.75, margin: "12px 0 0" }}>{b.title}</h2>;
            if (b.kind === "product") {
              const p = products.get(b.product_id!)!;
              return (
                <a key={b.id} href={`/l/${b.id}`} style={{ ...btn, display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}>
                  {p.cover && <img src={`/media/${p.cover}`} alt="" width={56} height={56} style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>{p.title}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{p.pwyw ? (p.price_cents ? `${money(p.price_cents)}+` : "Free+") : money(p.price_cents)}</span>
                </a>
              );
            }
            return <a key={b.id} href={`/l/${b.id}`} rel="noopener nofollow" style={btn}>{b.title}</a>;
          })}
          {!blocks.length && <p style={{ opacity: 0.6 }}>Nothing here yet.</p>}
        </div>
        <p style={{ marginTop: 40, fontSize: 12, opacity: 0.55 }}><a href="/" style={{ color: "inherit" }}>Made with Linkshelf</a></p>
      </main>
    </div>
  );
}
