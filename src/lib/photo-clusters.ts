// Photo markers for the map tab: every photo with GPS at its own spot, merged
// into stacks when zoomed out and split step by step when zooming in
// (supercluster). Pure apart from the index object, so it is unit tested and
// the map component only renders what this returns.
import Supercluster from "supercluster";

export type MapPhoto = {
  id: string;
  tripId: string;
  tripTitle: string;
  lat: number;
  lng: number;
  takenAt: Date | null;
  city: string | null;
};

export type PhotoMarker =
  | { kind: "photo"; key: string; lat: number; lng: number; photo: MapPhoto }
  | {
      kind: "cluster";
      key: string;
      lat: number;
      lng: number;
      clusterId: number;
      count: number;
      // A photo from the stack, shown on top of it.
      coverId: string;
      // Zoom at which the stack starts to split.
      expansionZoom: number;
      // False when the photos share one spot and no zoom can split them.
      splittable: boolean;
    };

type ClusterProps = { coverId: string };

export type PhotoIndex = Supercluster<MapPhoto, ClusterProps>;

// Stacks form while markers are closer than this many pixels.
export const CLUSTER_RADIUS = 56;
// Past this zoom every photo stands alone (or shares an exact spot).
export const CLUSTER_MAX_ZOOM = 17;

export function createPhotoIndex(photos: readonly MapPhoto[]): PhotoIndex {
  const index = new Supercluster<MapPhoto, ClusterProps>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (p) => ({ coverId: p.id }),
    // Keep the first photo's id as the stack's cover.
    reduce: () => {},
  });
  index.load(
    photos.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: p,
    })),
  );
  return index;
}

// Markers inside [west, south, east, north] at a zoom level.
export function markersFor(
  index: PhotoIndex,
  bbox: [number, number, number, number],
  zoom: number,
): PhotoMarker[] {
  return index.getClusters(bbox, Math.floor(zoom)).map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties;
    if ("cluster" in props && props.cluster) {
      const expansionZoom = index.getClusterExpansionZoom(props.cluster_id);
      return {
        kind: "cluster",
        key: `c${props.cluster_id}`,
        lat,
        lng,
        clusterId: props.cluster_id,
        count: props.point_count,
        coverId: props.coverId,
        expansionZoom,
        splittable: expansionZoom <= CLUSTER_MAX_ZOOM,
      };
    }
    const photo = props as MapPhoto;
    return { kind: "photo", key: `p${photo.id}`, lat, lng, photo };
  });
}

// Every photo in a stack, oldest first (undated last).
export function photosInCluster(index: PhotoIndex, clusterId: number): MapPhoto[] {
  return index
    .getLeaves(clusterId, Infinity)
    .map((f) => f.properties)
    .sort((a, b) => (a.takenAt?.getTime() ?? Infinity) - (b.takenAt?.getTime() ?? Infinity));
}
