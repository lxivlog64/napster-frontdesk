# Front Desk Omniagent — a receptionist that picks up the phone and remembers you

**The problem.** Small clinics and B&Bs miss calls all day. The owner is with a patient or a guest, the phone rings out, and the booking goes to a competitor. Chatbots don't help: many of these customers phone, and they expect a person who knows them.

**What it does.** Front Desk is one Napster Omniagent — a face, a voice and a memory — that works the front desk on two channels at once:

- **Web video call**: a visitor on the clinic's site talks to a lip-synced avatar receptionist through the Napster Web SDK.
- **Phone**: the same agent answers a real phone number through Napster's VoIP channel (Twilio webhook), with turn detection tuned for phone audio.

On both channels it checks open slots, books, reschedules and cancels appointments, and answers FAQs (hours, prices, cancellation policy) from a Napster FAQ collection. Every change appears instantly on a live bookings dashboard next to the avatar.

**Memory that follows the customer across channels.** On a phone call, Napster passes the caller's number to every tool call, so the agent looks the caller up before they say their name ("Hi Mia, you're booked for physio on Tuesday at nine — is this about that?"). On the web, the backend hashes the visitor's phone into a stable `externalClientId`, which switches on Napster's cross-session memory, and passes a personalised `initialSpeech` so a returning customer is greeted by name. The booking history and notes ("prefers mornings") live in our own SQLite store, so a customer who calls today and opens a video call tomorrow is recognised either way.

**How it's built.**
- Node.js with no npm dependencies: `node:sqlite` for bookings, slots and customers, and `node:http` for the server.
- Five Napster tools — `lookup_customer`, `check_availability`, `book_appointment`, `reschedule_appointment` and `cancel_appointment` — are created through `POST /public/functions`. Their prompts follow Napster's guidance: look up the caller silently, say a short phrase while checking, and confirm out loud before any booking or cancellation.
- With a public URL the tools run on the explicit HTTP flow, protected by a shared-secret header and kept inside the 5-second limit. Without one, they run on the implicit flow through the Web SDK (`function_implicitly_called` → `send_function_output`).
- A setup script picks a companion and creates the tools, FAQ collection and agent, then enables the WebRTC and VoIP channels.
- The API key stays on the server; the browser only ever gets the short-lived session token.
- Tests cover slot rules, double-booking, ownership checks, caller-ID handling, memory-id format and session minting.

**What's next.** Multiple practitioners and rooms, a calendar sync through Napster's Google Calendar connector, outbound SIP reminder calls, and a digital twin of the real receptionist.

**Honest scope.** This is a hackathon demo: one practitioner, fixed opening hours and demo services. It gives no medical advice and tells callers to ring emergency services when needed.
