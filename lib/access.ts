import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { db, plain, type Block, type Creator, type Product } from "./db";
import { today } from "./time";

export async function me(): Promise<{ user: Creator; today: string }> {
  const u = await requireUser();
  const user = plain<Creator>(db.prepare("SELECT * FROM users WHERE id = ?").get(u.id));
  return { user, today: today(user.timezone) };
}

export async function ownProduct(id: number) {
  const ctx = await me();
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND user_id = ?").get(id, ctx.user.id) as Product | undefined;
  if (!p) notFound();
  return { ...ctx, product: plain<Product>(p) };
}

export async function ownBlock(id: number) {
  const ctx = await me();
  const b = db.prepare("SELECT * FROM blocks WHERE id = ? AND user_id = ?").get(id, ctx.user.id) as Block | undefined;
  if (!b) notFound();
  return { ...ctx, block: plain<Block>(b) };
}

export function blocksOf(userId: number): Block[] {
  return (db.prepare("SELECT * FROM blocks WHERE user_id = ? ORDER BY position, id").all(userId) as Block[]).map((b) => plain<Block>(b));
}
export function productsOf(userId: number): Product[] {
  return (db.prepare("SELECT * FROM products WHERE user_id = ? ORDER BY id DESC").all(userId) as Product[]).map((p) => plain<Product>(p));
}
