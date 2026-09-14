import { agentbox } from './agentbox.js';
import { subjectLine, offerHtml, offerText, buyerConfirmationHtml, recommendationEmails, sendEmail } from './email.js';
import { encodeOfferForView } from '../public/aa-fields.js';
 
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
 
/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */
 
const str = (v) => String(v ?? '').trim();
const money = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v));
 
function validate(raw) {
  const errors = [];
 
  const purchasers = (Array.isArray(raw.purchasers) ? raw.purchasers : [])
    .map((p) => ({
      firstName: str(p.firstName),
      middleName: str(p.middleName),
      lastName: str(p.lastName),
      email: str(p.email),
      mobile: str(p.mobile),
      address: str(p.address),
    }))
    .filter((p) => p.firstName || p.lastName || p.email);
 
  if (!purchasers.length) errors.push('At least one purchaser is required.');
  purchasers.forEach((p, i) => {
    const n = purchasers.length > 1 ? ` ${i + 1}` : '';
    if (!p.firstName || !p.lastName) errors.push(`Purchaser${n}: full legal name is required.`);
    if (!isEmail(p.email)) errors.push(`Purchaser${n}: a valid email is required.`);
    if (!p.mobile) errors.push(`Purchaser${n}: mobile is required.`);
  });
 
  const offerPrice = money(raw.offerPrice);
  if (!offerPrice) errors.push('Offer price is required.');
 
  const depositAmount = money(raw.depositAmount);
  if (!depositAmount) errors.push('Deposit amount is required.');
 
  const settlementDays = /^\d+$/.test(str(raw.settlementDays)) ? Number(raw.settlementDays) : null;
  const settlementDate = str(raw.settlementDate);
  if (!settlementDays && !settlementDate) errors.push('A settlement period or date is required.');
 
  const unconditional = Boolean(raw.unconditional);
  const subjectToFinance = !unconditional && Boolean(raw.subjectToFinance);
  const subjectToOther = !unconditional && Boolean(raw.subjectToOther);
 
  if (subjectToFinance && !money(raw.financeAmount)) {
    errors.push('Finance amount is required when the offer is subject to finance.');
  }
  if (subjectToOther && !str(raw.otherDetails)) {
    errors.push('Details are required for the "Other" condition.');
  }
 
  const offer = {
    listingId: str(raw.listingId),
    purchasers,
    offerPrice,
    depositType: str(raw.depositType) === '10%' ? '10%' : 'other',
    depositAmount,
    depositPercent: str(raw.depositPercent),
    settlementDays,
    settlementDate,
    unconditional,
    subjectToFinance,
    financeLender: str(raw.financeLender),
    financeAmount: money(raw.financeAmount),
    financeApprovalDate: str(raw.financeApprovalDate),
    financeRecommend: Boolean(raw.financeRecommend),
    subjectToBuildingPest: !unconditional && Boolean(raw.subjectToBuildingPest),
    buildingPestDate: str(raw.buildingPestDate),
    bpRecommend: Boolean(raw.bpRecommend),
    subjectToOther,
    otherDetails: str(raw.otherDetails),
    conveyancerName: str(raw.conveyancerName),
    conveyancerFirm: str(raw.conveyancerFirm),
    conveyancerEmail: str(raw.conveyancerEmail),
    conveyancerPhone: str(raw.conveyancerPhone),
    conveyancerAddress: str(raw.conveyancerAddress),
    conveyancerRecommend: Boolean(raw.conveyancerRecommend),
    specialConditions: str(raw.specialConditions),
    submittedAt: new Date().toISOString(),
  };
 
  return { ok: errors.length === 0, errors, offer };
}
 
/* ------------------------------------------------------------------ *
 * Agentbox write -- best effort, never blocks the notification
 * ------------------------------------------------------------------ */
 
function enquiryComment(offer, listing) {
  return offerText(offer, listing);
}
 
async function logToAgentbox(env, offer, listing) {
  if (!agentbox.configured(env)) {
    return { ok: false, error: 'Agentbox credentials not configured yet.' };
  }
  try {
    const lead = offer.purchasers[0];
    const { id: contactId } = await agentbox.findOrCreateContact(env, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      mobile: lead.mobile,
    });
    const { id: enquiryId } = await agentbox.logEnquiry(env, {
      contactId,
      listingId: offer.listingId,
      comment: enquiryComment(offer, listing),
    });
    return { ok: true, contactId, enquiryId };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
 
/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */
 
async function handleListing(env, url) {
  const id = url.searchParams.get('id');
 
  if (!agentbox.configured(env)) {
    // Lets the form be built and reviewed before API credentials arrive.
    return json({
      mock: true,
      listing: id
        ? {
            id,
            address: '12 Sample Street, Blackburn VIC 3130',
            suburb: 'Blackburn',
            type: 'House',
            priceGuide: '$1,150,000 - $1,250,000',
            status: 'Available',
            agentName: env.AGENT_NAME,
            agentEmail: env.NOTIFY_EMAIL,
          }
        : null,
    });
  }
 
  try {
    if (id) return json({ listing: await agentbox.getListing(env, id) });
    return json({ listings: await agentbox.listAvailable(env) });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
 
async function handleOffer(request, env, ctx) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ errors: ['Malformed submission.'] }, 400);
  }
 
  const { ok, errors, offer } = validate(raw);
  if (!ok) return json({ errors }, 422);
 
  // Resolve the property. A failure here must not stop the offer getting through.
  let listing = { id: offer.listingId, address: str(raw.listingAddress) };
  if (agentbox.configured(env) && offer.listingId) {
    try {
      listing = (await agentbox.getListing(env, offer.listingId)) || listing;
    } catch {
      /* keep the address the form posted */
    }
  }
 
  const crm = await logToAgentbox(env, offer, listing);
 
  // Raw copy first, so nothing is lost even if both emails fail.
  if (env.OFFERS) {
    ctx.waitUntil(
      env.OFFERS.put(`offer:${offer.submittedAt}:${offer.listingId}`, JSON.stringify({ offer, listing, crm }), {
        expirationTtl: 60 * 60 * 24 * 90,
      }).catch(() => {}),
    );
  }
 
  // The view link carries the offer inside the URL fragment (after #), which
  // browsers never send to a server -- so this needs no database, and none
  // of it ever touches Cloudflare's or anyone else's request logs.
  const viewUrl = `${env.PUBLIC_ORIGIN}/view.html#o=${encodeOfferForView(offer, listing)}`;
 
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL,
      replyTo: offer.purchasers[0].email,
      subject: subjectLine(offer, listing),
      html: offerHtml(offer, listing, { agentboxError: crm.ok ? null : crm.error, viewUrl }),
      text: offerText(offer, listing),
    });
  } catch (err) {
    return json({ errors: ['Could not submit your offer. Please call the agent directly.'], detail: err.message }, 502);
  }
 
  ctx.waitUntil(
    sendEmail(env, {
      to: offer.purchasers[0].email,
      replyTo: env.NOTIFY_EMAIL,
      subject: `Offer received — ${listing.address}`,
      html: buyerConfirmationHtml(offer, listing, env),
    }).catch(() => {}),
  );
 
  // One email per ticked "please send me recommendations" box -- ticking two
  // boxes sends two separate emails, not one combined one.
  for (const email of recommendationEmails(offer, env)) {
    ctx.waitUntil(
      sendEmail(env, {
        to: offer.purchasers[0].email,
        replyTo: env.NOTIFY_EMAIL,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }).catch(() => {}),
    );
  }
 
  return json({ ok: true, loggedToCrm: crm.ok });
}
 
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
 
    if (url.pathname === '/api/listing') return handleListing(env, url);
    if (url.pathname === '/api/offer') {
      if (request.method !== 'POST') return json({ errors: ['Method not allowed.'] }, 405);
      return handleOffer(request, env, ctx);
    }
 
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;
 
    // SPA fallback: a path like /12-sample-street-blackburn is a
    // property-address route, not a missing static file -- it has no file
    // extension, so serve the app shell and let the client parse the address
    // out of the URL. A genuinely missing asset (has an extension) still 404s.
    const lastSegment = url.pathname.split('/').pop() || '';
    if (!lastSegment.includes('.')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return assetResponse;
  },
};