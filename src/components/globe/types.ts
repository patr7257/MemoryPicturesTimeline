// The vacation fields the globe and the flight need. Structurally a subset
// of the timeline trip, so callers can pass TimelineTrip objects as they are
// once lat and lng are known to be set.
export type GlobeTrip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  locationName: string | null;
  lat: number;
  lng: number;
  coverPhotoId: string | null;
  photoCount: number;
};

export type FlightTarget = {
  id: string;
  title: string;
  lat: number;
  lng: number;
};
