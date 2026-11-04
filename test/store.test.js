import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, normalizePhone, memoryIdForPhone } from '../src/store.js';
import { runTool, callerFromMetadata, TOOL_DEFS } from '../src/tools.js';
import { buildFunctionPayload, buildAgentPayload } from '../src/napster.js';

// Fixed "now": Monday 2026-11-09 08:00 local
const now = () => new Date(2026, 10, 9, 8, 0);
const mk = () => new Store(':memory:', { now });

test('phone normalization and memory id format', () => {
  assert.equal(normalizePhone('+1 (555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('12'), null);
  const id = memoryIdForPhone('+1 555 123 4567');
  assert.match(id, /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(id, memoryIdForPhone('15551234567'));
});

test('availability respects hours, Sundays and past', () => {
  const s = mk();
  const a = s.checkAvailability({ service: 'physio', date: '2026-11-09' });
  assert.equal(a.slots[0], '2026-11-09T09:00');
  assert.ok(a.slots.every((x) => x.endsWith(':00') || x.endsWith(':30')));
  assert.equal(s.isOpenSlot('2026-11-08T10:00', 30), false, 'Sunday closed');
  assert.equal(s.isOpenSlot('2026-11-09T16:30', 60), false, 'runs past close');
  assert.equal(s.isOpenSlot('2026-11-02T10:00', 30), false, 'past');
  const sun = s.checkAvailability({ service: 'consult', date: '2026-11-08' });
  assert.ok(sun.slots[0].startsWith('2026-11-09'), 'Sunday rolls to Monday');
});

test('book, clash, reschedule, cancel lifecycle', () => {
  const s = mk();
  const b = s.book({ phone: '+15550001', name: 'Ana', service: 'consult', start: '2026-11-09T10:00' });
  assert.match(b.id, /^BK-[0-9A-F]{6}$/);
  assert.throws(() => s.book({ phone: '+15550002', name: 'Bo', service: 'checkup', start: '2026-11-09T10:15' }), { code: 'slot_unavailable' });
  assert.throws(() => s.reschedule({ booking_id: b.id, new_start: '2026-11-09T11:00', phone: '+15559999' }), { code: 'not_owner' });
  const r = s.reschedule({ booking_id: b.id, new_start: '2026-11-09T10:15', phone: '+15550001' }); // overlaps only itself
  assert.equal(r.start, '2026-11-09T10:15');
  assert.equal(s.cancel({ booking_id: b.id.toLowerCase() }).status, 'cancelled');
  assert.throws(() => s.cancel({ booking_id: b.id }), { code: 'not_active' });
  assert.ok(s.isOpenSlot('2026-11-09T10:00', 30), 'slot freed');
});

test('returning customer is remembered with notes and upcoming bookings', () => {
  const s = mk();
  s.book({ phone: '+44 20 7946 0000', name: 'Mia', service: 'physio', start: '2026-11-10T09:00', notes: 'prefers mornings' });
  const l = s.lookupCustomer({ phone: '+442079460000' });
  assert.equal(l.found, true);
  assert.equal(l.customer.name, 'Mia');
  assert.match(l.customer.notes, /mornings/);
  assert.equal(l.upcoming.length, 1);
  assert.equal(s.lookupCustomer({ phone: '+1999999' }).found, false);
});

test('tools use caller ID from VoIP metadata', () => {
  const s = mk();
  const md = { external_client_id: '+15557654321' };
  assert.equal(callerFromMetadata(md).channel, 'phone');
  const r = runTool(s, 'book_appointment', { service: 'checkup', start: '2026-11-11T14:00', name: 'Raj' }, md);
  assert.equal(r.ok, true);
  assert.equal(s.get(r.booking_id).channel, 'phone');
  const l = runTool(s, 'lookup_customer', {}, md);
  assert.equal(l.customer.name, 'Raj');
  const bad = runTool(s, 'book_appointment', { service: 'checkup', start: '2026-11-11T14:00', name: 'X' }, { external_client_id: '+15550000' });
  assert.equal(bad.ok, false); assert.equal(bad.error, 'slot_unavailable'); assert.ok(bad.alternatives.length);
  assert.equal(runTool(s, 'nope', {}).error, 'unknown_tool');
});

test('Napster payload builders', () => {
  const ex = buildFunctionPayload(TOOL_DEFS[0], { publicBaseUrl: 'https://x.test/', toolSecret: 's' });
  assert.equal(ex.flow, 'explicit'); assert.equal(ex.url, 'https://x.test/tools/lookup_customer'); assert.equal(ex.headers['x-tool-secret'], 's');
  assert.ok(ex.prompt.includes('Do NOT'));
  assert.equal(buildFunctionPayload(TOOL_DEFS[0], {}).flow, 'implicit');
  const a = buildAgentPayload({ companionId: 'c1', functionIds: ['f1'], faqId: 'q1', business: 'B' });
  assert.deepEqual(a.faqCollections, ['q1']); assert.ok(a.providerSettings.instructions.includes('B'));
});
