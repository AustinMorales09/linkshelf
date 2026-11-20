import { me } from "@/lib/access";
import { refundOrder } from "@/lib/actions";
import { db } from "@/lib/db";
import { MAX_DOWNLOADS } from "@/lib/rules";
import { fmtStamp, money } from "@/lib/time";

type Row = { id: number; buyer_email: string; amount_cents: number; status: string; test_mode: number; downloads: number; created_at: number; paid_at: number | null; title: string };

export default async function Orders({ searchParams }: { searchParams: Promise<{ refunded?: string }> }) {
  const { user } = await me();
  const sp = await searchParams;
  const rows = (db.prepare("SELECT o.*, p.title FROM orders o JOIN products p ON p.id = o.product_id WHERE o.seller_id = ? AND o.status != 'pending' ORDER BY o.id DESC LIMIT 200").all(user.id) as Row[]).map((r) => ({ ...r }));
  const pending = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'pending'").get(user.id) as { n: number }).n;
  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Orders</h1>
        <a className="btn secondary" href="/orders/export">Export CSV</a>
      </div>
      {sp.refunded && <p className="notice">Marked refunded and the download link is switched off.{process.env.STRIPE_SECRET_KEY ? " Return the money from your Stripe dashboard." : ""}</p>}
      {pending > 0 && <p className="small muted">{pending} checkout{pending === 1 ? "" : "s"} started but not paid (not shown).</p>}
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>When</th><th>Product</th><th>Buyer</th><th>Amount</th><th>Downloads</th><th></th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="small">{fmtStamp(o.paid_at ?? o.created_at, user.timezone)}</td>
                <td>{o.title}</td>
                <td className="small" style={{ overflowWrap: "anywhere" }}>{o.buyer_email}</td>
                <td>{money(o.amount_cents)}{o.test_mode ? <span className="pill-warn" style={{ marginLeft: 4 }}>test</span> : null}</td>
                <td className="small">{o.downloads}/{MAX_DOWNLOADS}</td>
                <td>
                  {o.status === "refunded" ? <span className="pill-muted">refunded</span> : (
                    <form action={refundOrder}><input type="hidden" name="order_id" value={o.id} /><button type="submit" className="secondary" style={{ padding: "2px 8px" }}>Refund</button></form>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
