# HANDOVER.md

## Date, branch, PR, CI

2026-07-28, branch `main` (only branch; push to main = Dokploy production
deploy). No PRs in this repo. Latest deploy: green, live at
`https://memories.patrickrobel.dk`.

## TLDR of session outcome

- Planned the whole project (spec in the plan file, decisions locked with
  Patrick), then built and DEPLOYED it in one overnight session.
- **M1 done + verified on prod**: Next.js 16 scaffold, Better Auth with
  passkeys + magic links (no passwords), FAMILY_EMAILS allowlist, ZeptoMail
  mail, Neon DB (`family-memories`), Dockerfile, Dokploy app with Traefik TLS
  at memories.patrickrobel.dk, auto-deploy on push to main.
- **M2 code done, NOT end-to-end tested**: full upload pipeline (presigned PUT
  to R2, sharp 400/1200 WebP + blurhash, EXIF, reverse geocode, idempotent
  finalize, authenticated img proxy). Blocked ONLY on R2 bucket + credentials
  (do not exist yet).
- **M3 done + verified locally**: scrapbook timeline (sticky year markers,
  scroll beam, polaroid clusters, person stickers), trip album with lightbox,
  trip edit, people management. Local E2E pass with a real session: sample
  trips SSR-render grouped by year.
- **M4 mostly done**: MapLibre trip map with polaroid pins + popups, person
  filter chips on timeline and map, header nav, empty states, favicon.
  Leftover: cover-photo selection UI and blurhash loading placeholders.
- 2 sample trips ("Sample: ... delete me") were seeded for QA.

## Prioritized next steps

1. Create the Cloudflare R2 bucket (needs Patrick: Cloudflare account login).
   Private bucket `family-memories`, API token "Object Read & Write" scoped to
   it, CORS PUT from `https://memories.patrickrobel.dk` + `http://localhost:3000`
   with AllowedHeaders [Content-Type]. Then run setup-env (fills R2 keys) and
   push-dokploy-env, redeploy not needed (env restart only: Dokploy restarts
   the service on env save).
2. Test the upload pipeline end-to-end: upload ~10 photos (some with GPS) from
   PC and phone, check thumbs/rows/city labels, img proxy 401 in incognito.
3. Visual QA of the timeline/map on prod, then delete the two sample trips via
   their edit pages.
4. Real login round on prod (magic link + add passkey per device) for the
   whole family; extend FAMILY_EMAILS via push-dokploy-env if needed.
5. M4 leftovers: cover-photo selection on the trip page, blurhash placeholders
   in PolaroidCard/TripAlbum.
6. Later ideas parked: HEIC via client-side conversion, Timehop-style "on this
   day", comments/reactions, video support (photos.mediaType column plan).

## Verbatim resume commands

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; .\scripts\setup-env.ps1
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; .\scripts\push-dokploy-env.ps1
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm dev
```

## Gotchas discovered this session

- Neon org is Vercel-managed: `neonctl projects create` fails ("managed by
  Vercel"); create DBs with `vercel integration add neon -m region=fra1 ...`.
- Vercel `env pull` returns Sensitive-type values as EMPTY: ZeptoMail token
  had to come from Patrick, not from `vercel env pull`.
- Dokploy `application.saveBuildType` requires `herokuVersion`/`railpackVersion`
  present (send null); `project.create` response is not the project object,
  re-fetch via `project.all`.
- Dokploy watch paths use dot-excluding globs: `public/**` did NOT match
  `public/.gitkeep`, so that push never triggered a webhook deploy.
- Next.js standalone Docker: repo MUST contain `public/` or the image build
  fails at COPY (git does not track empty dirs).
- typedRoutes: adding a page requires one `pnpm build`/dev before
  `pnpm check-types` accepts new Link hrefs.
- Better Auth POSTs require an Origin header (403 otherwise); magic-link
  tokens land in the `verification` table, which enables scripted local E2E
  login (one stray sign-in email goes to the inbox).
- .NET file APIs (`[IO.File]::ReadAllLines`) resolve relative paths against
  the process start dir, not the shell location: absolute paths always.

## Open decisions waiting on Patrick

- R2: OK to create the bucket on your Cloudflare account (do you have one?),
  or should photos go elsewhere (Vercel Blob paid, B2, ...)?
- FAMILY_EMAILS: is the current allowlist complete for launch?
- Sample trips: delete after QA (yes/no; they are marked "delete me").

## Environment state

- Dev server stopped, port 3000 free. No Docker containers locally. No cron
  jobs. Keep-awake restored + PC put to sleep at session end (leave-pc-running
  finish mode).
- Prod running on the VPS: memories container ~82 MiB, VPS has ~1.5 GB RAM
  available.
- Neon DB contains: auth tables (Patrick's user + passkey), 2 sample trips,
  no photos. R2 env vars are EMPTY in prod (upload page will answer 503 until
  step 1).
- One stray "Your Family Memories sign-in link" email in patr7257@gmail.com
  from the local E2E test: ignore it.
