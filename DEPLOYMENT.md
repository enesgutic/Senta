# Deploying Senta

Senta uses Express and Socket.IO with in-memory rooms. It needs a persistent Node.js server process so a room can stay alive while both players connect, press Start, play cards, and finish the round.

## Recommended hosts

Use a Node server host such as Render, Railway, Fly.io, or a VPS.

Typical settings:

- Build command: `npm install`
- Start command: `npm start`
- Port: the app reads `process.env.PORT` and falls back to `3000`

## Why not Vercel

Vercel deploys Node backends as serverless functions. That is not a natural fit for this version of Senta because Socket.IO sessions and the `games` object live in server memory. When function requests are split, restarted, or routed differently, a room can disappear between actions.

The visible symptom is repeated `/socket.io/` `400` responses in Vercel logs, followed by the app returning to the lobby or failing to start.

To deploy on Vercel reliably, Senta would need to be redesigned around an external realtime/state service such as Ably, Convex, Liveblocks, Pusher, Supabase Realtime, or a database-backed polling API.
