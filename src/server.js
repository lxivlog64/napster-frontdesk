import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config.js';
import { Store, events, memoryIdForPhone, normalizePhone } from './store.js';
import { runTool } from './tools.js';
import { napster } from './napster.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUB = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function readState() {
  const f = path.join(ROOT, '.napster-state.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, bad) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } }); req.on('error', bad);
});
const safeEq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createServer({ store, toolSecret = process.env.TOOL_SECRET, agentId, napsterCall = napster, business = process.env.BUSINESS_NAME || 'Willow Lane Clinic' } = {}) {
  const sseClients = new Set();
  const onChange = (ev) => { for (const r of sseClients) r.write(`data: ${JSON.stringify(ev)}\n\n`); };
  events.on('change', onChange);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      // Explicit tool webhook called by Napster: POST /tools/<name> {call_id,name,arguments,metadata}
      if (req.method === 'POST' && url.pathname.startsWith('/tools/')) {
        if (toolSecret && !safeEq(req.headers['x-tool-secret'], toolSecret)) return send(res, 401, { error: 'unauthorized' });
        const b = await body(req);
        const name = url.pathname.slice(7) || b.name;
        return send(res, 200, runTool(store, name, b.arguments || {}, b.metadata || {}));
      }
      // Implicit-flow bridge for the browser (dev mode without a public URL). Scoped to the session's own phone.
      if (req.method === 'POST' && url.pathname === '/api/tools') {
        const b = await body(req);
        return send(res, 200, runTool(store, b.name, b.arguments || {}, { external_client_profile: { phone: b.phone }, tags: { channel: 'web' } }));
      }
      // Mint a WebRTC session. API key stays server-side; browser gets only the short-lived token.
      if (req.method === 'POST' && url.pathname === '/api/session') {
        const b = await body(req);
        const id = agentId || process.env.NAPSTER_AGENT_ID || readState().agentId;
        if (!id) return send(res, 503, { error: 'Agent not set up yet. Run npm run setup:agent.' });
        const phone = normalizePhone(b.phone);
        const known = phone ? store.lookupCustomer({ phone }) : { found: false };
        const payload = { channelType: 'webrtc', tags: { channel: 'web' } };
        if (phone) {
          payload.externalClientId = memoryIdForPhone(phone); // enables Napster cross-session memory
          payload.externalClientProfile = { phone, ...(known.found && known.customer.name ? { name: known.customer.name } : {}) };
        }
        payload.initialSpeech = known.found
          ? `Greet ${known.customer.name || 'the customer'} by name as a returning customer of ${business}, mention their upcoming booking if any, and ask how you can help.`
          : `Greet the visitor warmly as the front desk of ${business} and ask how you can help today.`;
        const r = await napsterCall('POST', `/public/agents/${id}/connections`, payload);
        return send(res, 200, { token: r.token, connectionId: r.connection?.id, returning: known.found });
      }
      if (req.method === 'GET' && url.pathname === '/api/bookings') return send(res, 200, { bookings: store.list(), services: store.services() });
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const st = readState();
        return send(res, 200, { business, phoneNumber: process.env.DEMO_PHONE_NUMBER || st.phoneNumber || null, agentReady: !!(agentId || process.env.NAPSTER_AGENT_ID || st.agentId), implicit: st.flow === 'implicit' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': ok\n\n'); sseClients.add(res); req.on('close', () => sseClients.delete(res)); return;
      }
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'GET') {
        const f = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^([/\\])+/, ''));
        if (f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
          return fs.createReadStream(f).pipe(res);
        }
      }
      send(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error('request error:', e.message); // message never contains the key
      send(res, 500, { error: 'server_error' });
    }
  });
  server.on('close', () => events.off('change', onChange));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv(path.join(ROOT, '.env'));
  const store = new Store(process.env.DB_PATH || path.join(ROOT, 'data', 'frontdesk.db'));
  const port = +process.env.PORT || 3000;
  createServer({ store }).listen(port, () => console.log(`front desk on :${port}`));
}
