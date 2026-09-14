/**
 * Email rendering + sending (Resend).
 *
 * Every offer renders through the same table, so two offers on the same
 * property can be read side by side without hunting for the numbers.
 */

import { buildAAPages } from '../public/aa-fields.js';

const NAVY = '#0c1a29';
const GREEN = '#00aa56';
// Self-hosted, not hotlinked from obrienrealestate.com.au: a different sending
// domain pulling a brand's logo live from that brand's own site is a classic
// phishing heuristic, and was very likely why the first test email landed in
// Junk despite correct SPF/DKIM/DMARC.
const LOGO_URL = 'https://offers.anthonymolinaro.com.au/obre-logo.png';

/** Navy header band + white card body, wrapped around whatever content is passed in. */
function brandCard(innerHtml, { maxWidth = 620 } = {}) {
  return `<div style="background:#f6f7f9;padding:28px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:${maxWidth}px;margin:0 auto;">
    <div style="background:${NAVY};padding:16px 28px;border-radius:12px 12px 0 0;">
      <img src="${LOGO_URL}" alt="O'Brien Real Estate" height="22" style="display:block;height:22px;width:auto;">
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      ${innerHtml}
    </div>
  </div>
</div>`;
}

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

/**
 * One AA-style field: a small muted label above a bold, isolated value line.
 * Kept as its own block (not merged into a sentence) so a tap-and-hold on
 * mobile selects exactly the value as a fallback when the link below isn't used.
 */
function field(label, value) {
  return `<div style="padding:10px 0;border-bottom:1px solid #f1f1f1;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600;">${esc(label)}</div>
    <div style="font-size:15.5px;margin-top:3px;color:${NAVY};font-weight:600;">${esc(value)}</div>
  </div>`;
}

/**
 * The Anywhere Auctions screens, in their own on-screen order, sourced from
 * the same field builder the copy-view page uses -- only fields with a real
 * value appear, nothing is shown as a placeholder.
 */
function aaSheet(o) {
  return buildAAPages(o)
    .map(
      (page) => `<div style="margin-top:22px;">
        <div style="background:${NAVY};color:#fff;padding:9px 16px;border-radius:8px 8px 0 0;font-size:12px;font-weight:600;">
          Anywhere Auctions — ${esc(page.title)}
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:2px 16px;">
          ${page.fields.map((f) => field(f.label, f.value)).join('')}
        </div>
      </div>`,
    )
    .join('');
}

function actionItems(o) {
  const items = [];
  if (o.conveyancerRecommend) items.push('Buyer requested a conveyancer recommendation, sent automatically.');
  if (o.subjectToFinance && o.financeRecommend) items.push('Buyer requested a finance/broker recommendation, sent automatically.');
  if (o.subjectToBuildingPest && o.bpRecommend) items.push('Buyer requested a building & pest inspector recommendation, sent automatically.');
  if (!items.length) return '';
  return `<div style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:22px;">
    ${items.map(esc).join('<br>')}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Trusted provider recommendations -- sent automatically to the buyer
 * whenever they tick a "please send me recommendations" box.
 * ------------------------------------------------------------------ */

const CONVEYANCERS = [
  {
    name: 'Victorian Statewide Conveyancing',
    phone: '03 8790 5488',
    email: 'info@victorianstatewide.com.au',
    website: 'https://victorianstatewide.com.au/',
    detail:
      "$1,600, or $1,700 if there's an owners corporation, with no hidden costs, no upfront fees, and no contract review fees.",
  },
  {
    name: 'First Class Legal',
    phone: '1300 956 321',
    email: 'info@firstclasslegal.com.au',
    website: 'https://www.firstclasslegal.com.au/',
    detail:
      '$1,500 plus GST and disbursements, taken out at settlement. The $330 standard contract review fee is deducted from the $1,500 if you go ahead with the property.',
  },
  {
    name: 'Zettle Conveyancing',
    website: 'https://www.zettle.com.au/contact',
    detail: '$1,500 plus disbursements for buyers, with unlimited contract reviews.',
  },
];

const FINANCE_BROKERS = [
  {
    name: 'Anthony Mathews, Loan Market',
    phone: '0429 963 316',
    email: 'anthony.mathews@loanmarket.com.au',
  },
  {
    name: 'Rhys Chapman, Blue Rock',
    phone: '0412 983 671',
    email: 'rhys.chapman@thebluerock.com.au',
    website: 'https://www.bluerock.com.au/team/rhys-chapman/',
  },
  {
    name: 'Blank Finance',
    phone: '0499 888 666',
    website: 'https://blank.financial/contact/',
  },
];

const BUILDING_PEST_INSPECTORS = [
  {
    name: "Paul O'Toole, Home Buyers Protection Service",
    phone: '0411 325 949 or 9563 7732',
    email: 'paul@hbps.com.au',
    website: 'https://www.hbps.com.au/',
    detail: '$495 for an email report, $695 for a written report.',
  },
  {
    name: 'Altez Building Inspections',
    phone: '0499 899 890',
    email: 'admin@altezbuildinginspections.com.au',
    website: 'https://www.altezbuildinginspections.com.au/',
    detail: 'Contact them to confirm current fees.',
  },
  {
    name: 'Authority Building Inspections',
    phone: '1800 852 585',
    email: 'hello@authoritybuildinginspections.com.au',
    website: 'https://authoritybuildinginspections.com.au/contact-us/',
    detail: 'Single storey $495 plus GST, double storey $550 plus GST.',
  },
];

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
  if (p.email) contactBits.push(`<a href="mailto:${esc(p.email)}" style="color:${GREEN};text-decoration:none;">${esc(p.email)}</a>`);
  if (p.website) contactBits.push(`<a href="${esc(p.website)}" style="color:${GREEN};text-decoration:none;">${esc(p.website)}</a>`);
  return `<div style="margin-bottom:16px;">
    <div style="font-weight:600;color:${NAVY};font-size:15px;">${esc(p.name)}</div>
    ${contactBits.length ? `<div style="font-size:13.5px;color:#6b7280;margin-top:2px;">${contactBits.join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${p.detail ? `<div style="font-size:13.5px;color:#6b7280;margin-top:2px;">${esc(p.detail)}</div>` : ''}
  </div>`;
}

// One category = one email. subject/topic phrase the sentence naturally
// ("a conveyancer" / "a finance broker" / "a building & pest inspector").
const RECOMMENDATION_CATEGORIES = {
  conveyancer: { subject: 'Conveyancing recommendations', topic: 'a conveyancer', providers: CONVEYANCERS },
  finance: { subject: 'Finance recommendations', topic: 'a finance broker', providers: FINANCE_BROKERS },
  buildingPest: {
    subject: 'Building & pest recommendations',
    topic: 'a building & pest inspector',
    providers: BUILDING_PEST_INSPECTORS,
  },
};

function requestedCategoryKeys(o) {
  const keys = [];
  if (o.conveyancerRecommend) keys.push('conveyancer');
  if (o.subjectToFinance && o.financeRecommend) keys.push('finance');
  if (o.subjectToBuildingPest && o.bpRecommend) keys.push('buildingPest');
  return keys;
}

function categoryEmailHtml(key, o, env) {
  const { topic, providers } = RECOMMENDATION_CATEGORIES[key];
  return `<div style="background:#f6f7f9;padding:28px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
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

function categoryEmailText(key, o) {
  const { topic, providers } = RECOMMENDATION_CATEGORIES[key];
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
 * ticks two boxes gets two separate emails, not one combined one.
 */
export function recommendationEmails(o, env) {
  return requestedCategoryKeys(o).map((key) => ({
    subject: RECOMMENDATION_CATEGORIES[key].subject,
    html: categoryEmailHtml(key, o, env),
    text: categoryEmailText(key, o),
  }));
}

export function offerHtml(o, listing, meta = {}) {
  const warn = meta.agentboxError
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:22px;">
         <strong>Not logged in Agentbox.</strong> ${esc(meta.agentboxError)}. This email is the only record, so please add it to the CRM manually.
       </div>`
    : '';

  return brandCard(`
    ${warn}
    ${actionItems(o)}
    <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#9ca3af;font-weight:700;">Offer received</div>
    <h1 style="margin:6px 0 2px;font-size:21px;line-height:1.3;color:${NAVY};">${esc(listing.address || 'Property')}</h1>
    <div style="color:#6b7280;font-size:14px;">${esc([listing.type, listing.priceGuide].filter(Boolean).join(' · '))}</div>

    <div style="margin:24px 0 4px;padding:18px 20px;background:#f9fafb;border-radius:10px;border-left:3px solid ${GREEN};">
      <div style="font-size:12px;color:#6b7280;">Offer price</div>
      <div style="font-size:30px;font-weight:700;color:${GREEN};letter-spacing:-.02em;">${currency(o.offerPrice)}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">
        ${esc(settlementSummary(o))} settlement &nbsp;·&nbsp; ${esc(conditionsSummary(o))}
      </div>
    </div>

    ${
      meta.viewUrl
        ? `<a href="${esc(meta.viewUrl)}" style="display:block;text-align:center;margin:22px 0 0;padding:14px 20px;
             background-color:${GREEN};text-decoration:none;border-radius:9px;">
             <span style="color:#ffffff;font-size:15px;font-weight:700;">Open &amp; copy offer details &rarr;</span>
           </a>
           <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;text-align:center;">
             Opens a page with a Copy button next to every field, in the same order as Anywhere Auctions.
           </p>`
        : ''
    }
    ${aaSheet(o)}

    ${
      o.specialConditions?.trim()
        ? `<div style="margin-top:26px;">
             <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#9ca3af;font-weight:700;margin-bottom:8px;">
               Additional notes <span style="font-weight:400;text-transform:none;letter-spacing:0;">(not part of the Anywhere Auctions form)</span>
             </div>
             <div style="font-size:14px;color:${NAVY};">${esc(o.specialConditions).replace(/\n/g, '<br>')}</div>
           </div>`
        : ''
    }

    <p style="margin:26px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
      Submitted via the online offer form on ${esc(new Date(o.submittedAt).toLocaleString('en-AU'))}.
      This is an offer summary, not a contract of sale. No agreement exists until contracts are signed
      and exchanged by both parties.
    </p>
  `);
}

/** Deliberately plain -- no logo, no heading, just the message. */
export function buyerConfirmationHtml(o, listing, env) {
  return `<div style="background:#f6f7f9;padding:28px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
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
export function offerText(o, listing) {
  const lines = [`OFFER — ${listing.address}`, ''];

  const actions = [];
  if (o.conveyancerRecommend) actions.push('  Buyer requested a conveyancer recommendation, sent automatically.');
  if (o.subjectToFinance && o.financeRecommend) actions.push('  Buyer requested a finance/broker recommendation, sent automatically.');
  if (o.subjectToBuildingPest && o.bpRecommend) actions.push('  Buyer requested a building & pest inspector recommendation, sent automatically.');
  if (actions.length) lines.push('NOTE', ...actions, '');

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
