import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readStored } from "@/lib/files";

// Public images only: profile photos and product covers. Product files are never served from here.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  const row = (db.prepare("SELECT avatar_type AS type FROM users WHERE avatar = ?").get(name) ?? db.prepare("SELECT cover_type AS type FROM products WHERE cover = ?").get(name)) as { type: string } | undefined;
  const bytes = row && readStored(name);
  if (!row || !bytes || !row.type.startsWith("image/")) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": row.type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
