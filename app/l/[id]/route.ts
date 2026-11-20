import { NextResponse } from "next/server";
import { db, type Block } from "@/lib/db";
import { isBot, isLive } from "@/lib/rules";
import { recordClick } from "@/lib/stats";
import { today } from "@/lib/time";

// Counts a click and sends the visitor on. Only to a link stored on a live block, so this can't be used as an open redirect.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = db.prepare("SELECT b.*, u.handle, u.timezone FROM blocks b JOIN users u ON u.id = b.user_id WHERE b.id = ?").get(Number((await params).id)) as (Block & { handle: string; timezone: string }) | undefined;
  if (!b || b.kind === "header") return new NextResponse("Not found", { status: 404 });
  const t = today(b.timezone);
  if (!isLive(b, t)) return NextResponse.redirect(new URL(`/@${b.handle}`, req.url), 302);
  if (!isBot(req.headers.get("user-agent") ?? "")) recordClick(b.id, t);
  const target = b.kind === "product" ? new URL(`/@${b.handle}/p/${b.product_id}`, req.url).toString() : b.url;
  return new NextResponse(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin" } });
}
