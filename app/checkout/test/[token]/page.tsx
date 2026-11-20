import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { completeTestPurchase } from "@/lib/actions";
import { db, type Product } from "@/lib/db";
import { orderByToken, stripeEnabled } from "@/lib/payments";
import { money } from "@/lib/time";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Stands in for Stripe Checkout when no Stripe key is configured. It takes no payment details of any kind. */
export default async function TestCheckout({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (stripeEnabled()) redirect(`/order/${token}`);
  const o = orderByToken(token);
  if (!o) notFound();
  if (o.status !== "pending") redirect(`/order/${token}`);
  const p = db.prepare("SELECT p.title, u.handle FROM products p JOIN users u ON u.id = p.user_id WHERE p.id = ?").get(o.product_id) as Pick<Product, "title"> & { handle: string };
  return (
    <main className="container narrow" style={{ paddingTop: 32 }}>
      <div className="card" style={{ borderColor: "var(--warn)" }}>
        <p className="pill-warn" style={{ display: "inline-block" }}>TEST MODE: no payment is taken</p>
        <h1>Test checkout</h1>
        <p>{p.title}: <b>{money(o.amount_cents)}</b></p>
        <p className="small">
          This store hasn&apos;t connected Stripe yet, so this page stands in for the payment step. Completing it marks the
          order as a <b>test</b> purchase and sends the download link to {o.buyer_email}. Nothing is charged.
        </p>
        <form action={completeTestPurchase} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="token" value={token} />
          <button type="submit">Complete test purchase</button>
          <a className="btn secondary" href={`/@${p.handle}/p/${o.product_id}`}>Cancel</a>
        </form>
      </div>
    </main>
  );
}
