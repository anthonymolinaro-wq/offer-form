/**
 * Single source of truth for the Anywhere Auctions copy sheet: field order,
 * labels, and computed values. Used by both the notification email
 * (src/email.js, server-side) and the copy view (view.html, in-browser) so
 * the two can never drift out of sync.
 *
 * Only fields with a real value are included -- fields AA asks for that we
 * don't collect (deposit due date, signing on behalf of an entity, etc.) are
 * left out entirely rather than shown as placeholders.
 */

function currency(n) {
  return typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    : '';
}

function settlementValue(o) {
  if (o.settlementDate) return new Date(o.settlementDate).toLocaleDateString('en-AU');
  if (o.settlementDays) return `${o.settlementDays} days from acceptance (calculate exact date)`;
  return '';
}

export function buildAAPages(o) {
  const balance =
    typeof o.offerPrice === 'number' && typeof o.depositAmount === 'number' ? o.offerPrice - o.depositAmount : null;

  const page1Fields = [{ label: 'How many Signatories are in this Sale?', value: String(o.purchasers.length) }];
  o.purchasers.forEach((p, i) => {
    const prefix = o.purchasers.length > 1 ? `Purchaser ${i + 1} — ` : '';
    page1Fields.push(
      { label: `${prefix}First Name`, value: p.firstName || '' },
      { label: `${prefix}Middle Name`, value: p.middleName || '' },
      { label: `${prefix}Last Name`, value: p.lastName || '' },
      { label: `${prefix}Email Address`, value: p.email || '' },
      { label: `${prefix}Contact Number`, value: p.mobile || '' },
      { label: `${prefix}Address`, value: p.address || '' },
    );
  });

  const page2Fields = [
    { label: 'Sale price', value: currency(o.offerPrice) },
    { label: 'Deposit amount', value: currency(o.depositAmount) + (o.depositType === '10%' ? ' (10% deposit)' : '') },
    ...(balance !== null ? [{ label: 'Balance payable at settlement', value: `${currency(balance)} (calculated)` }] : []),
    { label: 'Settlement date', value: settlementValue(o) },
    { label: 'Add conditions?', value: o.unconditional ? 'No' : 'Yes' },
  ];
  if (o.subjectToFinance) {
    page2Fields.push({
      label: 'Subject to finance',
      value:
        `${o.financeLender || 'Lender not stated'} — ${currency(o.financeAmount)} — approval by ${o.financeApprovalDate || 'not stated'}` +
        (o.financeRecommend ? ' (buyer requested a recommendation)' : ''),
    });
  }
  if (o.subjectToBuildingPest) {
    page2Fields.push({
      label: 'Subject to building and pest inspection',
      value: `Inspection by ${o.buildingPestDate || 'not stated'}` + (o.bpRecommend ? ' (buyer requested a recommendation)' : ''),
    });
  }
  if (o.subjectToOther) {
    page2Fields.push({ label: 'Other', value: o.otherDetails || '' });
  }

  const hasConveyancer = !o.conveyancerRecommend && o.conveyancerName;
  const page3Fields = [];
  if (o.conveyancerRecommend) {
    page3Fields.push({ label: 'Does the buyer have a conveyancer?', value: 'No — requested a recommendation' });
  } else if (hasConveyancer) {
    page3Fields.push(
      { label: 'Does the buyer have a conveyancer?', value: 'Yes' },
      { label: 'Name', value: o.conveyancerName + (o.conveyancerFirm ? ` — ${o.conveyancerFirm}` : '') },
      { label: 'Email', value: o.conveyancerEmail || '' },
      { label: 'Phone', value: o.conveyancerPhone || '' },
      { label: 'Address', value: o.conveyancerAddress || '' },
    );
  }

  return [
    { title: 'New Offer', fields: page1Fields },
    { title: 'Confirm Contract Details', fields: page2Fields },
    { title: 'Conveyancer Details', fields: page3Fields },
  ]
    .map((page) => ({ ...page, fields: page.fields.filter((f) => f.value && String(f.value).trim()) }))
    .filter((page) => page.fields.length > 0);
}

/* ---------- stateless link encoding -----------
 * The offer travels inside the URL fragment (after #), which browsers never
 * send to any server -- so no database is needed to generate this link, and
 * the buyer's details in it never touch a server log anywhere. */

function toBase64Url(str) {
  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return typeof atob === 'function'
    ? decodeURIComponent(escape(atob(b64)))
    : Buffer.from(b64, 'base64').toString('utf-8');
}

export function encodeOfferForView(offer, listing) {
  return toBase64Url(JSON.stringify({ offer, listing }));
}

export function decodeOfferFromHash(hash) {
  try {
    const match = String(hash || '').match(/[#&]o=([^&]+)/);
    if (!match) return null;
    return JSON.parse(fromBase64Url(match[1]));
  } catch {
    return null;
  }
}
