/**
 * Email rendering + sending (Resend).
 *
 * Every offer renders through the same table, so two offers on the same
 * property can be read side by side without hunting for the numbers.
 */

import { buildAAPages } from '../public/aa-fields.js';

// OBrien brand palette (2026 rebrand). FOREST is the only colour used for
// text/links -- it's the one that reads cleanly on both white and Linen (see
// the contrast check in the project notes). MOSS/SKY are decorative only
// (borders, tints) and never carry text, since neither passes AA contrast
// for body-sized text on a white or Linen background.
const FOREST = '#032d23';
const LINEN = '#f1eee9';
const MOSS = '#8c9362';
const FONT_STACK = "'Saans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const currency = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    : '—';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** "John Citizen & Jane Citizen" -> "Citizen" ; two surnames -> "Citizen & Smith" */
function surnames(purchasers) {
  const unique = [...new Set(purchasers.map((p) => p.lastName?.trim()).filter(Boolean))];
  return unique.join(' & ') || 'Buyer';
}

function conditionsSummary(o) {
  if (o.unconditional) return 'Unconditional';
  const parts = [];
  if (o.subjectToFinance) parts.push('Finance');
  if (o.subjectToBuildingPest) parts.push('Building & pest');
  if (o.subjectToOther) parts.push('Other');
  return parts.length ? `Subject to ${parts.join(', ').toLowerCase()}` : 'Unconditional';
}

function settlementSummary(o) {
  if (o.settlementDays) return `${o.settlementDays} days`;
  if (o.settlementDate) return new Date(o.settlementDate).toLocaleDateString('en-AU');
  return '—';
}

export function subjectLine(o, listing) {
  return [
    'OFFER',
    listing.address || 'Property',
    currency(o.offerPrice),
    surnames(o.purchasers),
    settlementSummary(o),
    conditionsSummary(o),
  ].join(' — ');
}

// One category = one email. topic phrases the sentence naturally
// ("a conveyancer" / "a finance broker" / "a building & pest inspector").
// Provider lists themselves come from the referrals sheet (src/referrals.js),
// not from here.
const RECOMMENDATION_CATEGORIES = {
  conveyancer: { subject: 'Conveyancing recommendations', topic: 'a conveyancer', label: 'Conveyancer' },
  finance: { subject: 'Finance recommendations', topic: 'a finance broker', label: 'Finance broker' },
  buildingPest: { subject: 'Building & pest recommendations', topic: 'a building & pest inspector', label: 'Building & pest inspector' },
};

const RECOMMENDATION_INTRO =
  "These aren't just names off a list. They're people we've worked with many times, would happily " +
  'recommend to our own family, and would use ourselves without hesitation.';

const RECOMMENDATION_DISCLOSURE =
  'Please note this is provided as a guide only and should not be relied upon. Fees and details can ' +
  "change, so it's worth doing your own due diligence and confirming current pricing directly with " +
  'whichever provider you choose.';

function providerRow(p) {
  const contactBits = [];
  if (p.phone) contactBits.push(esc(p.phone));
  if (p.email) contactBits.push(`<a href="mailto:${esc(p.email)}" style="color:${FOREST};">${esc(p.email)}</a>`);
  if (p.website) contactBits.push(`<a href="${esc(p.website)}" style="color:${FOREST};">${esc(p.website)}</a>`);
  return `<div style="margin-bottom:16px;">
    <div style="font-weight:600;color:${FOREST};font-size:15px;">${esc(p.name)}</div>
    ${contactBits.length ? `<div style="font-size:13.5px;color:#6b7280;margin-top:2px;">${contactBits.join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${p.detail ? `<div style="font-size:13.5px;color:#6b7280;margin-top:2px;">${esc(p.detail)}</div>` : ''}
  </div>`;
}

function requestedCategoryKeys(o) {
  const keys = [];
  if (o.conveyancerRecommend) keys.push('conveyancer');
  if (o.subjectToFinance && o.financeRecommend) keys.push('finance');
  if (o.subjectToBuildingPest && o.bpRecommend) keys.push('buildingPest');
  return keys;
}

function categoryEmailHtml(key, o, env, providers) {
  const { topic } = RECOMMENDATION_CATEGORIES[key];
  return `<div style="background:${LINEN};padding:28px 14px;font-family:${FONT_STACK};">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 16px;">
      Hi ${esc(o.purchasers[0]?.firstName || 'there')},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 26px;">
      As requested, here are a few ${esc(topic)}s we'd recommend. ${esc(RECOMMENDATION_INTRO)}
    </p>
    ${providers.map(providerRow).join('')}
    <p style="font-size:14px;color:#374151;margin:22px 0 0;">
      ${esc(env.AGENT_NAME)}<br>
      <span style="color:#6b7280;">${esc(env.AGENT_TITLE)}</span>
      ${env.AGENT_PHONE ? `<br><span style="color:#6b7280;">${esc(env.AGENT_PHONE)}</span>` : ''}
    </p>
    <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:26px 0 0;padding-top:16px;border-top:1px solid #f1f1f1;">
      ${esc(RECOMMENDATION_DISCLOSURE)}
    </p>
  </div>
</div>`;
}

function categoryEmailText(key, o, providers) {
  const { topic } = RECOMMENDATION_CATEGORIES[key];
  const lines = [
    `Hi ${o.purchasers[0]?.firstName || 'there'},`,
    '',
    `As requested, here are a few ${topic}s we'd recommend. ${RECOMMENDATION_INTRO}`,
    '',
  ];
  providers.forEach((p) => {
    lines.push(p.name);
    const contact = [p.phone, p.email, p.website].filter(Boolean).join(' | ');
    if (contact) lines.push(`  ${contact}`);
    if (p.detail) lines.push(`  ${p.detail}`);
    lines.push('');
  });
  lines.push(RECOMMENDATION_DISCLOSURE);
  return lines.join('\n').trimEnd();
}

/**
 * One entry per ticked "please send me recommendations" box -- a buyer who
 * ticks two boxes gets two separate emails, not one combined one. A category
 * with nobody in the sheet is skipped here (nothing to send) but still shows
 * up in sentReferralsSummary() as "none configured", so the agent notices.
 */
export function recommendationEmails(o, env, referralsByType = {}) {
  return requestedCategoryKeys(o)
    .filter((key) => (referralsByType[key] || []).length)
    .map((key) => {
      const providers = referralsByType[key];
      return {
        subject: RECOMMENDATION_CATEGORIES[key].subject,
        html: categoryEmailHtml(key, o, env, providers),
        text: categoryEmailText(key, o, providers),
      };
    });
}

/**
 * What actually went out to the buyer, by category -- used in the agent
 * notification so Anthony can see at a glance which referrals were sent
 * (or that a category was requested but nobody's configured for it yet).
 */
export function sentReferralsSummary(o, referralsByType = {}) {
  return requestedCategoryKeys(o).map((key) => ({
    label: RECOMMENDATION_CATEGORIES[key].label,
    names: (referralsByType[key] || []).map((p) => p.name),
  }));
}

/**
 * Plain-text-style notification to the agent: bold labels and hyperlinks
 * only, no colours, boxes, logo, or custom fonts -- easy to scan and safe to
 * copy out of, on any device or email client.
 */
export function offerHtml(o, listing, meta = {}) {
  const summary = meta.sentReferrals || [];

  const lines = [];
  lines.push(`<p><b>Offer received — ${esc(listing.address || 'Property')}</b>`);
  if (listing.type || listing.priceGuide) {
    lines.push(`<br>${esc([listing.type, listing.priceGuide].filter(Boolean).join(' · '))}`);
  }
  lines.push('</p>');

  lines.push(`<p><b>Offer price:</b> ${esc(currency(o.offerPrice))}` +
    `<br><b>Settlement:</b> ${esc(settlementSummary(o))}` +
    `<br><b>Conditions:</b> ${esc(conditionsSummary(o))}</p>`);

  if (meta.viewUrl) {
    lines.push(`<p><a href="${esc(meta.viewUrl)}"><b><u>Open &amp; copy offer details</u></b></a><br>` +
      `Opens a page with a Copy button next to every field, in the same order as Anywhere Auctions.</p>`);
  }

  buildAAPages(o).forEach((page) => {
    const rows = page.fields.map((f) => `<b>${esc(f.label)}:</b> ${esc(f.value)}`).join('<br>');
    lines.push(`<p><u><b>Anywhere Auctions — ${esc(page.title)}</b></u><br>${rows}</p>`);
  });

  if (summary.length) {
    const rows = summary
      .map((s) => `${esc(s.label)}: ${s.names.length ? esc(s.names.join(', ')) : 'none configured yet — check the referrals sheet'}`)
      .join('<br>');
    lines.push(`<p><b>Recommendations sent to buyer:</b><br>${rows}</p>`);
  }

  if (o.specialConditions?.trim()) {
    lines.push(`<p><b>Additional notes</b> (not part of the Anywhere Auctions form):<br>` +
      `${esc(o.specialConditions).replace(/\n/g, '<br>')}</p>`);
  }

  lines.push(`<p>Submitted via the online offer form on ${esc(new Date(o.submittedAt).toLocaleString('en-AU'))}. ` +
    `This is an offer summary, not a contract of sale. No agreement exists until contracts are signed and exchanged by both parties.</p>`);

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111;">${lines.join('\n')}</div>`;
}

/** Deliberately plain -- no logo, no heading, just the message. */
export function buyerConfirmationHtml(o, listing, env) {
  return `<div style="background:${LINEN};padding:28px 14px;font-family:${FONT_STACK};">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 16px;">
      Hi ${esc(o.purchasers[0]?.firstName || 'there')},
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 16px;">
      This is an automated email to let you know your offer of <strong>${currency(o.offerPrice)}</strong> for
      <strong>${esc(listing.address)}</strong> has been received.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 16px;">
      The details will be populated into a contract, which will then be sent to you to sign.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.65;margin:0 0 22px;">
      We'll be in touch soon.
    </p>
    <p style="font-size:14px;color:#374151;margin:0;">
      ${esc(env.AGENT_NAME)}<br>
      <span style="color:#6b7280;">${esc(env.AGENT_TITLE)}</span>
      ${env.AGENT_PHONE ? `<br><span style="color:#6b7280;">${esc(env.AGENT_PHONE)}</span>` : ''}
    </p>
  </div>
</div>`;
}

/**
 * Plain-text mirror, sourced from the same field builder as the HTML version
 * and the copy-view page, for clients that strip HTML.
 */
export function offerText(o, listing, meta = {}) {
  const lines = [`OFFER — ${listing.address}`, ''];

  const summary = meta.sentReferrals || [];
  if (summary.length) {
    lines.push('RECOMMENDATIONS SENT TO BUYER');
    summary.forEach((s) => {
      lines.push(`  ${s.label}: ${s.names.length ? s.names.join(', ') : 'none configured yet — check the referrals sheet'}`);
    });
    lines.push('');
  }

  lines.push(
    `Price:       ${currency(o.offerPrice)}`,
    `Settlement:  ${settlementSummary(o)}`,
    `Conditions:  ${conditionsSummary(o)}`,
    '',
  );

  const labelWidth = buildAAPages(o).reduce(
    (max, page) => page.fields.reduce((m, f) => Math.max(m, f.label.length), max),
    0,
  );

  buildAAPages(o).forEach((page) => {
    lines.push(`=== ANYWHERE AUCTIONS — ${page.title.toUpperCase()} ===`);
    page.fields.forEach((f) => lines.push(`${(f.label + ':').padEnd(labelWidth + 2)}${f.value}`));
    lines.push('');
  });

  if (o.specialConditions?.trim()) {
    lines.push('ADDITIONAL NOTES (not part of the Anywhere Auctions form)', `  ${o.specialConditions}`, '');
  }
  lines.push(`Submitted: ${new Date(o.submittedAt).toLocaleString('en-AU')}`);
  return lines.join('\n');
}

export async function sendEmail(env, { to, replyTo, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      ...(text ? { text } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}
