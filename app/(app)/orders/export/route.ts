import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";

const cell = (v: string | number | null) => {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from running it as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const iso = (ms: number | null) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) : "");

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = db.prepare("SELECT o.*, p.title FROM orders o JOIN products p ON p.id = o.product_id WHERE o.seller_id = ? AND o.status != 'pending' ORDER BY o.id").all(user.id) as { id: number; title: string; buyer_email: string; amount_cents: number; status: string; test_mode: number; downloads: number; paid_at: number | null; refunded_at: number | null; payment_ref: string | null }[];
  const lines = [["Order", "Paid (UTC)", "Product", "Buyer email", "Amount", "Status", "Test", "Downloads", "Refunded (UTC)", "Payment reference"].join(",")];
  for (const o of rows) lines.push([o.id, iso(o.paid_at), o.title, o.buyer_email, (o.amount_cents / 100).toFixed(2), o.status, o.test_mode ? "yes" : "no", o.downloads, iso(o.refunded_at), o.payment_ref].map(cell).join(","));
  return new NextResponse(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="orders.csv"', "Cache-Control": "no-store" } });
}
