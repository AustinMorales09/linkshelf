// Unit tests for 26-link-in-bio.
import assert from "node:assert/strict";
import crypto from "node:crypto";
const { db } = await import("./lib/db.ts");
const R = await import("./lib/rules.ts");
const P = await import("./lib/payments.ts");
const St = await import("./lib/stats.ts");

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log("✓", name); };

await ok("handles: format, dots, reserved words", () => {
  assert.equal(R.handleError("alex.makes"), null);
  assert.equal(R.handleError("al"), "Use 3–30 lowercase letters, numbers, “_” or “.”");
  assert.equal(R.handleError("Alex"), "Use 3–30 lowercase letters, numbers, “_” or “.”");
  assert.match(R.handleError(".alex"), /dot/);
  assert.match(R.handleError("a..b"), /dot/);
  assert.equal(R.handleError("login"), "That handle is reserved");
});

await ok("link targets: web, email and phone only; bare domains get https; scripts and data refused", () => {
  assert.equal(R.safeUrl("example.com/shop"), "https://example.com/shop");
  assert.equal(R.safeUrl("https://www.youtube.com/@alex"), "https://www.youtube.com/@alex");
  assert.equal(R.safeUrl("mailto:hi@alex.co"), "mailto:hi@alex.co");
  assert.equal(R.safeUrl("tel:+1 (555) 010-0100"), "tel:+15550100100");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>x</script>", "file:///etc/passwd", "http://localhost", "ftp://x.com", "mailto:nope", ""]) assert.equal(R.safeUrl(bad), null, bad);
});

await ok("scheduled links show only between their dates (inclusive); hidden never shows", () => {
  const b = (from, until, hidden = 0) => ({ show_from: from, show_until: until, hidden });
  assert.equal(R.isLive(b(null, null), "2026-11-14"), true);
  assert.equal(R.isLive(b("2026-11-14", "2026-11-20"), "2026-11-14"), true);
  assert.equal(R.isLive(b("2026-11-15", null), "2026-11-14"), false);
  assert.equal(R.isLive(b(null, "2026-11-13"), "2026-11-14"), false);
  assert.equal(R.isLive(b(null, null, 1), "2026-11-14"), false);
});

await ok("prices: fixed, or pay-what-you-want with a minimum", () => {
  assert.deepEqual(R.priceFor({ price_cents: 900, pwyw: 0 }, "1"), { cents: 900 });
  assert.deepEqual(R.priceFor({ price_cents: 500, pwyw: 1 }, "$12.50"), { cents: 1250 });
  assert.deepEqual(R.priceFor({ price_cents: 500, pwyw: 1 }, "4.99"), { error: "The minimum is $5.00" });
  assert.deepEqual(R.priceFor({ price_cents: 0, pwyw: 1 }, "0"), { cents: 0 });
  assert.match(R.priceFor({ price_cents: 500, pwyw: 1 }, "-5").error, /Enter an amount/);
  assert.match(R.priceFor({ price_cents: 500, pwyw: 1 }, "1e9").error, /Enter an amount/);
});

await ok("file types come from the bytes, not the name; images-only where it matters", () => {
  const b = (s) => new Uint8Array(Buffer.from(s, "latin1"));
  assert.equal(R.sniff(b("%PDF-1.7 ...")).type, "application/pdf");
  assert.equal(R.sniff(b("\x89PNG\r\n\x1a\n")).image, true);
  const epub = Buffer.alloc(80); epub.write("PK\x03\x04", 0, "latin1"); epub.write("mimetype", 30, "latin1"); epub.write("application/epub+zip", 38, "latin1");
  assert.equal(R.sniff(new Uint8Array(epub)).ext, "epub");
  assert.equal(R.sniff(b("PK\x03\x04 plain zip")).ext, "zip");
  assert.equal(R.sniff(b("ID3 mp3")).type, "audio/mpeg");
  assert.equal(R.sniff(b("<html><script>alert(1)</script>")), null);
  assert.equal(R.sniff(b("MZ\x90\x00 exe")), null);
  assert.equal(R.downloadName('My "Guide"; v2.exe', "pdf"), "My Guide v2.pdf");
  assert.equal(R.downloadName("../../x", "zip"), "x.zip");
});

await ok("downloads: only paid, not refunded, within 30 days, at most 5 times", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const paid = { status: "paid", downloads: 0, paid_at: now - 86400_000 };
  assert.deepEqual(R.canDownload(paid, now), { ok: true });
  assert.match(R.canDownload({ ...paid, status: "pending", paid_at: null }, now).reason, /hasn't been confirmed/);
  assert.match(R.canDownload({ ...paid, status: "refunded" }, now).reason, /refunded/);
  assert.match(R.canDownload({ ...paid, downloads: 5 }, now).reason, /used 5 times/);
  assert.match(R.canDownload({ ...paid, paid_at: now - 31 * 86400_000 }, now).reason, /last 30 days/);
});

await ok("Stripe webhook signatures: valid passes; wrong secret, tampered body, old timestamp, junk fail", () => {
  const secret = "whsec_test_123";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = Date.parse("2026-11-14T12:00:00Z");
  const t = Math.floor(now / 1000);
  const sig = (s, ts = t, b = body) => `t=${ts},v1=${crypto.createHmac("sha256", s).update(`${ts}.${b}`).digest("hex")}`;
  assert.equal(P.verifyStripeSignature(body, sig(secret), secret, now), true);
  assert.equal(P.verifyStripeSignature(body, `t=${t},v1=deadbeef,` + sig(secret).split(",")[1], secret, now), true); // any v1 may match
  assert.equal(P.verifyStripeSignature(body, sig("whsec_other"), secret, now), false);
  assert.equal(P.verifyStripeSignature(body.replace("evt_1", "evt_2"), sig(secret), secret, now), false);
  assert.equal(P.verifyStripeSignature(body, sig(secret, t - 600), secret, now), false);
  assert.equal(P.verifyStripeSignature(body, "garbage", secret, now), false);
  assert.equal(P.verifyStripeSignature(body, null, secret, now), false);
  assert.equal(P.verifyStripeSignature(body, sig(secret), "", now), false);
});

await ok("referrers keep only the host, drop www/m., and ignore your own site", () => {
  assert.equal(St.referrerHost("https://www.instagram.com/p/abc?igsh=1", "localhost:3026"), "instagram.com");
  assert.equal(St.referrerHost("https://l.facebook.com/l.php?u=x", null), "facebook.com");
  assert.equal(St.referrerHost("http://localhost:3026/dashboard", "localhost:3026"), null);
  assert.equal(St.referrerHost("not a url", null), null);
  assert.equal(R.isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(R.isBot("facebookexternalhit/1.1"), true);
  assert.equal(R.isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1"), false);
});

// ---------- orders against a temp database ----------
const now = Date.now();
db.prepare("INSERT INTO users (id, email, password_hash, handle, display_name, created_at) VALUES (1, 'alex@x.co', 'x', 'alex', 'Alex', ?)").run(now);
db.prepare("INSERT INTO products (id, user_id, title, price_cents, file_name, file_stored, file_type, file_size, created_at) VALUES (1, 1, 'Lightroom presets', 1500, 'presets.zip', 'aa', 'application/zip', 10, ?)").run(now);
const order = (tok) => Number(db.prepare("INSERT INTO orders (seller_id, product_id, buyer_email, amount_cents, token_hash, created_at) VALUES (1, 1, 'buyer@y.co', 1500, ?, ?)").run(P.tokenHash(tok), now).lastInsertRowid);

await ok("payment: amount must match, paid once, buyer gets a second private link by email, seller notified", async () => {
  const tok = P.newToken();
  const id = order(tok);
  assert.equal(await P.markPaid(id, { amount_cents: 100, ref: "cs_1", test: false }), "mismatch");
  assert.equal(P.orderByToken(tok).status, "pending");
  assert.equal(await P.markPaid(id, { amount_cents: 1500, ref: "cs_1", test: false }), "paid");
  assert.equal(await P.markPaid(id, { amount_cents: 1500, ref: "cs_1", test: false }), "already");
  const mails = db.prepare("SELECT recipient, subject, body FROM emails ORDER BY id").all();
  assert.deepEqual(mails.map((m) => `${m.recipient}: ${m.subject}`), ["buyer@y.co: Your download: Lightroom presets", "alex@x.co: New sale: Lightroom presets ($15.00)"]);
  const emailed = mails[0].body.match(/\/order\/([A-Za-z0-9_-]+)/)[1];
  assert.notEqual(emailed, tok);
  assert.equal(P.orderByToken(emailed).id, id);
  assert.equal(P.orderByToken(tok).id, id);
  assert.equal(P.orderByToken("short"), null);
  assert.equal(P.orderByToken("x".repeat(30)), null);
  assert.match(mails[0].body, /up to 5 times in total, for 30 days/);
  assert.ok(!/TEST/.test(mails[0].body));
});

await ok("test-mode purchases are labelled as such in both emails", async () => {
  const id = order(P.newToken());
  await P.markPaid(id, { amount_cents: 1500, ref: null, test: true });
  const [buyer, seller] = db.prepare("SELECT body FROM emails ORDER BY id DESC LIMIT 2").all().reverse();
  assert.match(buyer.body, /TEST purchase, no money was charged/);
  assert.match(seller.body, /in TEST mode/);
});

console.log(`\n${n} checks passed`);
