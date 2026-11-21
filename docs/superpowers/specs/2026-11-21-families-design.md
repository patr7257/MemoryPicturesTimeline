# Families: design

Families, sharing, one filter everywhere, per-person colours, auto-visited
countries, and a round of fixes to the Countries page. One release.

## Intent

Memories started as one family. It now holds more than one, and they should
not see each other's people, vacations or country maps unless someone shares
on purpose. Super admins see everything and need to filter by family. The
same release fixes what Patrick found when clicking through the Countries
page and settles the small follow-ups its reviews left open.

## Decided by Patrick

- **Families**: a family is a named group of People. A person can be in
  several families. Only super admins create families and assign people.
- **Vacations stay tagged-only**: a vacation is seen by super admins, its
  creator and the people tagged on it, as today. Being in the same family
  does not show a vacation.
- **Share with people**: new. A vacation can be shared with picked people,
  who then see it without being tagged. The picker is a plain multi-select
  that offers people from the sharer's own families only.
- **Country maps follow families**: a member sees the maps of people in their
  own families only.
- **Family page**: `/family` replaces `/people` and `/members`. For non-admins
  it is read-only and shows their own families only: no invites, no edits, no
  removals. Super admins get two tabs, `#families` and `#people`, holding all
  the logic of the two old pages plus family assignment.
- **Creating a person** is for super admins only (today any member can add a
  person while tagging).
- **Settings**: the "Alerts" tab becomes an icon-only gear, "Settings".
  Alerts is one section of the settings page; more can follow.
- **Filters**: one behaviour on every page. Tap a chip to select, tap again
  to deselect, on phone and desktop. No "Everyone" option anywhere. Family
  chips narrow the name chips:

  ```
  [ Family A ] [*Family B*]                 <- families (toggle)
  [ Ann ] [*Bo*] [ Cy ] [ Di ] [ Ed ]       <- people of the selected families

  Family B on, Bo on     -> Bo only
  Family B on, no names  -> the whole of family B
  nothing on             -> everything the viewer may see
  ```

- **Colours**: when several people are shown on the countries map, each
  person has their own colour and countries visited by more than one of them
  get a separate "Shared" colour. Each person has a base colour, set on
  `/family`, and no two people have the same one.
- **Countries map**: a tap or click on a country opens its card and marks
  nothing. A country becomes Visited only through the "Visited" button in the
  card (or its checkbox in the list). On a desktop the hovered country is
  tinted so the right one is easy to hit.
- **Auto-visited**: a country found in the GPS photos of a vacation a person
  is tagged on is marked Visited on that person's map automatically. A
  country the person removes stays removed.
- **Globe glitch**: the colour wedge over the North Atlantic must go.
- **One release**: everything ships together on one branch.
- **Private notes stay with the Person**: whoever is linked to a person reads
  that person's country notes; with no login, super admins do. No change.
- **Year limit uses Copenhagen time**: the newest year accepted for "year
  visited" is the current year in Copenhagen, not in UTC.
- **Nearest coast rule stays** at its current distance (`NEAR_COAST_KM`).

## Goals

- A member never learns that another family's people, maps or unshared
  vacations exist.
- A super admin can set up and change families without touching the database.
- Every person filter looks and behaves the same.
- The countries map is correct on flat and globe and pleasant to click.

## Non-goals

- Members creating families, inviting people or removing access.
- Sharing a vacation with a family as such (it is always picked people).
- A consent flow for being added to a family.
- An entitlement system. `docs/free-vs-premium.md` gets the new rows only.
- A "view as another member" tool.
- Dark mode, regions or cities on the map.

## Anti-goals

- A people list, a filter chip, a country map or a count that reveals a
  person outside the viewer's families. One exception, below: names of the
  people tagged on a vacation the viewer can open.
- A read that fetches rows the viewer may not see and drops them in code,
  where the column is private (`note`) or the row is private (wishlist,
  dismissed). The existing countries rules keep holding.
- A member locked out of their own data at deploy time because families were
  not assigned yet.
- `maplibre-gl`, the shapes or `three` in a first-load bundle;
  `Math.random()` in a render path.

## Approaches

**Who sees a vacation**

1. Family-wide: everyone in the tagged people's families sees it. Simple to
   explain, but wider than today, and a vacation with one tagged person would
   open to the whole family.
2. Tagged only, plus explicit shares (chosen). Nothing gets wider by itself;
   sharing is a deliberate act per vacation.
3. Tagged only, no sharing. Leaves no way to show a vacation to family who
   stayed home.

**How families relate to people**

1. A `family_id` column on `people`. One family per person; cannot express
   someone in two families.
2. A join table `family_people` (chosen). Many to many, matches
   `trip_people`.

**How auto-visited is produced**

1. Derive on read from photos every time a map is drawn. Always current, but
   a point-in-polygon pass per person per page view, and "stays removed"
   still needs stored rows.
2. Write ordinary `visited` rows when tags, photos or locations change, plus
   a backfill (chosen). Reads stay as cheap as today, and a removal is a
   stored `dismissed` row, which already exists.

**Release shape**

Patrick chose one release over phases. To keep that safe the rollout has an
order (see Rollout): the additive migration first, then families assigned
through the new page running locally against the shared database, then the
deploy that starts enforcing.

## Data model

One additive migration. No column or table is dropped or renamed.

| Table | Columns | Notes |
|---|---|---|
| `families` | `id` uuid PK, `name` text unique, `created_at` | |
| `family_people` | `family_id` FK cascade, `person_id` FK cascade | composite PK |
| `trip_shares` | `trip_id` FK cascade, `person_id` FK cascade, `shared_by` FK user set null, `created_at` | composite PK (`trip_id`, `person_id`) |
| `people` | new `color` text, nullable, unique | a key of the fixed palette |

`person_countries` does not change.

Builder's calls:

- The palette is a fixed list of colours in code (`src/lib/person-colors.ts`):
  each has a key, a name and an rgb or hex value (MapLibre cannot parse
  oklch). It needs clearly more entries than there are people today, every
  entry readable against the land colour and distinct from the wishlist
  colour, the hover tint and the "Shared" colour. Use the `dataviz` skill to
  validate it.
- The migration adds the column and writes no colours. A person without a
  colour is a valid state in production (people created by the code that is
  live before the deploy, or a palette that ran out): they are drawn in a
  fallback picked from a stable order, never at random. Creating a person
  gives them the first free palette colour, and the People tab has one
  action that gives every person without a colour a free one.
- "Shared" is one fixed theme colour, not editable. My call: Patrick asked
  for editable colours per person; a global setting for one more colour did
  not seem worth a settings table.

## Access rules

All new rules are pure functions in `src/lib/access-policy.ts` with unit
tests; lookups live in `src/lib/access.ts`.

The `Viewer` gains `familyIds` (the families of the viewer's person; empty
when the login has no person).

- `canSeePerson(viewer, person)`: a super admin; the viewer's own person; or
  the person shares at least one family with the viewer.
- `canSeeTrip`: as today, plus: the viewer's person is in the vacation's
  shares.
- `canSeeCountries(viewer, person)`: becomes `canSeePerson`. Editing and the
  note rules do not change.
- `canShareTrip(viewer, trip)`: a super admin, the creator, or a person
  tagged on it. My call: the people who went may show it to their family.
  Someone it was shared with cannot share it on.
- Share targets: people in the sharer's own families (a super admin: anyone).
  The server checks every target, not only the picker.
- Tagging targets: people the viewer can see, plus people already tagged on
  that vacation, who stay as they are. A super admin can tag anyone, which is
  how a vacation with people from two families comes about.
- Creating, renaming and deleting a person, and setting a colour: super
  admins only.

What a member can learn about people outside their families: whatever is on
a vacation they can open, which is the names of the people tagged on it and
of those who uploaded or commented there. Who shared it is not shown. Those
people never show up in filters, in `/family` or on the countries page.

A tagged person from another family may share the vacation with their own
family; that is the intended way for a mixed vacation to reach both
families.

A person in no family sees themselves only and can tag only themselves until
a super admin assigns a family. A login with no person sees no people and no
country maps, and gets the existing line saying an admin must link them to a
person. A super admin with no person sees every family and every person; on
the countries page they start on the empty map with the line asking to pick
someone, and may edit any map as today.

Every query that lists people takes the viewer and filters in SQL. The recon
found these readers of the whole `people` table: timeline, map, vacations,
vacation edit, vacation create and quick edit, upload, slideshow, countries,
and the two old admin pages. `getVisitedByPerson` takes ids only today; it
must refuse ids the viewer may not see.

Push: the audience of a vacation's pushes is everyone who can see it, so
people it is shared with are included (`tripAudienceUserIds`) for pushes sent
after the share. Sharing itself sends no push.

Also fixed here: `/api/upload/presign` checks the session only. It must go
through `getViewerOrNull` like every other route, so a removed member with a
live session cannot presign an upload.

## Family page

Route `/family`. `/people` and `/members` redirect to it; a link that carried
`/members?invite=<personId>` lands on the People tab with the invite form
for that person.

Non-admin, read-only:

```
Family

Family B
  (o) Ann        (o) Bo        (o) Cy
Family C
  (o) Bo         (o) Flo
```

The dot is the person's colour. No emails, no roles, no buttons.

Super admin, two tabs selected by the URL hash:

- `#families`: create, rename and delete a family; for each family a
  multi-select of its people. Deleting a family removes the grouping, never
  the people. A list of people who are in no family.
- `#people`: everything the two old pages did, once: create, rename and
  delete a person; colour (palette swatches, taken ones disabled); families
  of the person; invite, resend, remove login; role; link and relink a login
  to a person; the env-only logins. A new person is created with their
  families picked in the same form.

The duplicated helpers (`requireAdmin`, the people queries, the member to
person mapping, the style constants, the two "create person" forms) are
merged as part of the move.

## Navigation and settings

- Desktop bar: Timeline, Vacations, Add photos, Map, Countries, Family, then
  a gear icon with no text (accessible name "Settings") to `/settings`.
- Phone: the "More" sheet lists Countries, Family, Settings, Account, Sign
  out. The separate "Members" item goes away from the sheet and from the
  account menu.
- `/settings`: a page of sections. The first and only section is Alerts,
  which is today's notifications page content unchanged. `/notifications`
  redirects to `/settings`. The button on `/account` points to `/settings`.

## Filters

One component, used on `/timeline`, `/map`, `/countries`, `/vacations` and
`/slideshow`. The vacations page uses a select with "Everyone" today and the
slideshow has its own chips and its own copy of the toggle helpers; both move
to the shared component and the shared helpers.

URL: repeated `family` and repeated `person` params. `src/lib/person-filter.ts`
already parses and toggles `person` (with a cap on how many ids a URL may
carry); it is extended with `family` and with one pure function, unit tested,
that gives the meaning. The cap limits the ids in the URL, not the size of a
family picked through its chip:

- Family chips: the viewer's families (a super admin: all). The row is hidden
  when the viewer has fewer than two.
- Name chips: the members of the selected families, or every person the
  viewer can see when no family is selected.
- Effective people: the selected names; if none, the members of the selected
  families; if none, no filter.
- Turning a family off drops the selected names that are in no other
  selected family.
- Ids the viewer may not see are ignored, as unknown ids are today.

On timeline, map, vacations and slideshow, "no filter" means everything the
viewer may see, and a filter means vacations with any of the effective
people tagged.

On countries:

- The bare URL shows the viewer's own map with their own chip on.
- Turning the last chip off shows an empty map with a line asking to pick a
  person or a family. Builder's call how the URL tells "bare" from "nothing
  picked".
- One effective person: that person's map, editable when the viewer may edit
  it, exactly as the single view today, in the theme's visited colour.
- Two or more: each country visited by exactly one of them in that person's
  colour, each country visited by more than one in the "Shared" colour. The
  legend lists every shown person and "Shared", so colour is never the only
  cue. The view is read-only. A tap on a country opens a read-only card
  naming who has visited it. Stats show a count per person, the shared count
  and the total.
- This replaces the compare view and the union view, and the "Me" and
  "Family" chips.
- Only `visited` rows are ever read for a multi-person view, also for the
  viewer's own person.

## Share with people

On the vacation page and its edit form, for anyone who may share it: a
"Share with people" multi-select listing the allowed targets, with the
current shares ticked. Saving replaces the vacation's shares with the ticked
set, limited to targets the saver may pick; shares to people outside the
saver's families (made by someone else) are left untouched and not shown.

A shared vacation behaves like any visible vacation for that person
(timeline, map, photos, comments, slideshow, pushes). It does not tag them:
no auto-visited country, and filtering on that person does not match it.

## Countries page changes

- **Tap opens, never marks.** `pick` no longer writes. The card for an
  unmarked country offers "Visited" and "Want to go"; nothing is stored until
  one is pressed. The list checkbox still marks directly.
- **Hover tint.** Where a real pointer can hover, the hovered country gets a
  tint through a `hover` feature state. It is cleared before a share capture.
- **Antimeridian fix.** The shapes file is stitched across the antimeridian:
  the mainland ring of Russia runs straight from +180 to -180, the map treats
  coordinates as planar, and the triangulation covers the North Atlantic. A
  pure function unwraps such rings (add 360 to the negative longitudes of a
  ring that crosses twice) before the shapes reach the map. Fiji has the same
  shape of problem; Antarctica circles the pole and needs its ring opened and
  closed along the pole. Unit test on the converted shapes: no ring has a
  step of more than 180 degrees between neighbours. The function must not
  import the map library, so the test and the server can use it. Check
  whether `src/lib/country-lookup.ts` (point in polygon on the server) needs
  the same unwrapped rings and say what was found.
- **Per-person colours.** Fill colour comes from data: the colour string is
  written to feature state and read in the paint expression. Verify the
  expression against the installed MapLibre before building on it.
- **Review follow-ups.**
  - Removing: the client tells the server whether the person confirmed. A
    removal that was not confirmed is refused when the stored row has a year
    or a note the viewer may read, with a message asking to reload. This
    closes the stale view case.
  - Removing from the card closes the card and clears the fill in the same
    transition, so no mark lingers.
  - Year and note are saved when the card closes by any route (Escape,
    backdrop, close button), not on blur only.
  - "Share map" is disabled until the map and its shapes are in.
  - The map wrapper stops being `role="img"` around a focusable canvas; it
    becomes a labelled group.

## Auto-visited

- A vacation's countries: the countries its GPS photos fall in, plus the
  country of the vacation's own place (`trips.lat` and `trips.lng`) when it
  has one, so an old vacation without photos still counts once its place is
  set. Found with the existing point-in-country lookup (nearest coast rule
  included, inferred locations included). Every distinct place counts: the old
  "a few points per country name" sampling is replaced by distinct rounded
  coordinates, so a multi-country vacation without country names yields all
  its countries.
- For every person tagged on the vacation and every such country: insert a
  `visited` row with the vacation's start year, unless a row for that person
  and country exists in any status. Existing rows are never changed.
- It runs after a vacation's tags change, after an upload batch is finalized
  and its locations inferred, and after a photo's location is set by hand or
  by the backfill script. It runs off the request path where the framework
  allows and never fails the request it follows.
- **Removing stays removed.** Removing a `visited` country no longer deletes
  the row: it becomes a `dismissed` row with year and note cleared. The
  existing confirmation before a year or a note is lost, and the rules about
  who may remove (the private note rule included), do not change. A
  dismissed country can be marked again by hand at any time. This is why no
  new column is needed. Removing a wishlist row is still a plain delete:
  taking a country off the wishlist says nothing about having been there.
- `dismissed` rows that exist already (suggestions someone dismissed) count
  the same way: that person said no to that country, so it is not added.
- Nothing is removed automatically when a person is untagged or a vacation
  is deleted. My call: a mark may have a year or a note by then.
- A backfill script walks all vacations in start date order: dry run first
  that prints what it would add per person, then an apply mode.
- The suggestion chips, their query and their helpers are removed: there is
  nothing left to suggest. That also retires three review follow-ups (the
  sampling of photos without a country name, the unused `tripId`, the
  unqualified `rn`).

Accepted by Patrick: a person's map is seen by their families, and it now
fills from every vacation they are tagged on, including vacations their
family cannot open. The earlier design accepted that a mark can hint at a
hidden vacation, but then the person chose each mark. Now it happens by
itself; the person can remove it afterwards.

## Rollout

Local development and production share one database, and there is no
preview environment. Order:

1. Everything is built on one branch, behind a draft pull request, with the
   full gate green.
2. On Patrick's go: the additive migration runs. The code in production does
   not know the new tables and keeps working.
3. Patrick runs the branch locally against the shared database, creates the
   families, assigns people and colours on `/family`, and clicks through the
   release as a super admin.
4. On Patrick's go: the auto-visited backfill, dry run first.
5. On Patrick's go: merge, which deploys. Enforcement starts with families
   already in place.

What a super admin cannot see locally is the member's view. The policy tests
carry that, and after the deploy a family member should confirm what they
see.

## Tests

- Policy: `canSeePerson` (super admin, self, shared family, other family, no
  family, login with no person); `canSeeTrip` with and without a share;
  `canShareTrip`; share and tag targets.
- Filter: the pure resolution function, every row of the chip example above,
  ids the viewer may not see, a person in two families.
- Countries: the per-person and shared partition; removal becomes dismissed;
  the unconfirmed removal refusal; the existing tier tests keep passing.
- Auto-visited: the pure part (points to countries to rows to insert) with a
  fake store: existing rows of any status are left alone, a dismissed
  country is not added again, earliest vacation gives the year.
- Shapes: no ring with a step over 180 degrees after the fix.
- The database-backed lookups in `src/lib/access.ts` have no tests today.
  Their decisions move into pure functions that are tested; the SQL stays
  thin.
- Every change to `src/lib/country-queries.ts`,
  `src/lib/country-actions-core.ts`, `src/lib/access-policy.ts` or
  `src/lib/access.ts` gets an independent review.

## Left to the builder

- File and component names, how the shared filter is fed on the vacations
  page (it keeps its state in the browser today).
- The palette values.
- The exact copy of new lines and messages (English, the UI says
  "vacation").
- Layout of `/family` and `/settings` inside the existing theme, using the
  `impeccable` and `frontend-ui-patterns` skills.

## Still open with Patrick

- The split in `docs/free-vs-premium.md` and the questions at its end.
