import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db, type Product } from "@/lib/db";
import { orderByToken } from "@/lib/payments";
import { canDownload, DOWNLOAD_DAYS, MAX_DOWNLOADS } from "@/lib/rules";
import { money } from "@/lib/time";

export const metadata: Metadata = { title: "Your order", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ from?: string; cancelled?: string; blocked?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const o = orderByToken(token);
  if (!o) notFound();
  const p = db.prepare("SELECT p.title, p.file_name, u.handle, u.display_name, u.email FROM products p JOIN users u ON u.id = p.user_id WHERE p.id = ?").get(o.product_id) as Pick<Product, "title" | "file_name"> & { handle: string; display_name: string; email: string };
  const check = canDownload(o);
  const waiting = o.status === "pending" && !sp.cancelled;
  return (
    <main className="container narrow" style={{ paddingTop: 32 }}>
      {/* While Stripe's confirmation is on its way, look again every few seconds. */}
      {waiting && sp.from === "checkout" && <meta httpEquiv="refresh" content="4" />}
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>Order from <a href={`/@${p.handle}`}>{p.display_name || `@${p.handle}`}</a></p>
        <h1 style={{ marginTop: 0 }}>{p.title}</h1>
        <p>{money(o.amount_cents)}{o.test_mode ? <span className="pill-warn" style={{ marginLeft: 6 }}>test purchase</span> : null}</p>
        {sp.cancelled && o.status === "pending" && <p className="notice">Checkout was cancelled. Nothing was charged. <a href={`/@${p.handle}/p/${o.product_id}`}>Back to the product</a></p>}
        {waiting && <p className="notice">Waiting for the payment to be confirmed. This page updates by itself.</p>}
        {sp.blocked && !check.ok && <p className="error">{check.reason}</p>}
        {check.ok ? (
          <>
            <p className="ok-text">Paid. Thank you!</p>
            <a className="btn big-btn" href={`/d/${token}`}>Download {p.file_name}</a>
            <p className="small muted">
              {MAX_DOWNLOADS - o.downloads} of {MAX_DOWNLOADS} downloads left, until {new Date(o.paid_at! + DOWNLOAD_DAYS * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
              A copy of this link was emailed to {o.buyer_email}. Keep it private: anyone with it can download your file.
            </p>
          </>
        ) : !waiting && !sp.cancelled ? <p className="error">{check.reason}</p> : null}
        <p className="small muted" style={{ marginBottom: 0 }}>Questions about this order? Reply to the receipt email or contact the seller.</p>
      </div>
    </main>
  );
}
