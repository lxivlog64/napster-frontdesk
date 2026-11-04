# Front Desk Omniagent (Napster API)

A phone + video receptionist for small clinics and B&Bs. One Napster Omniagent with a face, a voice and memory
answers **web video calls** (WebRTC, Web SDK) and **phone calls** (Napster VoIP via Twilio), checks open slots,
books / reschedules / cancels appointments in a SQLite store, and recognises returning customers.

## How it uses the Napster API
| Napster feature | Where |
| --- | --- |
| Companion (2D avatar, lip-sync) + voice `shimmer` | `scripts/setup-agent.js` picks a stock companion |
| Omniagent with `providerSettings.instructions` | `src/napster.js` `buildAgentPayload` |
| Tools (`POST /public/functions`) with "Use when / Do NOT use when / confirm first" prompts | `src/tools.js` `TOOL_DEFS` |
| Explicit HTTP tools → `POST /tools/<name>` (5 s limit, `x-tool-secret` header) | `src/server.js` |
| Implicit tools via Web SDK `function_implicitly_called` → `send_function_output` (dev mode) | `public/app.js` |
| Cross-session **memory** via `externalClientId` (phone hashed to `c_<24 hex>`, matches `^[A-Za-z0-9_-]{1,32}$`) | `src/server.js` `/api/session` |
| `externalClientProfile` + personalised `initialSpeech` for returning customers | `src/server.js` |
| **Caller ID** on VoIP: `metadata.external_client_id` (E.164) → customer lookup | `src/tools.js` `callerFromMetadata` |
| VoIP channel with phone-tuned turn detection (800 ms silence) | `scripts/setup-agent.js` |
| FAQ collection (hours, prices, policy) | `src/napster.js` `FAQS` |

## Run locally
```bash
# key is read from NAPSTER_API_KEY or ~/.secrets/napster_api_key (never logged)
npm test                 # 9 tests, no network
npm run verify:api       # read-only live check, no conversation credits
npm run setup:dry        # print every Napster request without sending
npm run setup:agent      # create/update functions, FAQ, agent, webrtc + voip channels
npm start                # http://localhost:3000
```
No npm dependencies: Node ≥ 22.13 (`node:sqlite`, `node:test`). The Web SDK loads from jsDelivr.

## Deploy (needs a public URL for phone)
1. Deploy (e.g. `render.yaml`), set `NAPSTER_API_KEY`, `TOOL_SECRET`, `PUBLIC_BASE_URL`, `NAPSTER_AGENT_ID`.
2. Re-run `npm run setup:agent` with `PUBLIC_BASE_URL` set → tools switch to the explicit flow pointing at `/tools/<name>`.
3. In Twilio, set the printed `voipEndpoint` as the number's "A call comes in" webhook; set `DEMO_PHONE_NUMBER`.

Without a public URL the tools run implicitly in the browser, so web video works but phone calls can't execute tools.

## Layout
```
src/config.js   env + key loading      src/store.js  SQLite bookings, slots, customers
src/tools.js    tool defs + dispatcher src/napster.js API client + payload builders
src/server.js   HTTP: /tools/*, /api/session, /api/bookings, /api/events (SSE), static
public/         avatar embed + live bookings dashboard
scripts/        setup-agent.js, verify-api.js
test/           node:test suites
```

## Limits / honest notes
- Demo data: fixed hours (Mon–Sat 9–17), three services, single practitioner, server-local time zone.
- SQLite on free hosting disks is ephemeral; use a persistent disk for real use.
- `/api/tools` (dev bridge) is unauthenticated, like a public booking form; ownership checks use phone numbers.
