// Read-only live check: lists stock companions, agents and functions. Uses no conversation credits.
import { napster } from '../src/napster.js';
const c = await napster('GET', '/public/companions/napster-stock?pageSize=3');
const a = await napster('GET', '/public/agents');
const f = await napster('GET', '/public/functions');
console.log('Napster API OK. stock companions:', c.items.map((x) => `${x.firstName} ${x.lastName}`).join(', '),
  '| agents:', (Array.isArray(a) ? a : a.items || []).length, '| functions:', f.totalCount ?? (f.items || []).length);
