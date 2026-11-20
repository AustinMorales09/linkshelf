import Link from "next/link";
import { me, productsOf } from "@/lib/access";
import { db } from "@/lib/db";
import { money } from "@/lib/time";

export default async function Products({ searchParams }: { searchParams: Promise<{ deleted?: string; archived?: string }> }) {
  const { user } = await me();
  const sp = await searchParams;
  const products = productsOf(user.id);
  const sales = new Map((db.prepare("SELECT product_id AS id, COUNT(*) AS n, SUM(CASE WHEN test_mode = 0 THEN amount_cents ELSE 0 END) AS c FROM orders WHERE seller_id = ? AND status = 'paid' GROUP BY product_id").all(user.id) as { id: number; n: number; c: number }[]).map((r) => [r.id, r]));
  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Products</h1>
        <Link className="btn" href="/products/new">Add a product</Link>
      </div>
      {sp.deleted && <p className="notice">Deleted.</p>}
      {sp.archived && <p className="notice">Taken off sale and off your page. It had orders, so buyers can still download it.</p>}
      {!process.env.STRIPE_SECRET_KEY && <p className="small muted">Payments are in <b>test mode</b> (no STRIPE_SECRET_KEY on this server): buyers see a test checkout and no money moves.</p>}
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Product</th><th>Price</th><th>Sold</th><th>Revenue (real)</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/products/${p.id}`}><b>{p.title}</b></Link><div className="small muted">{p.file_name}{p.active ? "" : " · off sale"}</div></td>
                <td>{p.pwyw ? `from ${money(p.price_cents)}` : money(p.price_cents)}</td>
                <td>{sales.get(p.id)?.n ?? 0}</td>
                <td>{money(Number(sales.get(p.id)?.c ?? 0))}</td>
              </tr>
            ))}
            {!products.length && <tr><td colSpan={4} className="muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
