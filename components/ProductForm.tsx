import { saveProduct } from "@/lib/actions";
import type { Product } from "@/lib/db";

export default function ProductForm({ p }: { p?: Product }) {
  return (
    <form action={saveProduct} key={p ? JSON.stringify(p) : "new"}>
      {p && <input type="hidden" name="product_id" value={p.id} />}
      <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" defaultValue={p?.title} required maxLength={100} placeholder="Moody film presets (12-pack)" /></div>
      <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" rows={4} defaultValue={p?.description} maxLength={3000} placeholder="What's included, what it works with, how to install." /></div>
      <div className="grid-2">
        <div className="field"><label htmlFor="price">Price ($)</label><input id="price" name="price" inputMode="decimal" defaultValue={p ? (p.price_cents / 100).toFixed(2) : ""} required placeholder="15" /></div>
        <label className="choice-row" style={{ alignSelf: "end" }}><input type="checkbox" name="pwyw" defaultChecked={!!p?.pwyw} /> Pay what you want (price is the minimum, can be 0)</label>
      </div>
      <div className="field">
        <label htmlFor="file">{p ? `File buyers get (now: ${p.file_name}, ${(p.file_size / 1024 / 1024).toFixed(1)} MB). Choose one to replace it.` : "File buyers get (PDF, ZIP, EPUB, MP3 or image; up to 25 MB)"}</label>
        <input id="file" name="file" type="file" required={!p} />
      </div>
      <div className="field"><label htmlFor="cover">Cover image (optional)</label><input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></div>
      {p && <label className="choice-row"><input type="checkbox" name="active" defaultChecked={!!p.active} /> On sale</label>}
      <button type="submit">{p ? "Save" : "Add product"}</button>
    </form>
  );
}
