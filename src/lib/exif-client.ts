// Client-side EXIF extraction at upload time (advisory: the server re-derives
// dimensions itself; date and GPS ride along in the finalize call).
//
// Uses exifreader's `expanded` output: expanded.gps is ALREADY signed decimal
// degrees (south/west negative). Never use the raw tags, whose values are
// unsigned with a separate hemisphere ref: the classic wrong-hemisphere bug.
import ExifReader from "exifreader";

export type ClientExif = {
  takenAt: string | null; // ISO string
  lat: number | null;
  lng: number | null;
};

export function parseExif(buffer: ArrayBuffer): ClientExif {
  try {
    const tags = ExifReader.load(buffer, { expanded: true });

    let takenAt: string | null = null;
    const dto = tags.exif?.DateTimeOriginal?.description;
    if (dto) {
      // EXIF format "YYYY:MM:DD HH:MM:SS" -> ISO (local time, no zone info).
      const m = dto.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      if (m) takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
    }

    const lat = typeof tags.gps?.Latitude === "number" ? tags.gps.Latitude : null;
    const lng = typeof tags.gps?.Longitude === "number" ? tags.gps.Longitude : null;

    return { takenAt, lat, lng };
  } catch {
    return { takenAt: null, lat: null, lng: null };
  }
}
