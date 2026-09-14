import { buildAAPages, encodeOfferForView, decodeOfferFromHash } from '../public/aa-fields.js';

const offer = {
  purchasers: [
    { firstName: 'John', middleName: 'Robert', lastName: 'Citizen', email: 'john@example.com', mobile: '0412 345 678', address: '8 Buyer St, Box Hill' },
    { firstName: 'Jane', middleName: '', lastName: 'Citizen', email: 'jane@example.com', mobile: '0423 456 789', address: '' },
  ],
  offerPrice: 1220000,
  depositType: '10%',
  depositAmount: 122000,
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
  bpRecommend: false,
  subjectToOther: false,
  otherDetails: '',
  conveyancerName: '',
  conveyancerRecommend: true,
};

const pages = buildAAPages(offer);
console.log('--- buildAAPages ---');
console.log(JSON.stringify(pages, null, 2));

console.log('\n--- round-trip encode/decode ---');
const listing = { address: '12 Sample Street, Blackburn VIC 3130' };
const encoded = encodeOfferForView(offer, listing);
console.log('encoded length:', encoded.length);
const decoded = decodeOfferFromHash('#o=' + encoded);
console.log('round-trip OK:', JSON.stringify(decoded.offer) === JSON.stringify(offer) && decoded.listing.address === listing.address);

const offer2 = { ...offer, purchasers: [{ ...offer.purchasers[0], lastName: "O'Brien & Co" }] };
const decoded2 = decodeOfferFromHash('#o=' + encodeOfferForView(offer2, listing));
console.log('special chars OK:', decoded2.offer.purchasers[0].lastName === "O'Brien & Co");

console.log('bad hash handled:', decodeOfferFromHash('#nope') === null);
