# 26 · Linkshelf: link-in-bio + mini store

**Live demo:** https://linkshelf-demo.vercel.app/demo (signs you in to a shared demo account that resets itself)

For creators who share one link in their bio. Linkshelf gives them a page at **/@handle** with all their links, and a small store for digital products: presets, guides, templates, music. Buyers pay through **Stripe Checkout** and get a private download link by email. The creator sees views, clicks, referrers and sales, without any visitor being tracked.

## Run

```bash
npm install
npm run dev      # http://localhost:3026
```

Sign up (pick a handle), add links and a product, then open `/@yourhandle` in a private window to see it as a visitor.

| Env var | Effect |
|---|---|
| `STRIPE_SECRET_KEY` | Real payments through Stripe Checkout. **Without it the store is in test mode**: buyers see a clearly labelled test checkout that takes no payment details, and the order is marked "test". |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe's `checkout.session.completed` webhook at `/api/stripe/webhook`. |
| `RESEND_API_KEY` + `EMAIL_FROM` | Send receipts and sale notices (otherwise kept on `/outbox`). |
| `APP_URL` | Base URL for links in emails and Stripe return URLs. |

## How it works

**The page:**
- Profile photo, name, bio and one of five themes.
- Links, headings and products, which can be reordered, hidden, or **scheduled** (show only between two dates, in the creator's time zone).
- Handles are 3–30 of `a-z 0-9 _ .`, with route words reserved. `/@Handle` resolves case-insensitively. `/@handle` is a rewrite to `/u/handle`, because a folder named `@x` is a parallel-route slot in Next.js.

**Link safety:**
- Only `https`/`http` (with a real host), `mailto:` and `tel:` are accepted. `javascript:`, `data:` and `file:` are refused.
- Bare domains get `https://`, and phone numbers are normalized.
- Every link goes through `/l/<id>`, which counts the click and redirects only to the URL stored on a **live** block. It's not an open redirect, and a scheduled link that isn't live yet sends visitors to the profile instead.

**Stats are counts only:**
- **Views:** a daily counter.
- **Clicks:** per link per day.
- **Referrers:** host only (`instagram.com`), with `www.`/`m.`/`l.` stripped and your own site ignored.

No IP addresses, cookies or visitor ids are stored. Bots and link previewers (Googlebot, facebookexternalhit, Slack, Discord…) and the creator viewing their own page aren't counted.

**Products:**
- The file type is checked from its **bytes**: PDF, ZIP, EPUB, MP3 or images, up to 25 MB. A renamed `.exe` is refused.
- Optional cover image.
- Fixed price (at least $1) or **pay-what-you-want** with a minimum, which can be $0 for free downloads.
- Product files are never served from the public `/media` route, which serves only profile photos and covers.
- A product with orders can't be deleted, only taken off sale, so buyers keep their downloads.

**Checkout and delivery:**
1. The buyer gives an email and the order is created with a random **private token**; only its hash is stored.
2. With Stripe, a Checkout Session is created through the API (form-encoded, no SDK) and the buyer pays on Stripe's page. Card details never touch this app.
3. **Webhook:**
   - The `Stripe-Signature` is checked against the raw body (HMAC-SHA256, constant-time comparison, 5-minute tolerance).
   - Each event id is handled once.
   - The amount and currency must match the order; a mismatch is refused, not delivered.
4. **Paid:**
   - The buyer gets an email with a **second private link** to the same order, so the webhook never needs the original token. Its Reply-To is the seller.
   - The seller gets a sale notice.
5. **Download** (`/d/<token>`): at most 5 downloads within 30 days, counted atomically before sending. Files are always sent as attachments with `nosniff` and a sandbox CSP, and the name comes from the bytes' real type.
6. **Refund** marks the order refunded and switches off the download (with Stripe, the money is returned from the dashboard).
7. **Revenue figures leave out test purchases.** Orders export to CSV with a formula-injection guard.

## Verified

- **Unit tests** (`tests/unit.mjs`, run with `npm test`, 10 checks):
  - handles; link safety (scripts, data, file and localhost refused); scheduling;
  - fixed and pay-what-you-want prices;
  - byte sniffing (PDF, PNG, EPUB vs ZIP, MP3; HTML and EXE refused) and safe download names;
  - download rules (pending, refunded, 30 days, 5 uses);
  - Stripe signatures (valid, any matching `v1`, wrong secret, tampered body, 10-minute-old timestamp, junk, missing);
  - referrer hosts and bot detection;
  - payment: amount mismatch refused, paid once, a second private link emailed, seller notified, test purchases labelled.
- **End to end in the browser:**
  - `login` was refused as a handle.
  - Profile photo upload and the Sunset theme work.
  - A `javascript:` link was refused; bare `youtube.com/@x` became https; a future-scheduled link was hidden from the public page.
  - A fake PDF (EXE bytes) was refused; the real PDF and its JPEG cover were accepted.
  - Visitor counting: page views with and without an Instagram referrer, plus a bot visit. Stats showed 3 views (the bot and the owner weren't counted), 3 clicks, and instagram.com as a referrer.
  - Click redirects go to the right targets; the scheduled link went to the profile and a heading returned 404.
  - The product file isn't reachable through `/media`.
  - Test checkout, then the order page; 5 downloads succeeded with the right headers and the 6th was blocked.
  - Simulated Stripe webhooks: a wrong secret got 400, a wrong amount left the order pending, the correct event marked it paid, and a replay was ignored.
  - A refund blocked the emailed link.
  - Revenue excludes the test sale.
  - A second creator can't take a used handle or see the first creator's products, orders or export.
  - Logged out, the pages redirect to login; the export returns 401; the webhook without a signature returns 400.
  - No overflow at phone width.
- `next build` passes.

**Not verified:**
- A live Stripe Checkout: there's no Stripe key on this machine. Session creation is untested; the webhook was tested with locally signed events.
- Real email delivery.

## Next steps toward a paid product

- Stripe Connect, so each creator is paid out directly (today all sales would land in one Stripe account).
- Automatic refunds through the Stripe API, and the `charge.refunded` webhook.
- Rate limiting on checkout, and abandoned-checkout cleanup.
- Custom domains, more themes, and embeds (YouTube, Spotify).
- Discount codes, bundles and email capture.
