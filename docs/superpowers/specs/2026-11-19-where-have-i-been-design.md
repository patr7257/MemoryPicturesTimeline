# Where have I been: design

> Parts of this design were replaced by
> `docs/superpowers/specs/2026-11-21-families-design.md`: who sees a map
> (people in your families, not every member), the compare and union views
> and the "Me" and "Family" chips (one filter and a multi-person view),
> suggestions (countries are filled in from vacations), a tap marking a
> country visited (a tap only opens the card), removal deleting the row (a
> visited country becomes `dismissed`) and the UTC year limit (Copenhagen).

A per-person map of visited countries inside Memories, modelled on the
`been.app` country tracker.

## Intent

Each family member gets a world map that fills in as they mark the countries
they have been to, with a count and a percent of the world. The family can
look at each other's maps, at one combined family map, and compare two people.
The feature stores no photos, so it is also the free hook in the later paid
app (see `docs/free-vs-premium.md`).

## Decided by Patrick

- **Owner**: every Person in the People list has a map, including people
  without a login. A signed-in member edits the map of their own Person.
  Super admins edit anyone's map.
- **Visibility**: every signed-in member sees every person's map. This is
  wider than vacation visibility on purpose. A marked country can hint at a
  vacation the viewer cannot open; that is accepted.
- **Prefill**: countries found in GPS photos of vacations the person is tagged
  on are shown as suggestions. Nothing is marked until someone who may edit
  that map taps add.
- **Map**: MapLibre with our own clean style (country shapes only, no street
  tiles), flat map and 3D globe behind one switch.
- **First version includes**: family map and compare, wishlist ("want to go"),
  year and note per country, share map as image.
- **Territories**: each territory is marked by itself (Greenland and the Faroe
  Islands are not Denmark). Stats show "countries and territories" and UN
  member countries out of 193.
- **Wishlist is private**: only whoever may edit a map sees its wishlist. The
  rest of the family sees visited countries only.
- **Notes**: if the person has a login, only that person reads and writes
  their notes; a super admin editing that map does not see them. For a person
  without a login, super admins write and read the notes.

## Goals

- Mark and unmark a country in one tap on the map, or from a searchable list.
- Stats per person: countries and territories visited, UN members visited out
  of 193, percent of the world, progress per continent.
- A map that looks like part of Memories (warm paper theme), smooth on a phone.
- Everything on the page reachable without the map: the list is the accessible
  path, the map is the delight.

## Non-goals

- Regions, states, cities, airports.
- A paywall. No entitlement system exists yet (iOS roadmap, Phase C). All of
  this is built unlocked. The parts marked premium in
  `docs/free-vs-premium.md` are kept as separate components or props so a
  gate can be added later without a rewrite: globe switch, family and compare
  views, wishlist size, year and note.
- Trips with dates, transport or ranking against strangers.
- Marking countries automatically.

## Anti-goals

- Leaking a hidden vacation. Suggestions name the vacation they come from, so
  they are shown only to someone who may edit that map and only from vacations
  that viewer can see (`visibleTripIds`). The family-visible map shows marked
  countries only, never where a mark came from.
- A note or a wishlist readable by the whole family. Both are private (see
  Access).
- `maplibre-gl`, the country shapes or `three` in a first-load bundle.
- `Math.random()` in a render path (scrapbook rule).

## Approaches considered

1. **MapLibre, own blank style, local country shapes (chosen).** Reuses
   `maplibre-gl` and `react-map-gl`, already used by
   `src/components/map/PhotosMap.tsx`. No tile server, no key, no new runtime
   dependency. Pinch zoom, hit testing and fill transitions come with the
   library, and v5 has a globe projection, so flat and globe are one component.
2. **Hand-drawn SVG with d3-geo.** Full control of the look and easy image
   export, but adds a dependency, and zoom, pan and tapping tiny countries
   must be built by hand. No globe.
3. **Paint countries on the existing three.js globe.** Most striking, but
   tapping small countries on a sphere is poor on a phone, so a flat map would
   still be needed.

Patrick picked 1.

## Country data

- **Shapes**: `world-atlas/countries-50m.json` (already installed, TopoJSON).
  The 110m file is too coarse: it has no Malta, Singapore or Faroe Islands.
  The 50m file is about 0.75 MB raw, so it loads lazily on the client with
  `topojson-client`, the same pattern as `src/components/globe/land.ts`.
- **Country key**: the feature id in that file (ISO 3166-1 numeric, kept as
  text with its leading zeros, for example Denmark `208`, Greenland `304`,
  Faroe Islands `234`, Antarctica `010`). Never coerce a key to a number.
  The features without an id get a fixed slug key (builder's call below).
- **The id is not unique in the file**: `036` is on both Australia and
  "Ashmore and Cartier Is.". My call: that territory is not markable and
  fills together with Australia. Map feature identity therefore uses the
  catalog key written onto each feature as a property when the shapes are
  loaded, not the raw id.
- **Catalog**: a committed `src/lib/country-catalog.json` with one entry per
  markable country or territory: key, display name, flag emoji, continent,
  UN member yes/no, has a shape yes/no. world-atlas carries only abbreviated
  names ("Faeroe Is."), so display names come from the catalog and nothing
  matches on names. The catalog is generated by
  `scripts/gen-country-catalog.mjs` from the shapes plus a country dataset.
  Builder's call: the `world-countries` package as a devDependency (it is
  expected to carry `ccn3`, region and `unMember`; verify when run).
- **Tuvalu has no shape** in the 50m file (it is the one UN member missing).
  My call: it gets a catalog entry with no shape and key `798`, markable from
  the list only, so the denominator stays 193. The generator adds any UN
  member missing from the shapes the same way.
- **Vatican City** is flagged as a UN member in the dataset but is an
  observer. The generator forces it to non-member (`NOT_UN_MEMBERS`); it
  stays markable.
- **Catalog test**: every entry that has a shape exists in the shapes file,
  keys are unique, and exactly 193 entries are UN members.
- **Known limit**: the shapes follow Natural Earth, where overseas departments
  such as French Guiana are part of France. They cannot be marked separately.

## Data model

One new table, `person_countries`:

| Column | Type | Notes |
|---|---|---|
| `person_id` | uuid, FK `people.id`, cascade | part of the primary key |
| `country_key` | text | part of the primary key |
| `status` | text | `visited`, `wishlist` or `dismissed` |
| `year` | integer, nullable | year visited, only meaningful for `visited` |
| `note` | text, nullable | private |
| `updated_by` | text, FK `user.id`, set null | who last changed the row |
| `created_at`, `updated_at` | timestamp | |

One row per person and country, so a country is visited or on the wishlist,
never both. Marking a wishlist country as visited updates the row.
`dismissed` hides a suggestion the editor does not want (my call: the
location backfill can place a photo in the wrong country, and without
dismissal that suggestion would never go away). Unmarking deletes the row.

When multi-tenancy arrives (iOS roadmap, Phase C) the table follows the
family through `people`, like `trip_people` does.

## Access

Pure rules in `src/lib/access-policy.ts`, unit tested, used by every page and
action through `getViewer()`:

- `canSeeCountries(viewer)`: every signed-in viewer.
- `canEditCountries(viewer, personId)`: super admin, or
  `viewer.personId === personId`.
- `canReadCountryNotes(viewer, person)`: `viewer.personId === person.id`, or
  a super admin when the person has no login. "Has a login" means a `members`
  row points at that person (invited counts, even before the first sign-in).
  Writing a note needs the same rule. When a person later gets a login, the
  notes an admin wrote for them become theirs alone.
- What each viewer gets:

| Viewer | Rows | Columns |
|---|---|---|
| May not edit this map | `visited` only | country, year |
| May edit, may not read notes | all statuses | country, status, year |
| May edit and read notes | all statuses | country, status, year, note |

- The queries for the first two rows must not select `note` at all, and the
  first must filter on status in SQL, not after the read. `wishlist` and
  `dismissed` rows never reach a viewer who may not edit: a dismissed row
  would reveal that a suggestion existed.
- Showing the year to the whole family is my call (it is part of "where and
  when have you been", and it is not a note).
- The family map and the compare view use visited rows only, for every
  viewer, including for the viewer's own person.
- Suggestions are computed only when `canEditCountries` holds.

A login with no Person (`viewer.personId` null, env-list logins) sees the
family map and other people's maps and gets a line saying an admin must link
them to a person before they have a map of their own.

## Suggestions

For the person whose map is being edited:

1. Take the vacations that person is tagged on, limited to those the viewer
   can see.
2. Take their photos with coordinates, and find the country shape each one
   falls in (point in polygon against the same shapes file, on the server,
   with the parsed shapes memoized). This avoids matching free-text country
   names from the geocoder against catalog names. Group by `photos.country`
   and test a few points per group, not every photo.
3. Drop countries that already have a row for that person (any status).
4. Show the rest as "From your vacations" chips with the vacation title, and
   prefill the year from that vacation's start date when added.

The simplified coastline leaves real places in the sea (the centres of
Copenhagen, Nuuk and Lisbon among them), so a point inside no shape resolves
to the nearest shape outline within `NEAR_COAST_KM` (`resolveKey` in
`src/lib/point-in-country.ts`). Further out than that it yields no
suggestion; the country can still be marked by hand.

## The page

Route `/countries` inside the `(app)` group. Nav label "Countries": a tab in
the desktop top bar, and in the "More" sheet on phones (my call: the bottom
bar is full).

Who is shown follows the existing convention of repeated `person` params
(`src/lib/person-filter.ts`):

- no param: the viewer's own Person, or the family map if they have none
- one `person`: that person's map
- two: compare. Three fills: only the first, only the second, both
- more than two, or the "Family" chip: the union, one fill

```
+--------------------------------------------------+
| Countries           [Me] [Family] [Anna] [Ole] > |
|                                    (Flat | Globe)|
|  +--------------------------------------------+  |
|  |                                            |  |
|  |          world map, visited filled         |  |
|  |          wishlist in a second colour       |  |
|  |                                            |  |
|  +--------------------------------------------+  |
|  23 countries and territories    19 of 193 UN    |
|  10% of the world                   [Share map]  |
|  Europe 14/..  Asia 3/..  Africa 1/..  ...       |
|                                                  |
|  From your vacations:  [+ Portugal] [+ Norway]   |
|                                                  |
|  [ Search countries...            ]              |
|  Europe                                          |
|   [x] Denmark        2019                        |
|   [ ] Estonia                                    |
+--------------------------------------------------+
```

- Tapping a country on the map, or a row in the list, opens a small card:
  flag and name, and for an editor Visited, Want to go, Remove and year, plus
  the note when they may read notes. For a viewer who may not edit, the card
  shows visited and year only, and the wishlist colour is never drawn.
- The first tap on an unmarked country by an editor marks it visited right
  away (optimistic), and the card offers the rest. Speed of marking is the
  point of the feature.
- Removing a mark that has a year, or a note the viewer can see, asks first.
  A super admin who may not read a person's notes cannot remove a country
  that carries a note: only its owner can. Switching a visited country to
  "Want to go" drops its year without asking.
- In the compare and family views a tap on the map does nothing; those views
  have no country card.
- The list is grouped by continent, searchable, and every row is a checkbox
  with the country name as its accessible name.
- Stats count `visited` only. Wishlist and dismissed never count.
- Percent of the world is UN members visited divided by 193.
- Without WebGL the map area shows a short message and the list still works.
- Exact colours, motion timings and component choices are a design pass at
  build time (`impeccable`, `frontend-ui-patterns`), inside the existing
  single warm light theme.

## Map component

- Client component loaded with `next/dynamic` and `ssr: false`.
- MapLibre style object built in code: a background layer, one GeoJSON source
  of the country shapes, a fill layer and a line layer. No external style URL
  and no tile requests.
- Fill colour comes from per-feature state (visited, wishlist, compare side),
  so marking a country repaints one feature. MapLibre does not animate
  feature-state changes, so the colour changes at once.
- Flat and globe use MapLibre's projection, applied through a guarded
  `setProjection` call. If the globe fails, the map shows flat for that page
  load, hides the switch and leaves the saved preference alone. In the flat
  view rotation and pitch are off (drag, touch and keyboard).
- A legend with swatch and text sits under the map, so state is never shown
  by colour alone.
- Reduced motion: no camera animation.

## Share as image

A button on a single person's map (and the family map) makes a PNG in the
browser: the current map canvas plus the person's name and their counts,
drawn on a 2D canvas, then handed to `navigator.share` with a `File`, with a
download fallback. Nothing is uploaded and nothing is stored on the server.
The image holds the map, a first name and numbers only: no photos, no notes,
no vacation titles, and never the wishlist: the map is captured with
visited fills only (`shareFills`), also when the sharer is an editor who
sees the wishlist on screen. The title is "{FirstName} has been to" for a
person, "Our family has been to" when the view covers everyone, and "We have
been to" for a picked group. The map canvas keeps its drawing buffer so the
frame can be copied; a blank capture is reported, not shared. The button is
absent in the compare view.

## Server side

- `src/lib/country-queries.ts`: read a person's rows, read the union for
  several people, compute suggestions.
- `src/lib/countries.ts`: pure helpers (stats per continent, compare
  partition, percent), unit tested with vitest.
- `src/lib/country-actions-core.ts`: the decisions behind every write
  (validation, check order, permissions, refusal texts, the removal rule),
  written against a small store interface and unit tested with a fake store.
- `src/actions/countries.ts`: set status (dismissing a suggestion is a
  status), set year, set note, remove. Each starts from `getViewer()`, runs
  the core against the Drizzle store and returns `{ ok }` or
  `{ ok: false, error }`. Expected refusals are returned, not thrown,
  because production hides thrown server action messages. Validates
  `country_key` against the catalog, year as a four-digit year from 1900 to
  the current UTC year, note length capped.
- Drizzle migration via `pnpm db:generate` and `pnpm db:migrate`. Local dev
  and production share one database, so the migration is additive only.

## Tests

- Policy: `canEditCountries` for owner, other member, super admin, login with
  no person. `canReadCountryNotes` for owner, super admin on a person with a
  login (no), super admin on a person without a login (yes), other member.
- Pure helpers: stats, percent, per-continent totals, compare partition,
  wishlist and dismissed excluded.
- Catalog: keys match the shapes, 193 UN members.
- Point in polygon: known coordinates (Copenhagen, Nuuk, Tórshavn) land in
  Denmark, Greenland and the Faroe Islands.
- Suggestions: a vacation the viewer cannot see contributes nothing; existing
  rows are excluded.
- Visibility: the query for a viewer who may not edit returns visited rows
  only and no note field; a super admin on a person with a login gets all
  statuses and no note field.

## Decided during the build

- Shapes without an id: Kosovo, N. Cyprus and Somaliland are markable
  territories with the slug keys `kosovo`, `n-cyprus` and `somaliland`;
  Siachen Glacier and Indian Ocean Ter. are drawn but not markable.
- Antarctica is markable, as a territory with its own continent line.
- The suggestion computation is not cached; it samples a few points per
  vacation and country name.
- The country card is a bottom sheet on phones and a dialog from `sm` up.
