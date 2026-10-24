# Type Drift Cloudflare API fallback

Render remains the primary API. This Worker is an independent fallback that writes to the existing Neon production project (`mofumitsu` / `neondb`); do not create a new Neon project.

## Fallback routes

- Bottles: list, publish, delete, reactions, replies, poll votes
- Notifications: unread list and mark read/read all
- Consultation entries, question prompts, plaza message/chain history
- Presence join/heartbeat/leave/online count, activity events, and feedback
- Worm ranking and `/api/health`

Guest-key ownership (`X-Guest-Key`) is shared across both APIs. OAuth/profile writes remain Render-only: a Render session cookie cannot authenticate on a separate `workers.dev` domain. A shared token or custom-domain auth bridge is needed for signed-in continuity.

## Deploy

```bash
cd cloudflare/type-drift-api
npm ci
npx wrangler login
npx wrangler secret put DATABASE_URL
npm run deploy
```

Use the existing Neon production connection string as the Worker secret. Never commit or paste it into chat. The deployed Worker URL is `https://type-drift-api-fallback.mitsuki-momoka.workers.dev`.

In Vercel, keep `NEXT_PUBLIC_API_URL=https://type-drift-api.onrender.com`, add `NEXT_PUBLIC_FALLBACK_API_URL=https://type-drift-api-fallback.mitsuki-momoka.workers.dev`, then redeploy the frontend. `ALLOWED_ORIGIN` is set for `https://type-drift.vercel.app`; add preview/custom frontend origins if required.
