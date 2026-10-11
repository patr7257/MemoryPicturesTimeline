# HANDOVER.md

## Date, branch, PR, CI

2026-10-11, branch `main` (push to main = Dokploy production deploy). No PRs
in this repo. Latest deploy green, live at `https://memories.patrickrobel.dk`.

## TLDR of session outcome

- **v1 is complete and in use.** Upload works end to end on prod: an iPhone
  upload of 10 photos to the "Krakow" trip produced thumbnails and city
  labels, and Patrick confirmed it.
- R2 private bucket `family-memories` created with PUT CORS for prod and
  localhost (`node scripts/setup-r2.mjs`, re-runnable). Keys are in `.env`
  and in prod.
- Installable PWA with Web Push: push-only `public/sw.js`, `/notifications`
  page, types `photos_added`, `trip_created`, `on_this_day`, and a new
  camera/polaroid icon. Patrick installed it on iPhone and a test push
  arrived.
- Dokploy schedule "on-this-day push" (daily 09:00 Europe/Copenhagen) runs
  `POST /api/cron/on-this-day` inside the app container. A manual run
  returned 200.
- Prod bug fixed: the standalone trace missed sharp's libvips under pnpm,
  so finalize returned 500 (`ERR_DLOPEN_FAILED`). Fixed with
  `outputFileTracingIncludes` in `next.config.ts`.
- Sample trips are gone from the DB.

## Prioritized next steps

1. Family onboarding: each member signs in (magic link), adds a passkey,
   installs to the Home Screen and switches on Alerts. Extend
   `FAMILY_EMAILS` and re-run `push-dokploy-env.ps1` if someone is missing.
2. M4 leftovers: cover-photo selection on the trip page, blurhash
   placeholders in PolaroidCard/TripAlbum.
3. Optional: a read-only push health report script (the pwa-push-setup
   skill ships one by default, it was skipped here; the in-app "Send test"
   covers the transport check).
4. Parked ideas: HEIC via client-side conversion, comments/reactions,
   video support.

## Verbatim resume commands

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm dev
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; .\scripts\push-dokploy-env.ps1
```

## Gotchas discovered this session

- `push-dokploy-env.ps1` generates a FRESH `BETTER_AUTH_SECRET` on every
  run: everyone is signed out of prod after each env push.
- VAPID keys must never be rotated (kills every phone's subscription).
  `gen-vapid-keys.mjs` refuses to overwrite them. Back up `.env`.
- pnpm + Next standalone: native packages with separate binary packages
  (sharp's libvips) can be silently left out of the trace. Check with
  `find / -name "libvips-cpp*"` inside the container.
- Dokploy schedules of type `application` run via `docker exec ... sh -c`;
  the image has no curl, so the schedule command uses `node -e "fetch(...)"`.
- Local dev shares the prod DB, so pushes only send where `PUSH_SEND=1`
  (prod env only).

## Open decisions waiting on Patrick

- None.

## Environment state

- No dev server running. No local Docker containers.
- One Dokploy schedule on the memories app ("on-this-day push").
- Neon DB: auth tables, push tables, the "Krakow" trip with 10 photos.
