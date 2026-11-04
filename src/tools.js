import { BookingError, normalizePhone } from './store.js';

// Tool definitions registered with Napster (POST /public/functions).
// `prompt` follows Napster's "Use when / Do NOT use when / behaviour" guidance.
export const TOOL_DEFS = [
  {
    name: 'lookup_customer',
    description: 'Look up a returning customer by phone number, including their upcoming and recent bookings and notes.',
    parameters: { type: 'object', properties: {
      phone: { type: 'string', description: 'Customer phone number. On phone calls pass "caller": the caller ID is used automatically.' } }, required: ['phone'] },
    prompt: 'Call silently at the start of every conversation (on phone calls the caller number is known; on web call it once the customer gives a phone number). If found, greet them by name and mention any upcoming booking. Do not read the phone number back in full. Do NOT call repeatedly for the same number.',
  },
  {
    name: 'check_availability',
    description: 'List open appointment slots for a service, starting on a given date.',
    parameters: { type: 'object', properties: {
      service: { type: 'string', description: 'Service id or name: consult, physio, or checkup' },
      date: { type: 'string', description: 'Date to start searching, YYYY-MM-DD. Omit for the next available days.' } }, required: ['service'] },
    prompt: 'Use when the customer asks when they can come in or names a day/time. Before calling say a short neutral phrase like "Let me check the calendar." Offer at most three slots, spoken naturally (e.g. "Tuesday at 10:30"). Do NOT use to answer pricing or opening-hours questions.',
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment slot for a customer.',
    parameters: { type: 'object', properties: {
      service: { type: 'string' }, start: { type: 'string', description: 'Slot start, YYYY-MM-DDTHH:MM, from check_availability' },
      name: { type: 'string', description: 'Customer full name' }, phone: { type: 'string', description: 'Customer phone. Omit on phone calls.' },
      notes: { type: 'string', description: 'Anything worth remembering for next time (preferences, reason for visit)' } },
      required: ['service', 'start', 'name'] },
    prompt: 'Use only after check_availability returned the chosen slot and you have the customer name (and phone on web). Before calling, repeat service, day and time and wait for an explicit yes. After success, read out the booking reference. If the result says slot_unavailable, offer the alternatives. Do NOT use for changing an existing booking.',
  },
  {
    name: 'reschedule_appointment',
    description: 'Move an existing booking to a new open slot.',
    parameters: { type: 'object', properties: {
      booking_id: { type: 'string', description: 'Booking reference like BK-1A2B3C' }, new_start: { type: 'string', description: 'YYYY-MM-DDTHH:MM' },
      phone: { type: 'string' } }, required: ['booking_id', 'new_start'] },
    prompt: 'Use when a customer wants to move an existing booking. Find the booking via lookup_customer first, check the new time with check_availability, confirm old and new time with the customer, then call. Do NOT use for new bookings.',
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing booking.',
    parameters: { type: 'object', properties: { booking_id: { type: 'string' }, phone: { type: 'string' } }, required: ['booking_id'] },
    prompt: 'Use when the customer clearly asks to cancel. Confirm which booking (service, day, time) and wait for an explicit yes before calling. Offer to reschedule instead first. Do NOT use when they only want a different time.',
  },
];

// Resolve who is calling from Napster session metadata.
// VoIP/SIP: external_client_id is the caller number. Web: our backend sets c_<hash> and passes the phone in the profile.
export function callerFromMetadata(metadata = {}) {
  const id = metadata?.external_client_id || null;
  const prof = metadata?.external_client_profile || {};
  const phone = prof.phone || (id && /^\+?\d{6,}$/.test(id) ? id : null);
  return { phone: normalizePhone(phone), customerId: id && id.startsWith('c_') ? id : null, channel: metadata?.tags?.channel || (phone && !prof.phone ? 'phone' : 'web') };
}

export function runTool(store, name, args = {}, metadata = {}) {
  const who = callerFromMetadata(metadata);
  const phone = normalizePhone(args.phone) || who.phone;
  try {
    switch (name) {
      case 'lookup_customer':
        return store.lookupCustomer({ phone, customer_id: normalizePhone(args.phone) ? null : who.customerId });
      case 'check_availability':
        return store.checkAvailability({ date: args.date, service: args.service });
      case 'book_appointment': {
        const b = store.book({ ...args, phone, channel: who.channel });
        return { ok: true, booking_id: b.id, service: b.service, start: b.start, name: b.customer_name };
      }
      case 'reschedule_appointment': {
        const b = store.reschedule({ booking_id: args.booking_id, new_start: args.new_start, phone });
        return { ok: true, booking_id: b.id, start: b.start };
      }
      case 'cancel_appointment': {
        const b = store.cancel({ booking_id: args.booking_id, phone });
        return { ok: true, booking_id: b.id, status: b.status };
      }
      default:
        return { ok: false, error: 'unknown_tool' };
    }
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.code, message: e.message, alternatives: e.alternatives };
    throw e;
  }
}
