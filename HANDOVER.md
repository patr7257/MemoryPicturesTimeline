# HANDOVER.md

## Date, branch, PR, CI

2026-11-19, branch `main` (push to main = Dokploy production deploy, watch
paths cover src/public/package/Dockerfile/drizzle). The Countries feature
went in through pull requests #10 and #11, both merged. The repo has no CI
workflows: the gate is `pnpm verify` run locally. Latest deploy green, live at
`https://memories.patrickrobel.dk` (`/version.json` shows the commit).

## TLDR of session outcome

- **Countries page** (`/countries`) is live: every person has a map of
  visited countries with stats, a private wishlist, year and note per
  country, suggestions from their vacation photos, a family map, a two-person
  compare and a share-as-image button. Design:
  `docs/superpowers/specs/2026-11-19-where-have-i-been-design.md`. The facts a
  session needs are in `CLAUDE.md` under "Countries".
- **Database**: new table `person_countries`, migration applied.
- **Free vs premium list** started: `docs/free-vs-premium.md`. The model
  (photo cap plus depth features, owner pays) is decided; the row-by-row split
  is a proposal.
- **Not verified in a browser by the build**: Patrick's click-through of the
  live page was still in progress when this was written.

## Prioritized next steps

1. Finish the click-through of `/countries` on a phone and a desktop and fix
   what looks wrong. Things only a person can confirm: the globe renders and
   rotates, the flat map does not rotate on a two-finger twist, colours fit
   the theme, the Flat and Globe buttons are finger-sized, the desktop nav
   still fits at 768 px and 1024 px with its seventh tab, the share sheet
   opens on a phone and the image shows map, first name and three count lines
   with no wishlist, fast repeated taps end in the last tap's state.
2. Small follow-ups the reviews left open:
   - A view that is out of date and shows no year removes a stored year
     without asking (`confirmRemove` decides from what is shown).
   - After removing from the country card, the mark can show on the map for a
     moment until the server state arrives.
   - The note in the country card saves on blur only; closing with Escape may
     lose it.
   - The share button shows before the map has loaded and then fails with a
     toast.
   - The map container has `role="img"` around a focusable canvas.
   - Photos with no country name form one group per vacation, so a
     multi-country vacation of such photos suggests only the first country.
   - `tripId` is sent to the client with each suggestion and is unused.
   - The outer `where` of the suggestion query uses an unqualified `rn`.
3. Marking a country changes its colour at once. MapLibre does not animate
   feature-state changes; a fade would need a hand-driven animation.
4. Carried over from before this session: fix the doubtful backfilled photo
   locations by hand with the place pencil (`node scripts/fill-locations.mjs`
   reports what is left), find out whose uploads lose GPS (per-uploader query
   in the Neon SQL editor), and family onboarding (invite on the Members page,
   tag people on their vacations, add a passkey on `/account`).
5. Parked ideas: bulk "set location for selected photos", search a place by
   name in the picker (Photon), HEIC via client-side conversion, video,
   regions and cities for the countries map.

## Verbatim resume commands

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm dev
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm verify
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; node scripts/gen-country-catalog.mjs
```

## Gotchas discovered this session

- Memories has no dev or preview app on Dokploy. "Deploy it" means production.
- Production Next.js replaces the message of an error thrown in a server
  action with a generic text. Actions that must show a message return
  `{ ok: false, error }` instead (see `src/actions/countries.ts`).
- The 50m country shapes leave real city centres in the sea (Copenhagen, Nuuk,
  Lisbon). Point lookups go through `resolveKey`, which falls back to the
  nearest coast within `NEAR_COAST_KM`.
- The `world-countries` dataset flags Vatican City as a UN member. The
  catalog generator overrides it (`NOT_UN_MEMBERS`).
- Country ids in the shapes are not unique and not numbers: `036` is on both
  Australia and Ashmore and Cartier Is., and the leading zero matters.
- MapLibre does not run paint transitions for feature-state changes, and
  `maplibregl.supported` does not exist in maplibre-gl 5.
- A WebGL canvas reads back blank unless the map is created with
  `preserveDrawingBuffer: true` (needed for the share image).
- Raw `pg` returns a `date` column as a JavaScript Date; Drizzle's
  node-postgres driver returns the string. Code that slices `start_date`
  must read it through Drizzle.
- A missing space between a Tailwind utility and the next variant
  (`duration-75pointer-coarse:h-11`) drops both classes with no error.
- Still true from earlier: a Turbopack build can crash with "failed to
  receive message" (rerun `pnpm verify`); `pnpm dev` rewrites
  `next-env.d.ts` (never commit it, and after deleting a route remove
  `.next/dev`).

## Open decisions waiting on Patrick

- Notes after a member is removed or relinked: today a removed member's
  private country notes become readable by super admins, and a newly linked
  login would read the notes of the person it is linked to. Keep that, yes or
  no?
- Year limit for "year visited": UTC year (today) or Copenhagen time? With
  UTC the new year is refused for one hour after midnight on 1 January.
- Free vs premium: confirm or change the split in `docs/free-vs-premium.md`,
  and settle the questions at its end (cap size, price, trial, whether the 3D
  slideshow and "On this day" are really premium).
- Suggestions from a boat: a GPS point within 25 km of a coast suggests that
  country. Keep 25 km, yes or no?
- Carried over: bulk location setting for many photos, build it, yes or no?
  Place search in the location picker (sends the typed text to Photon by
  komoot), add it, yes or no?

## Environment state

- No dev server running, no Docker containers, no extra worktrees.
- Branch `feat/countries` is merged and deleted, local and remote.
- One Dokploy schedule on the memories app ("on-this-day push").
