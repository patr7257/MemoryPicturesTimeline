# Family Memories (memories.patrickrobel.dk)

Private family photo timeline: scroll down memory lane through every vacation,
scrapbook style (polaroids, handwritten captions, warm paper tones), with a
vacations overview, a map, per-person filtering, notes on photos and
vacations, and a slideshow. Members only see the vacations they are tagged
on.

Live at `https://memories.patrickrobel.dk` (family login required).

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui
  (base-lyra), motion
- Better Auth: passkeys + email magic links only, no passwords; sign-in is
  limited to members invited in the app (each tied to a Person) plus the
  `SUPER_ADMIN_EMAILS` env; magic-link and invite mail via ZeptoMail
- three.js (lazy loaded) for the slideshow projector
- Neon Postgres (Drizzle ORM, `pg` Pool) for metadata
- Cloudflare R2 (private bucket) for photos: browser uploads via presigned
  PUT, sharp generates 400/1200 WebP thumbnails + blurhash at finalize,
  authenticated `/api/img/[id]/[size]` proxy streams them
- MapLibre GL + OpenFreeMap tiles (no API key) for the trip map
- Deployed as a Dokploy app (Docker) on the Hetzner VPS, Traefik + Lets
  Encrypt, auto-deploy on push to `main`

## Development

```
pnpm install
.\scripts\setup-env.ps1   # interactive .env setup (prompts for empty keys)
pnpm db:migrate
pnpm dev                  # http://localhost:3000
```

Checks: `pnpm verify` (build, type-check, tests), or each on its own:
`pnpm check-types`, `pnpm test`, `pnpm build`.
Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate` + `pnpm db:migrate`.
Auth schema (`src/db/auth-schema.ts`) is generated: `pnpm auth:generate`.

## Scripts

- `scripts/setup-env.(ps1|sh)`: create/complete local `.env`, prompts only for
  empty keys
- `scripts/save-dokploy-token.(ps1|sh)`: store a Dokploy API token at
  `~/.dokploy/token`
- `scripts/push-dokploy-env.(ps1|sh)`: push production env (from local `.env`
  + prod overrides) to the Dokploy app
