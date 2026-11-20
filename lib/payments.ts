import crypto from "node:crypto";
import { db, tx, plain, type Order, type Product } from "./db";
import { appUrl, sendEmail } from "./mail";
import { DOWNLOAD_DAYS, MAX_DOWNLOADS } from "./rules";
import { money } from "./time";

// Payments: Stripe Checkout when STRIPE_SECRET_KEY is set, otherwise a clearly labelled test mode where the
// seller (or tester) completes a fake purchase. Card details are never handled by this app either way.

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export const tokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const newToken = () => crypto.randomBytes(24).toString("base64url");

/** Creates a Stripe Checkout Session for an order (form-encoded API call; no SDK needed). Returns its URL. */
export async function stripeCheckout(o: { id: number; amount_cents: number; buyer_email: string }, product: Product, token: string): Promise<string> {
  const p = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(o.amount_cents),
    "line_items[0][price_data][product_data][name]": product.title.slice(0, 250),
    customer_email: o.buyer_email,
    client_reference_id: String(o.id),
    "metadata[order_id]": String(o.id),
    success_url: `${appUrl()}/order/${token}?from=checkout`,
    cancel_url: `${appUrl()}/order/${token}?cancelled=1`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !j.url) throw new Error(j.error?.message ?? `Stripe returned ${res.status}`);
  db.prepare("UPDATE orders SET payment_ref = ? WHERE id = ?").run(j.id ?? null, o.id);
  return j.url;
}

/**
 * Checks a Stripe-Signature header ("t=…,v1=…") against the raw body: HMAC-SHA256 of "t.body" with the
 * endpoint secret, compared in constant time, and the timestamp within 5 minutes to stop replays.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

/**
 * Marks an order paid (once) and emails the buyer their link and the seller a sale notice. The amount must
 * match what the order was created for; anything else is refused rather than delivered.
 */
export async function markPaid(orderId: number, paid: { amount_cents: number; ref: string | null; test: boolean }): Promise<"paid" | "already" | "mismatch" | "missing"> {
  // Only a hash of the buyer's checkout link is stored, so the email gets its own link to the same order.
  const emailToken = newToken();
  const result = tx(() => {
    const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Order | undefined;
    if (!o) return "missing" as const;
    if (o.status !== "pending") return "already" as const;
    if (paid.amount_cents !== o.amount_cents) return "mismatch" as const;
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, payment_ref = COALESCE(?, payment_ref), test_mode = ?, email_token_hash = ? WHERE id = ?").run(Date.now(), paid.ref, paid.test ? 1 : 0, tokenHash(emailToken), o.id);
    return "paid" as const;
  });
  if (result !== "paid") return result;
  const o = plain<Order>(db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId));
  const p = plain<Product>(db.prepare("SELECT * FROM products WHERE id = ?").get(o.product_id));
  const seller = db.prepare("SELECT id, email, display_name, handle FROM users WHERE id = ?").get(o.seller_id) as { id: number; email: string; display_name: string; handle: string };
  const by = seller.display_name || `@${seller.handle}`;
  await sendEmail({
    userId: o.seller_id, to: o.buyer_email, subject: `Your download: ${p.title}`, // filed under the seller, who can see their receipts
    replyTo: seller.email, // so "reply to this email" reaches the seller, not the platform
    body: `Thanks for buying "${p.title}" from ${by}${o.test_mode ? " (TEST purchase, no money was charged)" : ""}.\n\nDownload it here (up to ${MAX_DOWNLOADS} times in total, for ${DOWNLOAD_DAYS} days):\n${appUrl()}/order/${emailToken}\n\nAmount: ${money(o.amount_cents)}`,
  });
  await sendEmail({ userId: seller.id, to: seller.email, subject: `New sale: ${p.title} (${money(o.amount_cents)})`, body: `${o.buyer_email} bought "${p.title}" for ${money(o.amount_cents)}${o.test_mode ? " in TEST mode" : ""}.\n\n${appUrl()}/orders` });
  return "paid";
}

/** Finds an order by either of its private links. */
export function orderByToken(token: string): Order | null {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const h = tokenHash(token);
  const o = db.prepare("SELECT * FROM orders WHERE token_hash = ? OR email_token_hash = ?").get(h, h) as Order | undefined;
  return o ? plain<Order>(o) : null;
}
