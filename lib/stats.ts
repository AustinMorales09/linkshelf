import { db } from "./db";

// Aggregate counters only. A visit adds 1 to today's count; the referrer keeps just its host name, and
// visits from the creator's own site or from this app don't count as referrers.

export function recordView(userId: number, day: string, referrer: string | null, selfHost: string | null) {
  db.prepare("INSERT INTO views (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1").run(userId, day);
  const host = referrerHost(referrer, selfHost);
  if (host) db.prepare("INSERT INTO referrers (user_id, day, host, n) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, day, host) DO UPDATE SET n = n + 1").run(userId, day, host);
}

export function recordClick(blockId: number, day: string) {
  db.prepare("INSERT INTO clicks (block_id, day, n) VALUES (?, ?, 1) ON CONFLICT (block_id, day) DO UPDATE SET n = n + 1").run(blockId, day);
}

/** "https://www.instagram.com/p/x?y" → "instagram.com". Same-site and malformed referrers → null. */
export function referrerHost(referrer: string | null, selfHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname.toLowerCase().replace(/^(www|m|l|lm)\./, "");
    if (!h || (selfHost && h === selfHost.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, ""))) return null;
    return h.slice(0, 80);
  } catch {
    return null;
  }
}

export function summary(userId: number, from: string) {
  const views = db.prepare("SELECT day, n FROM views WHERE user_id = ? AND day >= ? ORDER BY day").all(userId, from) as { day: string; n: number }[];
  const clicks = db.prepare("SELECT c.block_id AS id, SUM(c.n) AS n FROM clicks c JOIN blocks b ON b.id = c.block_id WHERE b.user_id = ? AND c.day >= ? GROUP BY c.block_id").all(userId, from) as { id: number; n: number }[];
  const refs = db.prepare("SELECT host, SUM(n) AS n FROM referrers WHERE user_id = ? AND day >= ? GROUP BY host ORDER BY n DESC LIMIT 8").all(userId, from) as { host: string; n: number }[];
  return {
    views: views.map((v) => ({ ...v })),
    totalViews: views.reduce((t, v) => t + v.n, 0),
    clicks: new Map(clicks.map((c) => [c.id, Number(c.n)])),
    totalClicks: clicks.reduce((t, c) => t + Number(c.n), 0),
    referrers: refs.map((r) => ({ host: r.host, n: Number(r.n) })),
  };
}
