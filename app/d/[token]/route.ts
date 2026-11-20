import { NextResponse } from "next/server";
import { db, type Product } from "@/lib/db";
import { readStored } from "@/lib/files";
import { orderByToken } from "@/lib/payments";
import { canDownload, downloadName, MAX_DOWNLOADS, sniff } from "@/lib/rules";

// The buyer's file. Counted (at most MAX_DOWNLOADS) before it's sent; always as an attachment.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const o = orderByToken(token);
  if (!o) return new NextResponse("Not found", { status: 404 });
  const check = canDownload(o);
  if (!check.ok) return NextResponse.redirect(new URL(`/order/${token}?blocked=1`, req.url), 303);
  // Atomic: two downloads at once can't both slip under the limit.
  const took = db.prepare("UPDATE orders SET downloads = downloads + 1 WHERE id = ? AND status = 'paid' AND downloads < ?").run(o.id, MAX_DOWNLOADS);
  if (!took.changes) return NextResponse.redirect(new URL(`/order/${token}?blocked=1`, req.url), 303);
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(o.product_id) as Product;
  const bytes = readStored(p.file_stored);
  if (!bytes) return new NextResponse("The file is missing. Please contact the seller.", { status: 410 });
  const name = downloadName(p.file_name, sniff(bytes)?.ext ?? "bin");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": p.file_type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
