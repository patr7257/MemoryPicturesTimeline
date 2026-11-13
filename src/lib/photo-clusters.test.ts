import { describe, expect, it } from "vitest";

import {
  CLUSTER_MAX_ZOOM,
  createPhotoIndex,
  markersFor,
  photosInCluster,
  type MapPhoto,
} from "./photo-clusters";

const WORLD: [number, number, number, number] = [-180, -85, 180, 85];
const at = (iso: string) => new Date(iso + "Z");

function photo(id: string, lat: number, lng: number, takenAt: Date | null = null): MapPhoto {
  return { id, tripId: "t", tripTitle: "Trip", lat, lng, takenAt, city: null };
}

// Three spots in Lisbon a few hundred metres apart, one in Toronto.
const lisbon = [
  photo("a", 38.7139, -9.1394, at("2025-11-22T10:00:00")),
  photo("b", 38.7169, -9.1399, at("2025-11-22T09:00:00")),
  photo("c", 38.7105, -9.1366, null),
];
const toronto = photo("t1", 43.6532, -79.3832);

describe("markersFor", () => {
  it("stacks nearby photos when zoomed out and keeps far ones apart", () => {
    const index = createPhotoIndex([...lisbon, toronto]);
    const markers = markersFor(index, WORLD, 3);
    expect(markers).toHaveLength(2);
    const stack = markers.find((m) => m.kind === "cluster");
    expect(stack?.kind === "cluster" && stack.count).toBe(3);
    expect(stack?.kind === "cluster" && ["a", "b", "c"].includes(stack.coverId)).toBe(true);
    expect(markers.find((m) => m.kind === "photo")?.key).toBe("pt1");
  });

  it("splits the stack into single photos when zoomed in far enough", () => {
    const index = createPhotoIndex(lisbon);
    const markers = markersFor(index, WORLD, CLUSTER_MAX_ZOOM + 1);
    expect(markers.map((m) => m.kind)).toEqual(["photo", "photo", "photo"]);
    expect(markers.map((m) => (m.kind === "photo" ? m.photo.id : "")).sort()).toEqual(["a", "b", "c"]);
  });

  it("splits gradually: the expansion zoom shows more markers than the stack", () => {
    const index = createPhotoIndex(lisbon);
    const stack = markersFor(index, WORLD, 3)[0];
    expect(stack.kind).toBe("cluster");
    if (stack.kind !== "cluster") return;
    expect(stack.splittable).toBe(true);
    expect(markersFor(index, WORLD, stack.expansionZoom).length).toBeGreaterThan(1);
  });

  it("marks photos taken at the exact same spot as not splittable", () => {
    const index = createPhotoIndex([photo("x", 50, 10), photo("y", 50, 10)]);
    const stack = markersFor(index, WORLD, 5)[0];
    expect(stack.kind === "cluster" && stack.splittable).toBe(false);
  });

  it("only returns markers inside the view", () => {
    const index = createPhotoIndex([...lisbon, toronto]);
    const europe: [number, number, number, number] = [-15, 30, 30, 60];
    expect(markersFor(index, europe, 3)).toHaveLength(1);
  });

  it("returns nothing for no photos", () => {
    expect(markersFor(createPhotoIndex([]), WORLD, 3)).toEqual([]);
  });
});

describe("photosInCluster", () => {
  it("lists every photo of a stack, oldest first, undated last", () => {
    const index = createPhotoIndex(lisbon);
    const stack = markersFor(index, WORLD, 3)[0];
    if (stack.kind !== "cluster") throw new Error("expected a stack");
    expect(photosInCluster(index, stack.clusterId).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});
