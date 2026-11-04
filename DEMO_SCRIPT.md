# Demo video script — target 2:40 (hard limit 3:00)

Record a browser at https://napster-frontdesk.onrender.com. Open `/healthz` first to wake the service. Use the 1080p screen with the mic on, and keep the avatar and the bookings board in frame.

| Time | Screen | Voice-over / action |
| --- | --- | --- |
| 0:00–0:15 | Title card "Napster Front Desk", then the site | "Small clinics lose bookings when nobody can pick up. This is Front Desk: a Napster Omniagent receptionist with a face, a voice and a memory." |
| 0:15–0:30 | Type phone +1 555 010 2030 and click Start video call | "I enter my phone number. The server mints a short-lived Napster session, so the API key never reaches the browser." |
| 0:30–1:10 | Say: "Hi, can I book a physio session this Friday morning?" The agent checks and offers slots. Pick 10:00, give the name "Mia", confirm "yes". A BK-… row appears on the board. | "She calls our check_availability tool, confirms the details out loud, and only books after I say yes. The booking appears live." |
| 1:10–1:30 | Ask: "What's your cancellation policy?" and "How much is a consultation?" | "Policies come from a Napster FAQ collection." |
| 1:30–2:05 | End the call. Start a new call with the same phone number. The avatar greets Mia by name and mentions Friday. Say: "Can you move it to 11?" The row updates. | "New session, same customer. The phone number maps to a Napster externalClientId, so memory and booking history follow her." |
| 2:05–2:20 | Say: "Actually, cancel it." The agent confirms and the row shows cancelled. | "Cancellation is confirm-first too, and the tools only let a caller change their own bookings." |
| 2:20–2:40 | Code: tool definitions in `src/tools.js`, `/api/session` in `src/server.js`, and `npm test` passing. End card with the repo URL. | "Five Napster tools, no npm dependencies, with tests. The repo and live demo links are below." |

Tips: the first reply can lag a second or two, so trim pauses in editing. If the agent mishears, retake that segment.
