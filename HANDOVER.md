# HANDOVER.md

## Date, branch, PR, CI

2026-11-14, branch `main` (push to main = Dokploy production deploy, watch
paths cover src/public/package/Dockerfile/drizzle). No open PRs. Work now
goes through short-lived feature branches and merge PRs. Latest deploy green,
live at `https://memories.patrickrobel.dk` (`/version.json` shows the commit).

## TLDR of session outcome

- **Passkeys**: the prod rpID is now `memories.patrickrobel.dk`, so Chrome no
  longer offers the Todo and Hub passkeys (rpID `patrickrobel.dk`) on the
  Memories login. Passkeys made before this need to be created again on
  `/account`.
- **Photo date** can be set or changed after upload (pencil next to the date
  on the back of the postcard). The photo moves to its new day row.
- **Vacation page**: each day is one sideways-scrolling row of equal square
  tiles (160px on a phone, 240px on PC).
- **Pins follow the cover photo** (`src/lib/trip-pin.ts`). The cover picker
  marks photos that have a location. This fixed Lissabon showing in North
  America.
- **Globe**: zoom (+/- buttons, pinch, Ctrl + scroll), a hover card docked
  on the right, hovering a pin highlights its chip, and the chips stay on one
  sideways-scrolling line.
- **Map tab** shows every GPS photo at its own spot, stacked when zoomed out
  (supercluster), with a popup linking to the photo's vacation.
- **Photo location** can be set by hand on a map (pencil next to the place on
  the back of the postcard), with "Same place as <nearest photo>".

## Prioritized next steps

1. Give the photos without GPS a location: open each one, turn it over, then
   use the place pencil and "Same place as ...". Run the Neon SQL count again
   afterwards; on 2026-11-13 only 55 of 129 photos had GPS.
2. Find out whose uploads lose GPS: run the per-uploader query in the Neon
   SQL editor (photos joined to "user" on uploader_id, grouped by uploader).
   If it is the iPhone photo picker, tell that person to turn on Location
   under Options before uploading.
3. Family onboarding: invite each member on the Members page (the invite
   mail is sent when the box is ticked), tag them on their vacations, and
   have them add a passkey on `/account`.
4. Parked ideas: bulk "set location for selected photos", search a place by
   name in the picker (Photon), HEIC via client-side conversion, video.

## Verbatim resume commands

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm dev
```

```powershell
cd "C:\Users\pr\repos\1-Personal\MemoryPicturesTimeline"; pnpm verify
```

## Gotchas discovered this session

- A vacation's stored `trips.lat/lng` comes from the FIRST GPS photo
  uploaded, so one stray photo used to misplace the pin. The pin is now
  derived from the cover photo on read; `trips.lat/lng` is only a fallback.
- Passkeys are scoped by rpID. Two apps on the same rpID show each other's
  passkeys in the browser picker, and a wrong pick fails sign-in.
- Location and date come from EXIF read in the browser. The iPhone photo
  picker can strip GPS while keeping the date, and nothing on the server can
  recover it.
- A Turbopack build can crash with "failed to receive message" (internal
  timeout). It is not a code error; rerun `pnpm verify`.
- Running `pnpm dev` rewrites `next-env.d.ts` to `.next/dev/types`; never
  commit that change. After deleting a route, remove `.next/dev` or
  `pnpm check-types` fails on the stale validator.
- The Dokploy API token lives at `~\.dokploy\token`. A 401 means it was
  revoked: make a new one in the panel (Profile, API/CLI).

## Open decisions waiting on Patrick

- Bulk location setting for many photos at once: build it, yes or no?
- Place search in the location picker (sends the typed text to Photon by
  komoot): add it, yes or no?

## Environment state

- No dev server running, no Docker containers, no extra worktrees.
- All of this session's feature branches are merged and deleted, local and
  remote.
- One Dokploy schedule on the memories app ("on-this-day push").
