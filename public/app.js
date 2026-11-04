const $ = (s) => document.querySelector(s);
let phone = null, instance = null, flash = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mask = (p) => (p ? p.slice(0, 3) + '•••' + p.slice(-3) : '');

async function loadConfig() {
  const c = await (await fetch('/api/config')).json();
  $('#biz').textContent = c.business; document.title = c.business + ' – Front Desk';
  if (c.phoneNumber) $('#phone').textContent = c.phoneNumber;
  if (!c.agentReady) $('#status').textContent = 'Agent not configured yet (run npm run setup:agent).';
}
async function render() {
  const { bookings } = await (await fetch('/api/bookings')).json();
  $('#rows').innerHTML = bookings.map((b) => `<tr class="${b.status} ${b.id === flash ? 'flash' : ''}"><td>${esc(b.start.replace('T', ' '))}</td><td>${esc(b.service)}</td>
    <td>${esc(b.customer_name)} <span class="muted">${esc(mask(b.phone))}</span></td><td>${esc(b.channel)}</td><td>${esc(b.status)}</td><td>${esc(b.id)}</td></tr>`).join('') || '<tr><td colspan=6 class=muted>No bookings yet</td></tr>';
}
new EventSource('/api/events').onmessage = (m) => {
  const ev = JSON.parse(m.data); flash = ev.booking.id;
  $('#feed').insertAdjacentHTML('afterbegin', `<li>${new Date().toLocaleTimeString()} · ${esc(ev.type)} ${esc(ev.booking.id)} (${esc(ev.booking.channel)})</li>`);
  render();
};

// Implicit-flow tools (dev mode): run them on our backend and hand the result back to the agent.
async function onData(msg) {
  if (msg?.event !== 'function_implicitly_called') return;
  const { call_id, name, arguments: args } = msg.data || {};
  const parsed = typeof args === 'string' ? JSON.parse(args || '{}') : args || {};
  const output = await (await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: parsed, phone }) })).json();
  instance?.sendCommand({ type: 'send_function_output', data: { call_id, output } });
}

$('#start').onsubmit = async (e) => {
  e.preventDefault(); phone = $('#ph').value.trim() || null;
  $('#status').textContent = 'Connecting…';
  let returning = false;
  // SDK asks for a fresh token via getToken() (pre-minted strings are no longer accepted); it may call it again on reconnect.
  const getToken = async () => {
    const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || 'Could not start');
    returning = s.returning;
    $('#status').textContent = s.returning ? 'Welcome back! Connecting you…' : 'Connecting you…';
    return s.token;
  };
  instance?.destroy();
  instance = await window.napsterCompanionApiSDK.init(getToken, {
    layout: { type: 'inline', mountContainer: '#avatar' }, onData, debug: new URLSearchParams(location.search).has('debug'),
    onAvatarReady: () => ($('#status').textContent = 'Live. Just talk.'),
    onError: (err) => ($('#status').textContent = 'Error: ' + (err?.message || err)),
  });
};
loadConfig(); render();
