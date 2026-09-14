# Offer form

Buyer-facing offer form for `offers.anthonymolinaro.com.au`.

**Flow:** buyer opens a link carrying an Agentbox listing ID → form auto-populates the
property and page title → on submit the offer is logged in Agentbox against that listing,
a uniform summary lands in Anthony's inbox (with a link to a one-click copy page for
transcribing into Anywhere Auctions), and the buyer gets a confirmation.

No spreadsheet, no PDF. Agentbox is the system of record; the notification email is the backup.

## Preview it now (no credentials, no Node)

```bash
python offer-form/scripts/preview.py
```

Then open <http://localhost:8788/?id=1234567> (with a property) or <http://localhost:8788/>
(property picker). Submissions print to the console — nothing is sent or logged.

`offer-form-preview.html` in this folder is the same thing as a single file you can
double-click, for showing someone the design without running anything.

## Files

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole buyer-facing form — markup, styling, behaviour |
| `public/view.html` | One-click copy page linked from the notification email (Anywhere Auctions order, Copy button per field) |
| `public/aa-fields.js` | Single source of truth for AA field order/labels/values — used by both the notification email and `view.html` |
| `src/index.js` | Worker: routes, validation, orchestration |
| `src/agentbox.js` | Every Agentbox API call and response shape, isolated here |
| `src/email.js` | Notification + buyer confirmation templates, subject line |
| `scripts/preview.py` | Local preview server with mocked API |
| `scripts/make-standalone.py` | Regenerates `offer-form-preview.html` |
| `scripts/render-email-preview.mjs` | Regenerates `email-preview.html` (static HTML, no script execution needed to view it) |
| `scripts/make-view-preview.py` | Regenerates `view-preview.html` |
| `scripts/smoke-test.mjs` | Quick regression check for `aa-fields.js` (`node scripts/smoke-test.mjs`) |

## Credentials

Never paste these into chat or commit them.

1. Copy `.dev.vars.example` to `.dev.vars` and fill it in. That file is gitignored.
2. **Agentbox** — via the [Integrator Application](https://www.agentbox.com.au/integrator-application).
   Requesting: read access to listings via the REST API, plus write access to contacts and
   enquiries. REAXML does **not** meet the requirement (one-way outbound feed, no on-demand
   retrieval, no write-back).
3. **Resend** — <https://resend.com>, API Keys → Create, "Sending access" only.
   Verify `anthonymolinaro.com.au` under Domains and add the DNS records it gives you,
   so mail sends as `offers@anthonymolinaro.com.au` with no third-party branding.

## Deploy

```bash
cd offer-form && npm install
```

Push each secret into Cloudflare's encrypted store (prompts for the value, never echoes it):

```bash
npx wrangler secret put AGENTBOX_CLIENT_ID
```

```bash
npx wrangler secret put AGENTBOX_API_KEY
```

```bash
npx wrangler secret put RESEND_API_KEY
```

```bash
npx wrangler deploy
```

Then point `offers` at the Worker in Cloudflare DNS.

## Once Agentbox credentials arrive

`src/agentbox.js` is written against Agentbox's documented conventions but the exact
response field names are **unverified**. Everything else in the codebase reads the
normalised shape from `toListing()`, so adjusting that one file is the whole job.

Until credentials exist, `/api/listing` returns sample data so the form still runs.

## Sending from Agentbox

Put the link in your offer email template with the listing ID as a merge field:

```
https://offers.anthonymolinaro.com.au/?id={{listing.id}}
```

If your template doesn't expose a usable listing ID, the bare URL still works — it falls
back to a picker of current on-market listings. Worth knowing anyway: buyers forward these
links to co-purchasers, who often land on the URL with the query string stripped.
