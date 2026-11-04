// Creates (or updates) the Napster resources: functions, FAQ collection, Omniagent, WebRTC + VoIP channels.
// Usage: node scripts/setup-agent.js [--dry-run] [--companion <id>] [--no-voip]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config.js';
import { napster, buildFunctionPayload, buildAgentPayload, FAQS } from '../src/napster.js';
import { TOOL_DEFS } from '../src/tools.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv(path.join(ROOT, '.env'));
const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const stateFile = path.join(ROOT, '.napster-state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const save = () => !dry && fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const business = process.env.BUSINESS_NAME || 'Willow Lane Clinic';
const opts = { publicBaseUrl: process.env.PUBLIC_BASE_URL, toolSecret: process.env.TOOL_SECRET };
const call = async (m, p, b) => { if (dry) { console.log(m, p, JSON.stringify(b, (k, v) => (k === 'x-tool-secret' ? '***' : v), 2)); return { id: `dry_${p}`, items: [{ id: 'dry_companion' }] }; } return napster(m, p, b); };

if (!opts.publicBaseUrl) console.warn('PUBLIC_BASE_URL not set: tools will use the implicit (browser) flow and the phone channel cannot run tools.');

// 1. companion
let companionId = arg('--companion') || state.companionId;
if (!companionId) {
  const r = dry ? { items: [{ id: 'dry_companion', firstName: 'Demo' }] } : await napster('GET', '/public/companions/napster-stock?pageSize=20');
  const pick = r.items.find((c) => c.gender === 'female') || r.items[0];
  companionId = pick.id; console.log('companion:', pick.firstName, pick.lastName || '', companionId);
}
state.companionId = companionId;

// 2. functions (replace if they exist)
state.functions ||= {};
for (const def of TOOL_DEFS) {
  const p = buildFunctionPayload(def, opts);
  const id = state.functions[def.name];
  const r = id ? await call('PUT', `/public/functions/${id}`, p) : await call('POST', '/public/functions', p);
  state.functions[def.name] = r.id || id;
}
state.flow = opts.publicBaseUrl ? 'explicit' : 'implicit';
save();

// 3. FAQ collection
if (!state.faqId) {
  const f = await call('POST', '/public/faqs', { name: `${business} FAQs` });
  state.faqId = f.id;
  for (const [question, answer] of FAQS) await call('POST', `/public/faqs/${f.id}/items`, { question, answer });
  save();
}

// 4. Omniagent
const agentPayload = buildAgentPayload({ companionId, functionIds: Object.values(state.functions), faqId: state.faqId, business });
const a = state.agentId ? await call('PATCH', `/public/agents/${state.agentId}`, agentPayload) : await call('POST', '/public/agents', agentPayload);
state.agentId = a.id || state.agentId; save();

// 5. Channels
await call('PUT', `/public/agents/${state.agentId}/channels/webrtc`, {});
if (!argv.includes('--no-voip')) {
  const v = await call('PUT', `/public/agents/${state.agentId}/channels/voip`, {
    providerSettings: { turnDetection: { threshold: 0.9, silence_duration_ms: 800 } },
  });
  state.voipEndpoint = v.voipEndpoint; save();
  console.log('VoIP webhook (set as "A call comes in" on your Twilio number):', v.voipEndpoint);
}
console.log(dry ? 'dry run complete' : `agent ready: ${state.agentId} (state in .napster-state.json)`);
