# Free vs Premium

What a family gets for free and what the subscription adds, for the paid app
described in `docs/ios-roadmap.md`. Nothing here is enforced in code yet:
there is no entitlement system until Phase C of that roadmap.

## The model

- **What is paid for**: a storage cap plus depth features. A free family gets
  the whole core with a photo cap and the basic countries map. Premium lifts
  the cap and adds the deeper features.
- **Who pays**: the family owner. Members never pay.
- **Lapsed premium**: the family goes read-only. Nothing is deleted without
  long notice.

## The list

Status: **built** (in the app today), **planned** (designed, not built),
**parked** (idea only).

| Area | Feature | Status | Free | Premium |
|---|---|---|---|---|
| Core | Timeline, vacations, scrapbook vacation pages | built | yes | yes |
| Core | Photo upload with date and GPS | built | up to the cap | large or unlimited |
| Core | Captions, set date and location by hand | built | yes | yes |
| Core | Notes on vacations and photos | built | yes | yes |
| Family | Members, invites, passkey sign-in | built | yes | yes |
| Family | People tagging, family and person filter | built | yes | yes |
| Family | Several families in one space, each private to its members | built | yes | yes |
| Family | Share a vacation with people who were not on it | built | yes | yes |
| Maps | Photo map (every GPS photo at its spot) | built | yes | yes |
| Maps | Globe with vacation pins | built | yes | yes |
| Slideshow | Plain fade slideshow | built | yes | yes |
| Slideshow | 3D projector slideshow | built | no | yes |
| Push | New photos, new vacation | built | yes | yes |
| Push | On this day | built | no | yes |
| Countries | Mark countries and territories | built | yes | yes |
| Countries | Stats: count, UN members, percent of world, per continent | built | yes | yes |
| Countries | Countries filled in from your vacations | built | yes | yes |
| Countries | Share map as image | built | yes | yes |
| Countries | 3D globe view | built | no | yes |
| Countries | Several people on one map, a colour per person | built | no | yes |
| Countries | Wishlist ("want to go") | built | 5 spots | unlimited |
| Countries | Year and private note per country | built | no | yes |
| Countries | Regions, states, cities | parked | no | yes |
| Photos | Bulk location for selected photos | parked | yes | yes |
| Photos | Place search in the location picker | parked | yes | yes |
| Photos | HEIC originals | parked | yes | yes |
| Photos | Video | parked | no | yes |
| App | Installable on the home screen | built | yes | yes |
| App | Native iPhone app, native photo picker, share sheet | planned | yes | yes |

Patrick confirmed this split. It can change freely until the day something
is charged for; nothing here is enforced in code yet.

## Open decisions

| Question | Notes |
|---|---|
| Size of the free photo cap | Photos or gigabytes. Storage cost is small (see the roadmap), so the cap is a reason to upgrade, not a cost control |
| Premium cap | Unlimited, or a large fair-use number |
| Price, billing period, free trial | Monthly and yearly, trial length |
| The current family | For example a free "founder" family with everything unlocked |
| Countries map without a family space | Could the free countries map work for one person before they add any photos |
