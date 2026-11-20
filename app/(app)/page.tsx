import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <main className="hero">
      <h1>One link for your bio. A small store behind it.</h1>
      <p>
        Put every link you share on one page at <b>/@yourname</b>, and sell your digital work there: presets, guides,
        templates, music. Buyers pay through Stripe Checkout and get a private download link by email. You see views,
        clicks and sales, without tracking anyone.
      </p>
      <Link href="/signup" className="btn">Claim your link</Link>
    </main>
  );
}
