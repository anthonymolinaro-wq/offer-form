"""
Generates a single self-contained preview file from public/index.html.

The backend is stubbed in-page, so the result can be opened straight from disk
(no server, no credentials) purely to review the look and flow. Submissions do
nothing except log to the browser console.

    python scripts/make-standalone.py
"""

import base64
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "public", "index.html")
LOGO_SRC = os.path.join(HERE, "..", "public", "obre-logo.png")
OUT = os.path.join(HERE, "..", "offer-form-preview.html")

SAMPLE = {
    "id": "1234567",
    "address": "12 Sample Street, Blackburn VIC 3130",
    "suburb": "Blackburn",
    "type": "House",
    "priceGuide": "$1,150,000 - $1,250,000",
    "status": "Available",
    "agentName": "Anthony Molinaro",
    "agentEmail": "anthony.molinaro@obrienrealestate.com.au",
}

SHIM = """
<script>
/* PREVIEW ONLY -- stubs the backend so this file works with no server.
   Not part of the deployed site. */
(() => {
  const SAMPLE = %s;
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/api/listing')) {
      return { ok: true, json: async () => ({ listing: SAMPLE }) };
    }
    if (u.includes('/api/offer')) {
      console.log('Offer payload:', JSON.parse(opts.body || '{}'));
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, json: async () => ({ ok: true, loggedToCrm: false }) };
    }
    return { ok: false, json: async () => ({ errors: ['Unknown route'] }) };
  };
})();
</script>
""" % json.dumps(SAMPLE)

with open(SRC, encoding="utf-8") as f:
    html = f.read()

# The real site self-hosts the logo at a relative path, which only resolves
# once actually deployed -- swap in a data URI so it still renders here.
with open(LOGO_SRC, "rb") as f:
    logo_data_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
html = html.replace('src="/obre-logo.png"', f'src="{logo_data_uri}"')

marker = "<body>"
if marker not in html:
    raise SystemExit("Could not find <body> in index.html")

html = html.replace(marker, marker + SHIM, 1)
html = html.replace(
    "<title>Offer Submission Form</title>",
    "<title>Offer Submission Form — preview</title>",
    1,
)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {os.path.normpath(OUT)}")
