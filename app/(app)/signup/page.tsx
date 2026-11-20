import Link from "next/link";
import { signup } from "@/lib/actions";
import TimezoneSelect from "@/components/TimezoneSelect";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="container narrow">
      <div className="card">
        <h1>Claim your link</h1>
        {error && <p className="error">{error}</p>}
        <form action={signup}>
          <div className="field">
            <label htmlFor="handle">Your link</label>
            <div className="row" style={{ alignItems: "center", gap: 4 }}><span className="muted">/@</span><input id="handle" name="handle" required minLength={3} maxLength={30} pattern="[a-z0-9_.]+" placeholder="alexmakes" autoCapitalize="none" /></div>
          </div>
          <div className="field"><label htmlFor="name">Display name</label><input id="name" name="name" maxLength={60} placeholder="Alex Rivera" /></div>
          <div className="field"><label htmlFor="timezone">Time zone</label><TimezoneSelect /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label htmlFor="password">Password (8+ characters)</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
          <button type="submit" className="big-btn">Create my page</button>
        </form>
        <p className="small muted">Already have one? <Link href="/login">Log in</Link></p>
      </div>
    </main>
  );
}
