"""
Generates a standalone copy of view.html pre-loaded with sample offer data,
so the copy-to-clipboard page can be reviewed without a server. aa-fields.js
is inlined (not re-typed -- read straight from the real file) since file://
pages can't resolve absolute-path ES module imports.

    python scripts/make-view-preview.py
    -> writes view-preview.html
"""

import base64
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
VIEW_SRC = os.path.join(HERE, "..", "public", "view.html")
FIELDS_SRC = os.path.join(HERE, "..", "public", "aa-fields.js")
LOGO_SRC = os.path.join(HERE, "..", "public", "obre-logo.png")
OUT = os.path.join(HERE, "..", "view-preview.html")

SAMPLE_LISTING = {"address": "12 Sample Street, Blackburn VIC 3130"}

SAMPLE_OFFER = {
    "purchasers": [
        {
            "firstName": "John",
            "middleName": "Robert",
            "lastName": "Citizen",
            "email": "john.citizen@example.com",
            "mobile": "0412 345 678",
            "address": "8 Buyer Street, Box Hill VIC 3128",
        },
        {
            "firstName": "Jane",
            "middleName": "",
            "lastName": "Citizen",
            "email": "jane.citizen@example.com",
            "mobile": "0423 456 789",
            "address": "",
        },
    ],
    "offerPrice": 1220000,
    "depositType": "10%",
    "depositAmount": 122000,
    "settlementDays": "60",
    "settlementDate": "",
    "unconditional": False,
    "subjectToFinance": True,
    "financeLender": "CBA",
    "financeAmount": 976000,
    "financeApprovalDate": "2026-09-05",
    "financeRecommend": True,
    "subjectToBuildingPest": True,
    "buildingPestDate": "2026-08-28",
    "bpRecommend": False,
    "subjectToOther": False,
    "otherDetails": "",
    "conveyancerName": "",
    "conveyancerRecommend": True,
}

payload = json.dumps({"offer": SAMPLE_OFFER, "listing": SAMPLE_LISTING}, separators=(",", ":"))
b64url = base64.b64encode(payload.encode("utf-8")).decode("ascii").replace("+", "-").replace("/", "_").rstrip("=")

with open(FIELDS_SRC, encoding="utf-8") as f:
    fields_js = f.read().replace("export function", "function")

with open(VIEW_SRC, encoding="utf-8") as f:
    html = f.read()

with open(LOGO_SRC, "rb") as f:
    logo_data_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
html = html.replace('src="/obre-logo.png"', f'src="{logo_data_uri}"')

old_head = "<script type=\"module\">\nimport { buildAAPages, decodeOfferFromHash } from '/aa-fields.js';\n"
if old_head not in html:
    raise SystemExit("view.html's script header changed shape -- update this generator to match.")

new_head = f"<script>\nlocation.hash = 'o={b64url}';\n{fields_js}\n"
html = html.replace(old_head, new_head)
html = html.replace(
    "<title>Copy Offer Details</title>",
    "<title>Copy Offer Details — preview</title>",
)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {os.path.normpath(OUT)}")
