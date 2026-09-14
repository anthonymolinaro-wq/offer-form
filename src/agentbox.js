/**
 * Agentbox API adapter.
 *
 * Base URL and auth headers are confirmed. The exact response field names below
 * are the documented conventions but have NOT yet been verified against a live
 * account -- once the Integrator Application comes back, run
 * `node scripts/probe-agentbox.mjs` and adjust ONLY the maps in this file.
 * Nothing else in the codebase reads Agentbox shapes directly.
 */

const BASE = 'https://api.agentboxcrm.com.au';

class AgentboxError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'AgentboxError';
    this.status = status;
    this.body = body;
  }
}

function configured(env) {
  return Boolean(env.AGENTBOX_CLIENT_ID && env.AGENTBOX_API_KEY);
}

async function call(env, path, { method = 'GET', body, query } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      'X-Client-ID': env.AGENTBOX_CLIENT_ID,
      'X-API-Key': env.AGENTBOX_API_KEY,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    // Never let a slow CRM hold up the notification email.
    signal: AbortSignal.timeout(8000),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // fall through -- non-JSON body is reported raw in the error
  }

  if (!res.ok) {
    throw new AgentboxError(
      `Agentbox ${method} ${path} failed (${res.status})`,
      res.status,
      json || text.slice(0, 500),
    );
  }
  return json?.response ?? json;
}

/** Agentbox wraps collections inconsistently; flatten to a plain array. */
function items(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  if (Array.isArray(node.items)) return node.items;
  return [node];
}

/** Build a single-line address from whichever address fields came back. */
function formatAddress(listing) {
  const a = listing?.property?.address || listing?.address || {};
  const street = [a.streetAddress, a.street, [a.streetNum, a.streetName].filter(Boolean).join(' ')]
    .find((s) => s && String(s).trim());
  const line = [
    [a.unitNum, street].filter(Boolean).join('/'),
    a.suburb,
    a.state,
    a.postcode,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return line || listing?.displayAddress || listing?.name || '';
}

/** Normalise a listing into the only shape the rest of the app knows about. */
function toListing(raw) {
  if (!raw) return null;
  const agent = items(raw.relatedStaffMembers)[0] || {};
  return {
    id: String(raw.id ?? ''),
    address: formatAddress(raw),
    suburb: raw?.property?.address?.suburb || raw?.address?.suburb || '',
    type: raw?.property?.type || raw?.type || '',
    priceGuide: raw?.displayPrice || raw?.searchPrice || '',
    status: raw?.status || '',
    agentName:
      [agent.firstName, agent.lastName].filter(Boolean).join(' ') || '',
    agentEmail: agent.email || '',
  };
}

export const agentbox = {
  configured,

  /** Property details for prefilling the form heading and title. */
  async getListing(env, id) {
    const r = await call(env, `/listings/${encodeURIComponent(id)}`, {
      query: { include: 'relatedStaffMembers' },
    });
    return toListing(r?.listing ?? r);
  },

  /** Fallback picker: current on-market listings for the office. */
  async listAvailable(env) {
    const r = await call(env, '/listings', {
      query: { 'filter[status]': 'Available', limit: 100, order: 'suburb' },
    });
    return items(r?.listings).map(toListing).filter((l) => l.address);
  },

  /**
   * Match an existing contact by email, otherwise create one, so repeat buyers
   * don't spawn duplicates in the CRM.
   */
  async findOrCreateContact(env, { firstName, lastName, email, mobile }) {
    const found = await call(env, '/contacts', {
      query: { 'filter[email]': email, limit: 1 },
    }).catch(() => null);

    const existing = items(found?.contacts)[0];
    if (existing?.id) return { id: String(existing.id), created: false };

    const created = await call(env, '/contacts', {
      method: 'POST',
      body: { contact: { firstName, lastName, email, mobile, source: 'Website' } },
    });
    const id = created?.contact?.id ?? created?.id;
    return { id: String(id), created: true };
  },

  /** Log the offer against the listing so it lives in the CRM timeline. */
  async logEnquiry(env, { contactId, listingId, comment }) {
    const r = await call(env, '/enquiries', {
      method: 'POST',
      body: {
        enquiry: {
          contactId,
          listingId,
          comment,
          type: 'Offer',
          origin: 'Website',
        },
      },
    });
    return { id: String(r?.enquiry?.id ?? r?.id ?? '') };
  },
};

export { AgentboxError };
