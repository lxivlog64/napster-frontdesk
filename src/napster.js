import { getApiKey } from './config.js';

export const BASE = process.env.NAPSTER_BASE_URL || 'https://companion-api.napster.com';

// Thin client. The key travels only in the X-Api-Key header; errors never include it.
export async function napster(method, path, body, { fetchImpl = fetch } = {}) {
  const key = getApiKey();
  if (!key) throw new Error('NAPSTER_API_KEY not set (and ~/.secrets/napster_api_key missing)');
  const res = await fetchImpl(BASE + path, {
    method,
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`Napster ${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

export const AGENT_INSTRUCTIONS = (business) => `You are the front-desk receptionist for ${business}, a small clinic. You answer phone calls and web video calls.
Goals: book, reschedule or cancel appointments, and answer simple questions. Keep replies short and warm, one question at a time.
Opening hours: Monday to Saturday 9:00 to 17:00, closed Sunday.
Always use the tools for availability and bookings; never invent slots or booking references.
Remember returning customers: use lookup_customer and your memory of past conversations to greet them by name and recall preferences.
Never give medical advice; for emergencies tell the caller to hang up and call the local emergency number.`;

// Build the payloads for setup (pure, testable).
export function buildFunctionPayload(def, { publicBaseUrl, toolSecret }) {
  const p = { data: { name: def.name, description: def.description, parameters: def.parameters }, prompt: def.prompt };
  if (publicBaseUrl) {
    p.flow = 'explicit';
    p.url = `${publicBaseUrl.replace(/\/$/, '')}/tools/${def.name}`;
    if (toolSecret) p.headers = { 'x-tool-secret': toolSecret };
  } else {
    p.flow = 'implicit'; // handled in the browser via the Web SDK, then forwarded to /api/tools
  }
  return p;
}

export function buildAgentPayload({ companionId, functionIds, faqId, business }) {
  return {
    companionId, name: `${business} Front Desk`, voiceId: 'shimmer', language: 'en',
    functions: functionIds, ...(faqId ? { faqCollections: [faqId] } : {}),
    providerSettings: { temperature: 0.6, instructions: AGENT_INSTRUCTIONS(business) },
  };
}

export const FAQS = [
  ['What are your opening hours?', 'Monday to Saturday, 9am to 5pm. We are closed on Sundays.'],
  ['How much is a consultation?', 'A general consultation is $60 for 30 minutes; physiotherapy is $95 for 60 minutes; a quick check-up is $35.'],
  ['What is your cancellation policy?', 'Please cancel or reschedule at least 24 hours ahead so we can offer the slot to someone else.'],
  ['Where are you located?', 'This is a demo clinic; the address would be configured by the business.'],
];
