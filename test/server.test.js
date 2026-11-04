import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { createServer } from '../src/server.js';

const now = () => new Date(2026, 10, 9, 8, 0);
async function withServer(opts, fn) {
  const store = new Store(':memory:', { now });
  const srv = createServer({ store, ...opts });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, store); } finally { srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); }
}
const post = (u, b, h = {}) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });

test('tool webhook requires secret and executes', async () => {
  await withServer({ toolSecret: 'sekret' }, async (base) => {
    const payload = { call_id: 'c1', name: 'check_availability', arguments: { service: 'consult', date: '2026-11-09' }, metadata: { external_client_id: '+15551112222' } };
    assert.equal((await post(base + '/tools/check_availability', payload)).status, 401);
    const r = await post(base + '/tools/check_availability', payload, { 'x-tool-secret': 'sekret' });
    const j = await r.json(); assert.equal(j.slots[0], '2026-11-09T09:00');
  });
});

test('session minting passes memory id and profile, never the key', async () => {
  let seen;
  const napsterCall = async (m, p, b) => { seen = { m, p, b }; return { token: 'tok', connection: { id: 'conn1' } }; };
  await withServer({ agentId: 'agent1', napsterCall }, async (base, store) => {
    store.book({ phone: '+15553334444', name: 'Lee', service: 'consult', start: '2026-11-09T09:00' });
    const j = await (await post(base + '/api/session', { phone: '+1 555 333 4444' })).json();
    assert.equal(j.token, 'tok'); assert.equal(j.returning, true);
    assert.equal(seen.p, '/public/agents/agent1/connections');
    assert.match(seen.b.externalClientId, /^c_[0-9a-f]{24}$/);
    assert.equal(seen.b.externalClientProfile.name, 'Lee');
    assert.match(seen.b.initialSpeech, /Lee/);
    const bk = await (await fetch(base + '/api/bookings')).json();
    assert.equal(bk.bookings.length, 1);
  });
});

test('static page served, traversal blocked', async () => {
  await withServer({}, async (base) => {
    assert.match(await (await fetch(base + '/')).text(), /napster-companion-api/);
    assert.equal((await fetch(base + '/../package.json')).status, 404);
  });
});
