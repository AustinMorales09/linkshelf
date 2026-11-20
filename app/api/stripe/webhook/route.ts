import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { markPaid, verifyStripeSignature } from "@/lib/payments";

// Stripe calls this when a Checkout Session completes. The signature is checked against the raw body before
// anything is trusted, each event is handled once, and the amount and currency must match the order.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET ?? "")) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as { id: string; type: string; data: { object: { id: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { order_id?: string } } } };
  if (db.prepare("INSERT OR IGNORE INTO webhook_events (id, received_at) VALUES (?, ?)").run(event.id, Date.now()).changes === 0) return NextResponse.json({ received: true, duplicate: true });
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    const orderId = Number(s.metadata?.order_id);
    if (s.payment_status === "paid" && orderId && s.currency === "usd" && typeof s.amount_total === "number") {
      const r = await markPaid(orderId, { amount_cents: s.amount_total, ref: s.id, test: false });
      if (r === "mismatch") console.error(`[stripe] order ${orderId}: paid amount ${s.amount_total} doesn't match the order`);
    }
  }
  return NextResponse.json({ received: true });
}
