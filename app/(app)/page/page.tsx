import Link from "next/link";
import { blocksOf, me, productsOf } from "@/lib/access";
import { addBlock, blockCommand, saveProfile, updateBlock } from "@/lib/actions";
import { THEMES } from "@/lib/db";
import { isLive } from "@/lib/rules";
import { fmtDate, money } from "@/lib/time";

type SP = { error?: string; saved?: string; welcome?: string; edit?: string };

function Cmd({ id, cmd, label, danger }: { id: number; cmd: string; label: string; danger?: boolean }) {
  return (
    <form action={blockCommand} className="inline-form">
      <input type="hidden" name="block_id" value={id} />
      <input type="hidden" name="cmd" value={cmd} />
      <button type="submit" className={danger ? "danger" : "secondary"} style={{ padding: "2px 8px" }} aria-label={label} title={label}>{label === "Move up" ? "↑" : label === "Move down" ? "↓" : label}</button>
    </form>
  );
}

export default async function PageEditor({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, today } = await me();
  const sp = await searchParams;
  const blocks = blocksOf(user.id);
  const products = new Map(productsOf(user.id).map((p) => [p.id, p]));
  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>My page</h1>
        <a className="btn secondary" href={`/@${user.handle}`} target="_blank" rel="noopener">View /@{user.handle} ↗</a>
      </div>
      {sp.welcome && <p className="notice">Your page is live at <b>/@{user.handle}</b>. Add a photo and a line about yourself, then your links. Products you add show up here too.</p>}
      {sp.error && <p className="error">{sp.error}</p>}
      {sp.saved && <p className="ok-text small">Saved.</p>}

      <div className="grid-2">
        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Profile</h2>
            <form action={saveProfile} key={`${user.display_name}${user.bio}${user.theme}${user.avatar}`}>
              <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 8 }}>
                {user.avatar ? <img src={`/media/${user.avatar}`} alt="" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--code-bg)" }} />}
                <div className="field" style={{ margin: 0 }}><label htmlFor="avatar">Photo (PNG, JPEG, GIF, WebP; up to 5 MB)</label><input id="avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></div>
              </div>
              {user.avatar && <label className="choice-row"><input type="checkbox" name="remove_avatar" /> Remove photo</label>}
              <div className="field"><label htmlFor="display_name">Name</label><input id="display_name" name="display_name" defaultValue={user.display_name} maxLength={60} /></div>
              <div className="field"><label htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={2} defaultValue={user.bio} maxLength={300} placeholder="Photographer in Austin. Presets and guides below." /></div>
              <div className="field">
                <label htmlFor="theme">Look</label>
                <select id="theme" name="theme" defaultValue={user.theme}>{Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
              </div>
              <button type="submit">Save profile</button>
            </form>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Add</h2>
            <form action={addBlock}>
              <input type="hidden" name="kind" value="link" />
              <div className="field"><label htmlFor="url">Link</label><input id="url" name="url" required placeholder="https://youtube.com/@you, mailto:you@x.com" /></div>
              <div className="field"><label htmlFor="title">Button text</label><input id="title" name="title" maxLength={80} placeholder="My YouTube channel" /></div>
              <details style={{ marginBottom: 8 }}>
                <summary className="small">Show only for a while</summary>
                <div className="grid-2" style={{ marginTop: 6 }}>
                  <div className="field"><label htmlFor="show_from">From</label><input id="show_from" name="show_from" type="date" /></div>
                  <div className="field"><label htmlFor="show_until">Until</label><input id="show_until" name="show_until" type="date" /></div>
                </div>
              </details>
              <button type="submit">Add link</button>
            </form>
            <form action={addBlock} className="row" style={{ gap: 8, alignItems: "end", marginTop: 12, flexWrap: "wrap" }}>
              <input type="hidden" name="kind" value="header" />
              <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="h_title">Or a heading</label><input id="h_title" name="title" required maxLength={80} placeholder="Shop" /></div>
              <button type="submit" className="secondary">Add heading</button>
            </form>
            <p className="small muted" style={{ marginBottom: 0 }}>To sell something, <Link href="/products/new">add a product</Link>. It&apos;s placed on your page automatically.</p>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>On your page</h2>
          {!blocks.length && <p className="small muted">Nothing yet. Add your first link.</p>}
          {blocks.map((b, i) => {
            const p = b.product_id ? products.get(b.product_id) : null;
            const live = isLive(b, today);
            const editing = sp.edit === String(b.id);
            return (
              <div key={b.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", opacity: live ? 1 : 0.6 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <span className="pill-muted" style={{ marginRight: 6 }}>{b.kind === "product" ? "product" : b.kind}</span>
                    <b>{b.kind === "product" ? p?.title ?? "(deleted product)" : b.title}</b>
                    {b.kind === "link" && <div className="small muted">{b.url}</div>}
                    {p && <div className="small muted">{p.pwyw ? `pay what you want, from ${money(p.price_cents)}` : money(p.price_cents)}{p.active ? "" : " · off sale"}</div>}
                    {(b.show_from || b.show_until) && <div className="small">{b.show_from ? `from ${fmtDate(b.show_from)} ` : ""}{b.show_until ? `until ${fmtDate(b.show_until)}` : ""}{!live && !b.hidden ? " · not showing today" : ""}</div>}
                    {b.hidden ? <div className="small">hidden</div> : null}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {i > 0 && <Cmd id={b.id} cmd="up" label="Move up" />}
                    {i < blocks.length - 1 && <Cmd id={b.id} cmd="down" label="Move down" />}
                    <Cmd id={b.id} cmd="toggle" label={b.hidden ? "Show" : "Hide"} />
                    {b.kind !== "product" && <Link className="btn secondary" style={{ padding: "2px 8px" }} href={`/page?edit=${b.id}`}>Edit</Link>}
                    {b.kind !== "product" && <Cmd id={b.id} cmd="delete" label="Delete" danger />}
                  </div>
                </div>
                {editing && (
                  <form action={updateBlock} style={{ marginTop: 8 }}>
                    <input type="hidden" name="block_id" value={b.id} />
                    <div className="field"><label htmlFor={`t${b.id}`}>Text</label><input id={`t${b.id}`} name="title" defaultValue={b.title} maxLength={80} /></div>
                    {b.kind === "link" && <div className="field"><label htmlFor={`u${b.id}`}>Link</label><input id={`u${b.id}`} name="url" defaultValue={b.url} required /></div>}
                    <div className="grid-2">
                      <div className="field"><label htmlFor={`f${b.id}`}>Show from</label><input id={`f${b.id}`} name="show_from" type="date" defaultValue={b.show_from ?? ""} /></div>
                      <div className="field"><label htmlFor={`n${b.id}`}>Until</label><input id={`n${b.id}`} name="show_until" type="date" defaultValue={b.show_until ?? ""} /></div>
                    </div>
                    <button type="submit">Save</button> <Link href="/page" className="small">Cancel</Link>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
