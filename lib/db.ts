import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const dataDir = process.env.DATA_DIR ?? (process.env.VERCEL ? demoDataDir() : path.join(process.env.APP_DIR ?? process.cwd(), "data"));

// Vercel deployments are read-only: copy the bundled demo snapshot (seed/) to /tmp once per instance and work there.
// Changes last as long as the instance does, so the public demo resets itself.
function demoDataDir(): string {
  const dir = "/tmp/data";
  const seed = path.join(process.cwd(), "seed");
  if (!fs.existsSync(path.join(dir, "app.db")) && fs.existsSync(seed)) fs.cpSync(seed, dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export const filesDir = path.join(dataDir, "files");

function init(): DatabaseSync {
  fs.mkdirSync(filesDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "app.db"));
  db.exec(`
    PRAGMA busy_timeout = 5000; -- first, so parallel build workers wait instead of failing
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- AUTOINCREMENT throughout: orders, stats and links refer to ids that must never be reused.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,                       -- stored file name (an image, type checked from its bytes)
      avatar_type TEXT,
      theme TEXT NOT NULL DEFAULT 'light',
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);

    -- What's on the public page, in order. kind: link | header | product.
    -- show_from / show_until: optional dates (creator's time zone) for links that should appear only for a while.
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      show_from TEXT,
      show_until TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    -- Digital products. price_cents is the price, or the minimum when pay-what-you-want.
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      pwyw INTEGER NOT NULL DEFAULT 0,
      file_name TEXT NOT NULL,
      file_stored TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      cover TEXT,
      cover_type TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- An order. token_hash: hash of the buyer's private order link, which is also the download link.
    -- status: pending | paid | refunded.  Downloads are limited in number and time.
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      buyer_email TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      token_hash TEXT NOT NULL UNIQUE,
      email_token_hash TEXT UNIQUE,      -- a second link to the same order, sent by email once paid
      payment_ref TEXT,
      test_mode INTEGER NOT NULL DEFAULT 0,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      refunded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller_id);

    -- Stripe event ids already handled (webhooks can arrive more than once).
    CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);

    -- Counts only: no IP addresses, no visitor ids. referrers keep the host name only.
    CREATE TABLE IF NOT EXISTS views (user_id INTEGER NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day));
    CREATE TABLE IF NOT EXISTS clicks (block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (block_id, day));
    CREATE TABLE IF NOT EXISTS referrers (user_id INTEGER NOT NULL, day TEXT NOT NULL, host TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day, host));

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

const g = globalThis as unknown as { __db?: DatabaseSync };
export const db = g.__db ?? (g.__db = init());

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const plain = <T,>(r: unknown) => ({ ...(r as object) }) as T;

export type Creator = { id: number; email: string; handle: string; display_name: string; bio: string; avatar: string | null; avatar_type: string | null; theme: string; timezone: string; created_at: number };
export type Block = { id: number; user_id: number; kind: "link" | "header" | "product"; title: string; url: string; product_id: number | null; position: number; show_from: string | null; show_until: string | null; hidden: number; created_at: number };
export type Product = { id: number; user_id: number; title: string; description: string; price_cents: number; pwyw: number; file_name: string; file_stored: string; file_type: string; file_size: number; cover: string | null; cover_type: string | null; active: number; created_at: number };
export type Order = { id: number; seller_id: number; product_id: number; buyer_email: string; amount_cents: number; status: "pending" | "paid" | "refunded"; token_hash: string; email_token_hash: string | null; payment_ref: string | null; test_mode: number; downloads: number; created_at: number; paid_at: number | null; refunded_at: number | null };

export const THEMES: Record<string, { label: string; bg: string; text: string; card: string; cardText: string; accent: string }> = {
  light: { label: "Paper", bg: "#f6f6f4", text: "#1c1c1c", card: "#ffffff", cardText: "#1c1c1c", accent: "#e8590c" },
  dark: { label: "Night", bg: "#111318", text: "#f2f2f2", card: "#1d2029", cardText: "#f2f2f2", accent: "#8b9cff" },
  sunset: { label: "Sunset", bg: "#ffe8d6", text: "#4a2311", card: "#ff8a5b", cardText: "#ffffff", accent: "#c2410c" },
  forest: { label: "Forest", bg: "#e7efe6", text: "#1d3324", card: "#2f5d3a", cardText: "#ffffff", accent: "#2f5d3a" },
  mono: { label: "Mono", bg: "#ffffff", text: "#000000", card: "#000000", cardText: "#ffffff", accent: "#000000" },
};
