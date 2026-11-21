# HANDOVER.md

## Date, branch, PR, CI

2026-11-21, branch `main` (push to main = Dokploy production deploy, watch
paths cover src/public/package/Dockerfile/drizzle). The families release went
in through one pull request. The repo has no CI workflows: the gate is
`pnpm verify` run locally. Live at `https://memories.patrickrobel.dk`
(`/version.json` shows the commit).

## TLDR of session outcome

- **Families**: people are grouped into families, set up by super admins on
  `/family`. A member sees only the people and country maps of their own
  families, and the vacations they created, are tagged on or had shared with
  them. Design: `docs/superpowers/specs/2026-11-21-families-design.md`. The
  facts a session needs are in `CLAUDE.md` (Families, Tagging and sharing,
  Filter, Person colours, Auto-visited, Countries).
- **One filter** (family chips, then names) on timeline, map, vacations,
  slideshow and countries. No "Everyone".
- **Countries**: globe colour glitch fixed (the shapes file needed unwrapping
  at the antimeridian, which also fixed the server putting the far north in
  Russia), hover tint, a tap only opens the card, several people in one view
  with a colour each, countries filled in from vacations.
- **`/family`** replaces `/people` and `/members`; **`/settings`** (gear icon)
  holds Alerts. The old routes redirect.
- **Archive import**: old vacations back to 2000 were created with photos and
  video stills from two USB drives. Each such vacation has a note saying
  which folder or DVD and which minutes its pictures came from.
- **Database**: migration applied (families, family links, vacation shares,
  person colour). The two families, the colours and the first auto-visited
  marks are in place.

## Prioritized next steps

1. Have one family member who is not a super admin sign in and confirm what
   they see: only their own family on `/family`, in the filters and on
   `/countries`; no vacation they are not tagged on or shared into.
2. Invites: on `/family`, People tab, use Resend for the members who never
   signed in, and click Resend on your own row once to confirm the invite
   mail itself arrives (sign-in mail is proven, the invite template is not).
3. Check the guesses from the archive import and correct them in the app:
   places and dates of the video vacations (no date on the tapes), the
   Campingferie 2001 place (set to Harzen from the footage), and whether
   every tagged person was really on each old vacation (the ski trips are
   tagged with the whole family and marked France for all of them).
4. Add photos to the vacations that have none yet; their notes say where to
   look.
5. Carried over: fix the doubtful backfilled photo locations by hand with the
   place pencil (`pnpm fill-locations` reports what is left), and find out
   whose uploads lose GPS (per-uploader query in the Neon SQL editor).
6. iOS app: the plan from family web app to paid App Store app is in
   `docs/ios-roadmap.md` (decisions, phases A to D, open decisions,
   accountant questions). Start with its open decisions, then Phase A.
7. Parked ideas: a fade when a country is marked, the share image layout,
   bulk "set location for selected photos", place search in the picker
   (Photon), HEIC via client-side conversion, video, regions and cities for
   the countries map, a committed script for importing from an archive folder
   (this session used one-off scripts that were not kept).

## Verbatim resume commands

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm dev
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm verify
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm backfill:visited
```

## Gotchas discovered this session

- An editor that has `.env` open writes its own older copy back over any tool
  that changes the file. Close the file (or save from the editor) before
  blaming the tool.
- `scripts\push-dokploy-env.ps1` replaces the whole production env from the
  local `.env` and makes a new auth secret, which signs everyone out. Run it
  only on purpose, and only when the local file has every key.
- A vacation's own place (`trips.lat`, `trips.lng`) is the spot of the first
  GPS photo ever uploaded to it and can be wrong on a vacation that has
  photos. Auto-visited therefore uses it only when a vacation has no located
  photo.
- `world-atlas` 50m shapes are stitched across the antimeridian and cut open
  at the pole. Anything that draws or tests points against them must go
  through `src/lib/antimeridian.ts` first.
- To run the app's TypeScript modules from plain Node (a one-off check
  against the database): `node --import tsx`, plus a stub for the
  `server-only` import. Do not add the `react-server` condition: `next`
  modules then fail to load.
- `pnpm exec next typegen` regenerates the typed routes without a full build
  when `pnpm check-types` fails on a new route's href.
- Raw `pg` writes a JavaScript Date in the machine's time zone. A camera wall
  clock goes in as text (`'2012-05-17 10:00:00'`), never as a Date.
- Old cameras lie: one camera in the archive ran a year behind for two
  years, and action cameras reset their clock. Check a folder's dates against
  its name before trusting EXIF.
- A fresh worktree that was moved needs `CI=true pnpm install` (a plain
  install aborts without a terminal).
- Still true from earlier: production Next.js hides the message of an error
  thrown in a server action (return `{ ok: false, error }`), a Turbopack
  build can crash with "failed to receive message" (rerun `pnpm verify`), and
  `pnpm dev` rewrites `next-env.d.ts` (never commit it).

## Open decisions waiting on Patrick

- Free vs premium: the split in `docs/free-vs-premium.md` is confirmed. Still
  to settle before anything is charged: the questions at its end (cap size,
  price, trial, the current family).
- A committed, tested script for importing photos and video stills from an
  archive folder: build it, yes or no?
- Carried over: bulk location setting for many photos, build it, yes or no?
  Place search in the location picker (sends the typed text to Photon by
  komoot), add it, yes or no?

## Environment state

- No dev server running, no Docker containers, no extra worktrees.
- All feature branches are merged and deleted, local and remote.
- One Dokploy schedule on the memories app ("on-this-day push").
