import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { filesDir } from "./db";
import { sniff } from "./rules";

export const MAX_PRODUCT_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Stores an upload under a random name after checking its real type. */
export async function storeUpload(f: File, opts: { imageOnly: boolean; max: number }): Promise<{ stored: string; type: string; ext: string; size: number } | { error: string }> {
  if (f.size > opts.max) return { error: `That file is over ${Math.round(opts.max / 1024 / 1024)} MB` };
  const bytes = new Uint8Array(await f.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind || (opts.imageOnly && !kind.image)) return { error: opts.imageOnly ? "Images only: PNG, JPEG, GIF or WebP" : "Supported files: PDF, ZIP, EPUB, MP3, PNG, JPEG, GIF, WebP" };
  const stored = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(path.join(filesDir, stored), bytes);
  return { stored, type: kind.type, ext: kind.ext, size: bytes.length };
}

export const readStored = (stored: string) => (/^[a-f0-9]{32}$/.test(stored) ? fs.readFileSync(path.join(filesDir, stored)) : null);
export function removeStored(stored: string | null) {
  if (stored && /^[a-f0-9]{32}$/.test(stored)) fs.rmSync(path.join(filesDir, stored), { force: true });
}
