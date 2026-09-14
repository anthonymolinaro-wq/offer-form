/**
 * Trusted-provider recommendations, sourced from a Google Sheet instead of
 * being hardcoded here -- so Anthony can add, remove, or reprice a provider
 * just by editing the sheet, with nothing to redeploy.
 *
 * The sheet needs one thing set up on Google's side: Share -> General access
 * -> "Anyone with the link" -> Viewer. That lets this Worker read it as a
 * plain CSV export with no Google API credentials involved. The sheet only
 * ever holds provider contact details (never anything about a buyer or an
 * offer), so link-level read access is a reasonable trade for not having to
 * run a Google service account.
 *
 * Expected columns (any order, matched by header name, case-insensitive):
 *   Type | Name | Email | Phone | Description
 * Type must be one of: Conveyancer, Finance Broker, Building & Pest
 * (case/spacing-insensitive -- see TYPE_ALIASES below).
 */

const TYPE_ALIASES = {
  conveyancer: 'conveyancer',
  conveyancers: 'conveyancer',
  solicitor: 'conveyancer',
  'finance broker': 'finance',
  'finance brokers': 'finance',
  finance: 'finance',
  broker: 'finance',
  'building & pest': 'buildingPest',
  'building and pest': 'buildingPest',
  'building & pest inspector': 'buildingPest',
  buildingpest: 'buildingPest',
  'building pest': 'buildingPest',
};

function normaliseType(raw) {
  const key = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return TYPE_ALIASES[key] || null;
}

/** Minimal RFC 4180 CSV parser -- handles quoted fields, embedded commas/newlines, and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function rowsToProviders(rows) {
  if (!rows.length) return { conveyancer: [], finance: [], buildingPest: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iType = col('type');
  const iName = col('name');
  const iEmail = col('email');
  const iPhone = col('phone');
  const iDesc = col('description');

  const out = { conveyancer: [], finance: [], buildingPest: [] };
  for (const r of rows.slice(1)) {
    const type = normaliseType(iType >= 0 ? r[iType] : '');
    const name = (iName >= 0 ? r[iName] : '').trim();
    if (!type || !name) continue;
    out[type].push({
      name,
      email: (iEmail >= 0 ? r[iEmail] : '').trim(),
      phone: (iPhone >= 0 ? r[iPhone] : '').trim(),
      detail: (iDesc >= 0 ? r[iDesc] : '').trim(),
    });
  }
  return out;
}

// Used only if the sheet isn't configured yet, or a fetch fails -- so a typo
// in the sheet ID or a Google outage never blocks an offer going through.
const FALLBACK_REFERRALS = {
  conveyancer: [
    {
      name: 'Victorian Statewide Conveyancing',
      phone: '03 8790 5488',
      email: 'info@victorianstatewide.com.au',
      website: 'https://victorianstatewide.com.au/',
      detail: "$1,600, or $1,700 if there's an owners corporation, with no hidden costs, no upfront fees, and no contract review fees.",
    },
    {
      name: 'First Class Legal',
      phone: '1300 956 321',
      email: 'info@firstclasslegal.com.au',
      website: 'https://www.firstclasslegal.com.au/',
      detail: '$1,500 plus GST and disbursements, taken out at settlement. The $330 standard contract review fee is deducted from the $1,500 if you go ahead with the property.',
    },
    {
      name: 'Zettle Conveyancing',
      website: 'https://www.zettle.com.au/contact',
      detail: '$1,500 plus disbursements for buyers, with unlimited contract reviews.',
    },
  ],
  finance: [
    { name: 'Anthony Mathews, Loan Market', phone: '0429 963 316', email: 'anthony.mathews@loanmarket.com.au' },
    { name: 'Rhys Chapman, Blue Rock', phone: '0412 983 671', email: 'rhys.chapman@thebluerock.com.au', website: 'https://www.bluerock.com.au/team/rhys-chapman/' },
    { name: 'Blank Finance', phone: '0499 888 666', website: 'https://blank.financial/contact/' },
  ],
  buildingPest: [
    { name: "Paul O'Toole, Home Buyers Protection Service", phone: '0411 325 949 or 9563 7732', email: 'paul@hbps.com.au', website: 'https://www.hbps.com.au/', detail: '$495 for an email report, $695 for a written report.' },
    { name: 'Altez Building Inspections', phone: '0499 899 890', email: 'admin@altezbuildinginspections.com.au', website: 'https://www.altezbuildinginspections.com.au/', detail: 'Contact them to confirm current fees.' },
    { name: 'Authority Building Inspections', phone: '1800 852 585', email: 'hello@authoritybuildinginspections.com.au', website: 'https://authoritybuildinginspections.com.au/contact-us/', detail: 'Single storey $495 plus GST, double storey $550 plus GST.' },
  ],
};

/**
 * Fetch and parse the referrals sheet. Never throws -- on any problem
 * (not configured, network error, sheet made private again, etc.) it falls
 * back to the list above, since a broken referrals feed must never stop an
 * offer being submitted or a notification email going out.
 */
export async function fetchReferrals(env) {
  if (!env.REFERRALS_SHEET_ID) return FALLBACK_REFERRALS;

  const gid = env.REFERRALS_SHEET_GID || '0';
  const url = `https://docs.google.com/spreadsheets/d/${env.REFERRALS_SHEET_ID}/export?format=csv&gid=${gid}`;

  try {
    const res = await fetch(url, {
      // Short edge cache: keeps repeat submissions fast without ever being far
      // out of date -- Anthony edits the sheet rarely, not mid-offer.
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!res.ok) return FALLBACK_REFERRALS;
    const text = await res.text();
    const parsed = rowsToProviders(parseCsv(text));
    const hasAny = parsed.conveyancer.length || parsed.finance.length || parsed.buildingPest.length;
    return hasAny ? parsed : FALLBACK_REFERRALS;
  } catch {
    return FALLBACK_REFERRALS;
  }
}
