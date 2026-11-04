# Napster API Ignite Hackathon — submission draft (NOT submitted)

Submit at: https://4z0cb.share.hsforms.com/26QEu3DLsQ9CtPNWc1Fg1IQ (deadline Nov 30, 11:59 p.m. PT = Dec 1, 15:59 Beijing)

| Field | Value |
| --- | --- |
| Title | Napster Front Desk |
| Tagline | A receptionist with a face, a voice and a memory that books, moves and cancels appointments for small clinics. |
| Hosted demo | https://napster-frontdesk.onrender.com (free Render tier: first load can take ~50 s to wake up) |
| Repository | https://github.com/lxivlog64/napster-frontdesk |
| Demo video | https://youtu.be/DOR_2W5_VUM (unlisted, 2:31). Fallback cut: box blocks WebRTC, so it shows the live UI and real tool calls against the deployed backend, not a live avatar call. Can re-record on Mac later. |

## Written summary (≤ 500 words; ~430 below)

**What I built.** Napster Front Desk is an Omniagent receptionist for small clinics. A visitor opens the clinic's page, types their phone number and starts a video call with a lip-synced avatar. She checks real open slots, books, reschedules and cancels appointments, and answers FAQs on hours, prices and the cancellation policy. Every change appears instantly on a live bookings board next to the avatar.

**The problem.** Small clinics and B&Bs miss bookings because the person at the desk is busy. Booking widgets feel cold, and generic chatbots forget you between visits. Customers expect someone who knows them.

**How it uses the Napster API.**
- *Face and voice*: a stock Napster companion over the WebRTC channel, using the Web SDK. The API key stays on the server; the browser only receives a short-lived connection token from `POST /public/agents/{id}/connections`.
- *Tools*: five functions (`lookup_customer`, `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`), created through `/public/functions`. Their prompts make the agent confirm out loud before it books or cancels, and never invent slots or booking references. They run on the implicit flow: the SDK emits `function_implicitly_called`, the page forwards the call to the backend, and the result goes back with `send_function_output`.
- *Memory*: the backend hashes the visitor's phone number into a stable `externalClientId`, which turns on Napster's cross-session memory. It also sends a personalised `initialSpeech`, so a returning customer is greeted by name and reminded of their next booking.
- *Knowledge*: a Napster FAQ collection holds clinic policies.

**Technical decisions.**
- Node.js with no npm dependencies: `node:http` for the server and `node:sqlite` for customers, slots and bookings.
- Server-side rules: opening hours, no double-booking, slots must be in the future, and a caller can only change their own bookings (`not_owner`).
- An explicit HTTP tool route (`/tools/<name>`) protected by a shared-secret header is also included. A setup script creates the tools, FAQ collection and agent, so everything can be rebuilt.
- Unit tests cover slot rules, double-booking, ownership checks, the memory-id format and session minting.

**Demo video note.** My recording environment blocked WebRTC, so the video shows the agent's real tool calls hitting the deployed backend, not a live call.

**Tradeoffs.** I planned a phone channel through Napster's VoIP and Twilio, but cut it to keep the demo free and judge-runnable. The code path is still in the repo. The demo database lives on Render's free tier, so it resets when the service restarts.

**What's next.** Turn on the phone channel so the same agent and memory work by voice call. Then add multiple practitioners and rooms, calendar sync, reminder calls, and a digital twin of the clinic's real receptionist.

**Scope.** This is a demo clinic. The agent gives no medical advice and tells callers to contact emergency services when needed.

## Extra sections, if the form asks for them

- **How I built it**: Node 24, the Napster REST API and Web SDK, SQLite, and SSE for the live dashboard, deployed on Render.
- **Challenges**: keeping tool calls fast and confirm-first; scoping tools to the caller's own bookings; minting sessions without exposing the key; and dropping the paid phone line while keeping the design channel-agnostic.
- **What I learned**: the persona, tools, memory and FAQ are configured once in the API and then work on every channel.
