import Link from "next/link";
import { blocksOf, me, productsOf } from "@/lib/access";
import { db } from "@/lib/db";
import { summary } from "@/lib/stats";
import { money } from "@/lib/time";
import { addDays } from "@/lib/util";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { user, today } = await me();
  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30;
  const from = addDays(today, -(days - 1));
  const s = summary(user.id, from);
  const blocks = blocksOf(user.id);
  const products = new Map(productsOf(user.id).map((p) => [p.id, p]));
  const fromMs = Date.parse(from + "T00:00:00Z") - 14 * 3600_000; // generous: the start of that day anywhere
  const sales = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN test_mode = 0 THEN amount_cents ELSE 0 END), 0) AS c, COALESCE(SUM(test_mode), 0) AS t FROM orders WHERE seller_id = ? AND status = 'paid' AND paid_at >= ?").get(user.id, fromMs) as { n: number; c: number; t: number };
  const series = Array.from({ length: days }, (_, i) => addDays(from, i)).map((d) => ({ d, n: s.views.find((v) => v.day === d)?.n ?? 0 }));
  const peak = Math.max(1, ...series.map((x) => x.n));
  const linkRows = blocks.filter((b) => b.kind !== "header").map((b) => ({ b, n: s.clicks.get(b.id) ?? 0 })).sort((a, b) => b.n - a.n);

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Stats</h1>
        <div className="filters" style={{ margin: 0 }}>
          {[7, 30, 90].map((d) => <Link key={d} href={`/dashboard?days=${d}`} className={days === d ? "on" : ""}>{d} days</Link>)}
        </div>
      </div>
      <p className="small muted">Your page: <a href={`/@${user.handle}`} target="_blank" rel="noopener">/@{user.handle}</a>. Counts only: no visitor is identified or tracked.</p>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[
          ["Views", s.totalViews.toLocaleString()],
          ["Clicks", s.totalClicks.toLocaleString()],
          ["Click rate", s.totalViews ? `${Math.round((s.totalClicks / s.totalViews) * 100)}%` : "–"],
          ["Sales", `${sales.n}${sales.t ? ` (${sales.t} test)` : ""}`],
          [sales.t ? "Revenue (test sales left out)" : "Revenue", money(Number(sales.c))],
        ].map(([k, v]) => (
          <div className="card" key={k} style={{ margin: 0 }}><div className="small muted">{k}</div><div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Views per day</h2>
        <div role="img" aria-label={`Views per day over the last ${days} days, peak ${peak}`} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
          {series.map((x) => <div key={x.d} title={`${x.d}: ${x.n}`} style={{ flex: 1, height: `${Math.max(2, (x.n / peak) * 100)}%`, background: x.n ? "var(--accent)" : "var(--border)", borderRadius: 2 }} />)}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Clicks by link</h2>
          <table className="list">
            <tbody>
              {linkRows.map(({ b, n }) => (
                <tr key={b.id}>
                  <td style={{ overflowWrap: "anywhere" }}>{b.kind === "product" ? `🛍 ${products.get(b.product_id!)?.title ?? "product"}` : b.title}</td>
                  <td style={{ textAlign: "right" }}>{n}</td>
                  <td className="small muted" style={{ textAlign: "right" }}>{s.totalViews ? `${Math.round((n / s.totalViews) * 100)}%` : ""}</td>
                </tr>
              ))}
              {!linkRows.length && <tr><td className="muted">No links yet. <Link href="/page">Add some</Link>.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Where visitors came from</h2>
          {s.referrers.length ? (
            <table className="list"><tbody>{s.referrers.map((r) => <tr key={r.host}><td>{r.host}</td><td style={{ textAlign: "right" }}>{r.n}</td></tr>)}</tbody></table>
          ) : <p className="small muted">No referring sites yet (direct visits and apps that hide the referrer don&apos;t show here).</p>}
        </div>
      </div>
    </main>
  );
}
