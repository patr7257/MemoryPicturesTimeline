// Title, body, tag and deep link per notification type. Real content is
// allowed (trip title, person name, count); never photos or place names.
import { pushSnippet, type PushPayload } from "./payload";

const TITLE_MAX = 80;

export function photosAddedPayload(input: {
  uploaderName: string;
  count: number;
  tripId: string;
  tripTitle: string;
}): PushPayload {
  const who = pushSnippet(input.uploaderName, 40) || "Someone";
  const trip = pushSnippet(input.tripTitle, TITLE_MAX);
  const n = input.count;
  return {
    title: "New photos",
    body: `${who} added ${n} ${n === 1 ? "photo" : "photos"} to ${trip}`,
    // Same tag as trip_created for the same trip: the device collapses them.
    tag: `trip-${input.tripId}`,
    url: `/trips/${input.tripId}`,
  };
}

export function tripCreatedPayload(input: { tripId: string; tripTitle: string }): PushPayload {
  return {
    title: "New trip",
    body: `New trip: ${pushSnippet(input.tripTitle, TITLE_MAX)}`,
    tag: `trip-${input.tripId}`,
    url: `/trips/${input.tripId}`,
  };
}

export type OnThisDayItem = { id: string; title: string; yearsAgo: number };

const ago = (n: number) => `${n} ${n === 1 ? "year" : "years"} ago`;

export function onThisDayPayload(items: OnThisDayItem[], dayKey: string): PushPayload | null {
  if (items.length === 0) return null;
  const tag = `on-this-day-${dayKey}`;
  if (items.length === 1) {
    const [t] = items;
    return {
      title: "On this day",
      body: `${ago(t.yearsAgo)} today: ${pushSnippet(t.title, TITLE_MAX)}`,
      tag,
      url: `/trips/${t.id}`,
    };
  }
  return {
    title: "On this day",
    body: items.map((t) => `${pushSnippet(t.title, 40)} (${ago(t.yearsAgo)})`).join(", "),
    tag,
    url: "/",
  };
}
