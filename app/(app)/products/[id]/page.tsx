import Link from "next/link";
import { ownProduct } from "@/lib/access";
import { deleteProduct } from "@/lib/actions";
import { db } from "@/lib/db";
import ProductForm from "@/components/ProductForm";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { user, product: p } = await ownProduct(Number((await params).id));
  const sp = await searchParams;
  const sold = (db.prepare("SELECT COUNT(*) AS n FROM orders WHERE product_id = ?").get(p.id) as { n: number }).n;
  return (
    <main className="container narrow">
      <p className="small"><Link href="/products">← Products</Link></p>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>{p.title}</h1>
          <a href={`/@${user.handle}/p/${p.id}`} target="_blank" rel="noopener" className="small">Product page ↗</a>
        </div>
        {sp.error && <p className="error">{sp.error}</p>}
        {sp.saved && <p className="ok-text small">Saved.</p>}
        {p.cover && <img src={`/media/${p.cover}`} alt="" style={{ maxWidth: 200, borderRadius: 8, margin: "8px 0" }} />}
        <ProductForm p={p} />
      </div>
      <form action={deleteProduct}>
        <input type="hidden" name="product_id" value={p.id} />
        <button type="submit" className="danger">{sold ? "Take off sale (has orders)" : "Delete product"}</button>
      </form>
    </main>
  );
}
