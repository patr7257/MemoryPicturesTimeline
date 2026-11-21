# Vacation slideshow, globe pins, upload search: design

Three small improvements Patrick asked for after the families release. They
share no code and are built side by side.

## 1. Find the vacation when adding photos

With many vacations the picker on "Add photos" is a long list. It gets a
search field, on phones and on desktop: typing narrows the vacations by
title, place and year. Matching ignores case and accents and treats the
Danish letters as their plain forms too, so "ostrig" finds "Østrig". Newest
vacations come first. Only vacations the viewer can see are offered, as
today. The matching rule is a pure, tested function.

## 2. Globe pins

Decided by Patrick: small real pins that stay small.

Each vacation is a pin shape whose tip sits on its exact spot. A pin keeps a
small fixed size on screen, so zooming in pulls neighbours apart instead of
enlarging them. The glow gets weaker and the flight lines thinner as the
globe is zoomed in. Vacations at the same spot are fanned out a little by a
stable rule derived from their ids, never at random. Hover, the docked card,
the chips and tapping a pin keep working, and a pin stays easy to hit on a
phone. The size rule is a pure, tested function.

Not built: merging overlapping pins into a numbered group.

## 3. Vacation slideshow

A second kind of slideshow next to today's photo slideshow: a trip down
memory lane through every vacation the viewer can see (the family and person
filter applies as it does today).

Decided by Patrick:

- The launcher first asks which kind: "Photo slideshow" or "Vacation
  slideshow". Each explains itself on hover and focus (and plainly on touch,
  where there is no hover). The vacation one says: "Trip down memory lane of
  all your family's vacations in organised or randomized order".
- A vacation is shown as a grid of at most four photos at a time (2 by 2),
  never smaller tiles than that. Fewer photos fill the screen: two side by
  side, one alone.
- "What to show" has two choices. "Selected": one grid per vacation, the
  cover photo first and the rest spread evenly over the trip. "All": grid
  after grid for the same vacation until its photos run out.
- The vacation's note always shows in a box under the grid.
- "Order" keeps its two choices: by time (oldest vacation first) or shuffled.

My calls:

- The grid slides fade into each other; the projector style belongs to the
  photo slideshow and its choice is hidden for the vacation kind.
- "Seconds per photo" becomes seconds per grid for this kind, with a
  slightly longer default, so one pass over the selected grids of today's
  vacations takes about five minutes.
- Above the grid: the vacation's title, its dates and its place. A long note
  is cut after a few lines.
- A vacation without photos is skipped.
- Pause, next, previous, exit, the keyboard keys and reduced motion behave
  as in the photo slideshow. The single-vacation slideshow stays a photo
  slideshow.
- The settings are remembered like today's, and a stored setting from
  before this change still loads.

Rules that hold: vacations, photos and notes come only through the
viewer-scoped reads; images come through the image proxy; `three` stays out
of the first-load bundle (the vacation kind does not need it); nothing
random in a render path (the shuffle uses the existing seeded helper).

## Tests

- Search: the matching function (case, accents, Danish letters, year, empty
  query, no match).
- Pins: the size rule across the zoom range; the stable fan-out.
- Slideshow: picking the selected four (cover first, spread, fewer than
  four), cutting all photos into grids, the layout for one to four photos,
  building the slide list for both choices and both orders, the time
  estimate, loading an old stored setting.

Nothing here can be checked in a browser by the build: Patrick clicks
through before the deploy.
