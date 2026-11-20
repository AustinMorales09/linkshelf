"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "./auth";
import { blocksOf, me, ownBlock, ownProduct } from "./access";
import { db, plain, THEMES, tx, type Order, type Product } from "./db";
import { MAX_IMAGE_BYTES, MAX_PRODUCT_BYTES, removeStored, storeUpload } from "./files";
import { validEmail } from "./mail";
import { markPaid, newToken, orderByToken, stripeCheckout, stripeEnabled, tokenHash } from "./payments";
import { handleError, priceFor, safeUrl } from "./rules";
import { isDate } from "./time";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const q = (m: string) => encodeURIComponent(m);
const stamp = () => Date.now().toString(36);
const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return !!tz;
  } catch {
    return false;
  }
};
const file = (f: FormData, k: string) => {
  const v = f.get(k);
  return v instanceof File && v.size > 0 ? v : null;
};

// ---------- account ----------

export async function signup(form: FormData) {
  const fail = (m: string): never => redirect(`/signup?error=${q(m)}`);
  const handle = str(form, "handle").toLowerCase().replace(/^@/, "");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const hErr = handleError(handle);
  if (hErr) fail(hErr);
  if (!validEmail(email)) fail("Enter a valid email");
  if (password.length < 8) fail("Password must be at least 8 characters");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) fail("That email already has an account");
  if (db.prepare("SELECT 1 FROM users WHERE handle = ?").get(handle)) fail(`@${handle} is taken`);
  const tz = validTz(str(form, "timezone")) ? str(form, "timezone") : "America/New_York";
  const id = Number(db.prepare("INSERT INTO users (email, password_hash, handle, display_name, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(email, hashPassword(password), handle, str(form, "name").slice(0, 60), tz, Date.now()).lastInsertRowid);
  await createSession(id);
  redirect("/page?welcome=1");
}

export async function login(form: FormData) {
  const user = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(str(form, "email").toLowerCase()) as { id: number; password_hash: string } | undefined;
  if (!user || !verifyPassword(str(form, "password"), user.password_hash)) redirect(`/login?error=${q("Wrong email or password")}`);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function saveSettings(form: FormData) {
  const { user } = await me();
  const handle = str(form, "handle").toLowerCase().replace(/^@/, "");
  const tz = str(form, "timezone");
  const err = handleError(handle) ?? (!validTz(tz) ? "Choose a valid time zone" : null) ?? (handle !== user.handle && db.prepare("SELECT 1 FROM users WHERE handle = ?").get(handle) ? `@${handle} is taken` : null);
  if (err) redirect(`/settings?error=${q(err)}`);
  db.prepare("UPDATE users SET handle = ?, timezone = ? WHERE id = ?").run(handle, tz, user.id);
  redirect(`/settings?saved=${stamp()}`);
}

// ---------- the page ----------

export async function saveProfile(form: FormData) {
  const { user } = await me();
  const theme = THEMES[str(form, "theme")] ? str(form, "theme") : "light";
  let avatar = user.avatar, avatarType = user.avatar_type;
  const up = file(form, "avatar");
  if (up) {
    const r = await storeUpload(up, { imageOnly: true, max: MAX_IMAGE_BYTES });
    if ("error" in r) redirect(`/page?error=${q(`Photo: ${r.error}`)}`);
    removeStored(user.avatar);
    avatar = r.stored; avatarType = r.type;
  } else if (form.get("remove_avatar")) {
    removeStored(user.avatar);
    avatar = null; avatarType = null;
  }
  db.prepare("UPDATE users SET display_name = ?, bio = ?, theme = ?, avatar = ?, avatar_type = ? WHERE id = ?").run(str(form, "display_name").slice(0, 60), str(form, "bio").slice(0, 300), theme, avatar, avatarType, user.id);
  redirect(`/page?saved=${stamp()}`);
}

const nextPosition = (userId: number) => ((db.prepare("SELECT MAX(position) AS m FROM blocks WHERE user_id = ?").get(userId) as { m: number | null }).m ?? 0) + 1;

function blockFields(form: FormData): { title: string; url: string; from: string | null; until: string | null } | { error: string } {
  const title = str(form, "title").slice(0, 80);
  const from = str(form, "show_from") || null;
  const until = str(form, "show_until") || null;
  if ((from && !isDate(from)) || (until && !isDate(until)) || (from && until && until < from)) return { error: "Check the show-from and until dates" };
  if (str(form, "kind") === "header") return title ? { title, url: "", from, until } : { error: "Enter the heading text" };
  const url = safeUrl(str(form, "url"));
  if (!url) return { error: "Links must be a web address (https://…), an email (mailto:…) or a phone number (tel:…)" };
  return { title: title || url.replace(/^(https?:\/\/|mailto:|tel:)/, "").replace(/\/$/, "").slice(0, 80), url, from, until };
}

export async function addBlock(form: FormData) {
  const { user } = await me();
  const f = blockFields(form);
  if ("error" in f) redirect(`/page?error=${q(f.error)}`);
  const kind = str(form, "kind") === "header" ? "header" : "link";
  db.prepare("INSERT INTO blocks (user_id, kind, title, url, position, show_from, show_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(user.id, kind, f.title, f.url, nextPosition(user.id), f.from, f.until, Date.now());
  redirect(`/page?added=${stamp()}`);
}

export async function updateBlock(form: FormData) {
  const { block } = await ownBlock(Number(form.get("block_id")));
  form.set("kind", block.kind);
  if (block.kind === "product") {
    db.prepare("UPDATE blocks SET show_from = ?, show_until = ? WHERE id = ?").run(str(form, "show_from") || null, str(form, "show_until") || null, block.id);
    redirect(`/page?saved=${stamp()}`);
  }
  const f = blockFields(form);
  if ("error" in f) redirect(`/page?error=${q(f.error)}&edit=${block.id}`);
  db.prepare("UPDATE blocks SET title = ?, url = ?, show_from = ?, show_until = ? WHERE id = ?").run(f.title, f.url, f.from, f.until, block.id);
  redirect(`/page?saved=${stamp()}`);
}

export async function blockCommand(form: FormData) {
  const { block, user } = await ownBlock(Number(form.get("block_id")));
  const cmd = str(form, "cmd");
  if (cmd === "toggle") db.prepare("UPDATE blocks SET hidden = 1 - hidden WHERE id = ?").run(block.id);
  else if (cmd === "delete") db.prepare("DELETE FROM blocks WHERE id = ?").run(block.id);
  else if (cmd === "up" || cmd === "down") {
    // Renumber in order, then swap with the neighbour.
    tx(() => {
      const list = blocksOf(user.id);
      const i = list.findIndex((b) => b.id === block.id);
      const j = cmd === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
      list.forEach((b, k) => db.prepare("UPDATE blocks SET position = ? WHERE id = ?").run(k + 1, b.id));
    });
  }
  redirect(`/page?t=${stamp()}`);
}

// ---------- products ----------

function parseDollars(s: string): number | null {
  const m = s.trim().replace(/^\$/, "").match(/^(\d{1,6})(\.\d{1,2})?$/);
  return m ? Math.round(Number(m[0]) * 100) : null;
}

export async function saveProduct(form: FormData) {
  const id = Number(form.get("product_id")) || null;
  const owned = id ? await ownProduct(id) : null;
  const { user } = owned ?? (await me());
  const existing: Product | null = owned?.product ?? null;
  const back = id ? `/products/${id}` : "/products/new";
  const fail = (m: string): never => redirect(`${back}?error=${q(m)}`);
  const title = str(form, "title").slice(0, 100);
  const pwyw = form.get("pwyw") ? 1 : 0;
  const price = parseDollars(str(form, "price"));
  if (!title) fail("Give it a title");
  if (price === null) fail("Enter a price, e.g. 15 or 9.99");
  if (!pwyw && price! < 100) fail("The price must be at least $1.00 (or turn on pay-what-you-want)");
  if (price! > 10_000_00) fail("The price can't be more than $10,000");

  let fileInfo = existing ? { stored: existing.file_stored, type: existing.file_type, size: existing.file_size, name: existing.file_name } : null;
  const up = file(form, "file");
  if (up) {
    const r = await storeUpload(up, { imageOnly: false, max: MAX_PRODUCT_BYTES });
    if ("error" in r) fail(`File: ${r.error}`);
    const ok = r as { stored: string; type: string; size: number };
    fileInfo = { stored: ok.stored, type: ok.type, size: ok.size, name: up.name.slice(0, 120) };
  }
  if (!fileInfo) fail("Attach the file buyers will download");
  let cover = existing?.cover ?? null, coverType = existing?.cover_type ?? null;
  const cv = file(form, "cover");
  if (cv) {
    const r = await storeUpload(cv, { imageOnly: true, max: MAX_IMAGE_BYTES });
    if ("error" in r) fail(`Cover: ${r.error}`);
    const ok = r as { stored: string; type: string };
    if (existing?.cover) removeStored(existing.cover);
    cover = ok.stored; coverType = ok.type;
  }
  const vals = [title, str(form, "description").slice(0, 3000), price!, pwyw, fileInfo!.name, fileInfo!.stored, fileInfo!.type, fileInfo!.size, cover, coverType, form.get("active") || !id ? 1 : 0];
  let productId = id;
  if (id) {
    // The old file stays on disk if paid orders might still download it; only an unsold file is removed.
    if (up && existing && existing.file_stored !== fileInfo!.stored && !db.prepare("SELECT 1 FROM orders WHERE product_id = ? AND status = 'paid'").get(id)) removeStored(existing.file_stored);
    db.prepare("UPDATE products SET title = ?, description = ?, price_cents = ?, pwyw = ?, file_name = ?, file_stored = ?, file_type = ?, file_size = ?, cover = ?, cover_type = ?, active = ? WHERE id = ?").run(...vals, id);
  } else {
    productId = tx(() => {
      const pid = Number(db.prepare("INSERT INTO products (title, description, price_cents, pwyw, file_name, file_stored, file_type, file_size, cover, cover_type, active, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...vals, user.id, Date.now()).lastInsertRowid);
      db.prepare("INSERT INTO blocks (user_id, kind, product_id, position, created_at) VALUES (?, 'product', ?, ?, ?)").run(user.id, pid, nextPosition(user.id), Date.now());
      return pid;
    });
  }
  redirect(`/products/${productId}?saved=${stamp()}`);
}

/** Deletes a product nobody has bought; one with sales is only taken off sale, so buyers can still download it. */
export async function deleteProduct(form: FormData) {
  const { product } = await ownProduct(Number(form.get("product_id")));
  if (db.prepare("SELECT 1 FROM orders WHERE product_id = ?").get(product.id)) {
    db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(product.id);
    db.prepare("DELETE FROM blocks WHERE product_id = ?").run(product.id);
    redirect(`/products?archived=${stamp()}`);
  }
  db.prepare("DELETE FROM products WHERE id = ?").run(product.id);
  removeStored(product.file_stored);
  removeStored(product.cover);
  redirect(`/products?deleted=${stamp()}`);
}

/** Records a refund and switches off the download link. With Stripe, the money is returned from the Stripe dashboard. */
export async function refundOrder(form: FormData) {
  const { user } = await me();
  db.prepare("UPDATE orders SET status = 'refunded', refunded_at = ? WHERE id = ? AND seller_id = ? AND status = 'paid'").run(Date.now(), Number(form.get("order_id")), user.id);
  redirect(`/orders?refunded=${stamp()}`);
}

// ---------- buying (public) ----------

export async function buy(form: FormData) {
  const p = db.prepare("SELECT p.*, u.handle FROM products p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.active = 1").get(Number(form.get("product_id"))) as (Product & { handle: string }) | undefined;
  if (!p) redirect("/");
  const back = `/@${p.handle}/p/${p.id}`;
  const email = str(form, "email").toLowerCase();
  if (!validEmail(email)) redirect(`${back}?error=${q("Enter your email so we can send the download link")}`);
  const price = priceFor(p, str(form, "amount"));
  if ("error" in price) redirect(`${back}?error=${q(price.error)}`);
  const token = newToken();
  const orderId = Number(db.prepare("INSERT INTO orders (seller_id, product_id, buyer_email, amount_cents, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(p.user_id, p.id, email, price.cents, tokenHash(token), Date.now()).lastInsertRowid);
  // Free (pay-what-you-want at $0): nothing to charge.
  if (price.cents === 0) {
    await markPaid(orderId, { amount_cents: 0, ref: "free", test: false });
    redirect(`/order/${token}?from=checkout`);
  }
  if (!stripeEnabled()) redirect(`/checkout/test/${token}`);
  let url: string;
  try {
    url = await stripeCheckout({ id: orderId, amount_cents: price.cents, buyer_email: email }, plain<Product>(p), token);
  } catch (err) {
    redirect(`${back}?error=${q(`Checkout isn't available right now (${err instanceof Error ? err.message : "error"}). Please try again.`)}`);
  }
  redirect(url);
}

/** Test mode only: completes a purchase without any payment. Refused whenever real payments are configured. */
export async function completeTestPurchase(form: FormData) {
  const token = str(form, "token");
  if (stripeEnabled()) redirect(`/order/${token}`);
  const o: Order | null = orderByToken(token);
  if (!o) redirect("/");
  await markPaid(o.id, { amount_cents: o.amount_cents, ref: "test", test: true });
  redirect(`/order/${token}?from=checkout`);
}
