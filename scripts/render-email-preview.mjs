/**
 * Renders the two live email templates (imported straight from src/email.js
 * -- not a re-typed copy) into a single static HTML file for visual review.
 *
 * Static on purpose: earlier versions injected the rendered emails into
 * iframes via JavaScript at view-time, which produced a blank panel in
 * whatever sandbox renders files sent through this tool (it blocks script
 * execution). Baking the HTML in at generation time means the preview needs
 * no script execution at all to display correctly.
 *
 *     node scripts/render-email-preview.mjs
 *     -> writes email-preview.html
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerHtml, buyerConfirmationHtml, recommendationEmails } from '../src/email.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'email-preview.html');

const SAMPLE_LISTING = {
  address: '12 Sample Street, Blackburn VIC 3130',
  type: 'House',
  priceGuide: '$1,150,000 - $1,250,000',
};

const SAMPLE_OFFER = {
  purchasers: [
    {
      firstName: 'John',
      middleName: 'Robert',
      lastName: 'Citizen',
      email: 'john.citizen@example.com',
      mobile: '0412 345 678',
      address: '8 Buyer Street, Box Hill VIC 3128',
    },
    {
      firstName: 'Jane',
      middleName: '',
      lastName: 'Citizen',
      email: 'jane.citizen@example.com',
      mobile: '0423 456 789',
      address: '',
    },
  ],
  offerPrice: 1220000,
  depositType: '10%',
  depositAmount: 122000,
  depositPercent: '10.0',
  settlementDays: '60',
  settlementDate: '',
  unconditional: false,
  subjectToFinance: true,
  financeLender: 'CBA',
  financeAmount: 976000,
  financeApprovalDate: '2026-09-05',
  financeRecommend: true,
  subjectToBuildingPest: true,
  buildingPestDate: '2026-08-28',
  bpRecommend: true,
  subjectToOther: false,
  otherDetails: '',
  conveyancerName: '',
  conveyancerFirm: '',
  conveyancerEmail: '',
  conveyancerPhone: '',
  conveyancerAddress: '',
  conveyancerRecommend: true,
  specialConditions: 'Purchaser requests the garden shed and current lawn mower remain with the property.',
  submittedAt: '2026-08-17T10:32:00.000Z',
};

const SAMPLE_ENV = {
  AGENT_NAME: 'Anthony Molinaro',
  AGENT_TITLE: 'Licensed Estate Agent/Auctioneer',
  AGENT_PHONE: '0411 061 796',
};

// The real site isn't deployed yet, so the real logo URL 404s locally --
// swap in a data URI so the preview still shows the actual logo.
const logoDataUri = 'data:image/png;base64,' + readFileSync(join(ROOT, 'public', 'obre-logo.png')).toString('base64');
const withLocalLogo = (html) => html.replaceAll('https://offers.anthonymolinaro.com.au/obre-logo.png', logoDataUri);

const notificationHtml = withLocalLogo(offerHtml(SAMPLE_OFFER, SAMPLE_LISTING, { viewUrl: 'view.html#o=...' }));
const confirmationHtml = withLocalLogo(buyerConfirmationHtml(SAMPLE_OFFER, SAMPLE_LISTING, SAMPLE_ENV));
const recoEmails = recommendationEmails(SAMPLE_OFFER, SAMPLE_ENV);

// Safe to embed raw inside a double-quoted srcdoc attribute: only & and " need escaping.
const forSrcdoc = (html) => html.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

const recoRows = recoEmails
  .map(
    (email, i) => `
  <div class="row">
    <h2>${3 + i}. Recommendation email -- "${email.subject}" -- to the purchaser</h2>
    <iframe height="900" scrolling="no" srcdoc="${forSrcdoc(email.html)}"></iframe>
  </div>`,
  )
  .join('');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Email preview</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
       background:#e5e7eb;margin:0;padding:24px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#374151;
     margin:0 0 10px;padding-left:4px}
  .row{margin-bottom:36px}
  iframe{width:100%;border:1px solid #d1d5db;border-radius:8px;background:#fff}
</style></head>
<body>
  <div class="row">
    <h2>1. Notification email -- to anthony.molinaro@obrienrealestate.com.au</h2>
    <iframe height="2300" scrolling="no" srcdoc="${forSrcdoc(notificationHtml)}"></iframe>
  </div>
  <div class="row">
    <h2>2. Buyer confirmation email -- to the purchaser</h2>
    <iframe height="420" scrolling="no" srcdoc="${forSrcdoc(confirmationHtml)}"></iframe>
  </div>
  ${recoRows}
  <p style="color:#6b7280;font-size:13px;padding-left:4px;">
    Sample buyer ticked all three recommendation boxes, so three separate emails are shown above --
    a real buyer only gets one per box they actually tick.
  </p>
</body></html>
`;

writeFileSync(OUT, page, 'utf-8');
console.log(`Wrote ${OUT}`);
