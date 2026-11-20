import Link from "next/link";
import { me } from "@/lib/access";
import ProductForm from "@/components/ProductForm";

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await me();
  const { error } = await searchParams;
  return (
    <main className="container narrow">
      <p className="small"><Link href="/products">← Products</Link></p>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Add a product</h1>
        {error && <p className="error">{error}</p>}
        <ProductForm />
      </div>
    </main>
  );
}
