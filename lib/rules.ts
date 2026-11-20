// Small pure rules shared by the editor, the public page and the tests.

export const RESERVED = new Set([
  "admin", "api", "app", "login", "logout", "signup", "settings", "dashboard", "page", "products", "orders", "stats", "checkout",
  "order", "help", "support", "about", "terms", "privacy", "u", "l", "d", "media", "static", "www", "mail", "root", "billing", "store",
]);

/** Handles: 3–30 of a-z, 0-9, "_" and ".", not starting or ending with "." and not reserved. Returns an error or null. */
export function handleError(h: string): string | null {
  if (!/^[a-z0-9_.]{3,30}$/.test(h)) return "Use 3–30 lowercase letters, numbers, “_” or “.”";
  if (h.startsWith(".") || h.endsWith(".") || h.includes("..")) return "A handle can't start or end with a dot, or have two in a row";
  if (RESERVED.has(h)) return "That handle is reserved";
  return null;
}

/**
 * Link targets visitors can be sent to: web pages, email and phone. Anything else (javascript:, data:, file:)
 * is refused, since the public page and the click counter would otherwise carry it to visitors.
 */
export function safeUrl(raw: string): string | null {
  const s = raw.trim();
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return safeUrl(`https://${s}`); // "example.com/x" → https
  try {
    const u = new URL(s);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".")) return u.toString();
    if (u.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decodeURIComponent(u.pathname))) return u.toString();
    if (u.protocol === "tel:" && /^\+?[\d\s().-]{5,20}$/.test(decodeURIComponent(u.pathname))) return `tel:${decodeURIComponent(u.pathname).replace(/[^\d+]/g, "")}`;
  } catch { /* not a URL */ }
  return null;
}

/** Whether a scheduled block is showing on `today` (dates are inclusive, in the creator's time zone). */
export const isLive = (b: { hidden: number; show_from: string | null; show_until: string | null }, today: string) =>
  !b.hidden && (!b.show_from || b.show_from <= today) && (!b.show_until || b.show_until >= today);

/** What a buyer pays: the price, or for pay-what-you-want their amount (never below the minimum). */
export function priceFor(p: { price_cents: number; pwyw: number }, offered: string | null): { cents: number } | { error: string } {
  if (!p.pwyw) return { cents: p.price_cents };
  const m = (offered ?? "").trim().replace(/^\$/, "").match(/^(\d{1,6})(\.\d{1,2})?$/);
  if (!m) return { error: "Enter an amount, e.g. 10 or 12.50" };
  const cents = Math.round(Number(m[0]) * 100);
  if (cents < p.price_cents) return { error: `The minimum is $${(p.price_cents / 100).toFixed(2)}` };
  if (cents > 100_000_00) return { error: "That's more than $100,000" };
  return { cents };
}

/** File type from the file's own bytes. Product files: PDF, ZIP (incl. EPUB), images, MP3. Images only for avatars and covers. */
export function sniff(b: Uint8Array): { type: string; ext: string; image: boolean } | null {
  const s = (a: number, z: number) => Buffer.from(b.subarray(a, z)).toString("latin1");
  if (s(0, 5) === "%PDF-") return { type: "application/pdf", ext: "pdf", image: false };
  if (b[0] === 0x89 && s(1, 4) === "PNG") return { type: "image/png", ext: "png", image: true };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg", image: true };
  if (s(0, 4) === "GIF8") return { type: "image/gif", ext: "gif", image: true };
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return { type: "image/webp", ext: "webp", image: true };
  if (s(0, 4) === "PK\x03\x04") return s(30, 38) === "mimetype" && s(38, 58) === "application/epub+zip" ? { type: "application/epub+zip", ext: "epub", image: false } : { type: "application/zip", ext: "zip", image: false };
  if (s(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { type: "audio/mpeg", ext: "mp3", image: false };
  return null;
}

/** A download name that's safe in a Content-Disposition header, with the extension the bytes say it has. */
export function downloadName(original: string, ext: string) {
  const base = (original.split(/[\\/]/).pop() ?? "").replace(/\.[^.]*$/, "").replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "download";
  return `${base}.${ext}`;
}

export const MAX_DOWNLOADS = 5;
export const DOWNLOAD_DAYS = 30;

/** Whether an order's link may download now, and if not, why. */
export function canDownload(o: { status: string; downloads: number; paid_at: number | null }, now = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (o.status === "refunded") return { ok: false, reason: "This order was refunded, so the download is no longer available." };
  if (o.status !== "paid" || !o.paid_at) return { ok: false, reason: "Payment hasn't been confirmed yet." };
  if (now > o.paid_at + DOWNLOAD_DAYS * 86400_000) return { ok: false, reason: `Download links last ${DOWNLOAD_DAYS} days. Contact the seller for a new one.` };
  if (o.downloads >= MAX_DOWNLOADS) return { ok: false, reason: `This link has been used ${MAX_DOWNLOADS} times. Contact the seller if you need it again.` };
  return { ok: true };
}

/** Bots and link previewers shouldn't count as page views. */
export const isBot = (ua: string) => !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|headless/i.test(ua);
