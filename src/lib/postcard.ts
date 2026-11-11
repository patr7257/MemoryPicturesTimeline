// Pure logic for the postcard photo view: face state, keyboard shortcuts,
// unsaved-change detection and the short texts shown on the card. No I/O, no
// clocks, no randomness, so server and browser agree and the tests are stable.
import { rotationFor } from "./scrapbook";

export type Face = "front" | "back";

export function flipFace(face: Face): Face {
  return face === "front" ? "back" : "front";
}

// The print-style caption under the photo on the front: first non-empty line,
// whitespace collapsed, cut at a word boundary when longer than `max`.
export function frontCaption(caption: string | null, max = 80): string {
  if (!caption) return "";
  const firstLine = caption.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const text = firstLine.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}...`;
}

export type ShortcutInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  // Focus is in a text field.
  typing: boolean;
  // A confirmation is open, so the card must not react.
  blocked: boolean;
};

export type Shortcut = "flip" | "prev" | "next";

// Keys that act on the card: F flips, left and right arrows browse. Nothing
// fires while typing, while a confirmation is up, or with a modifier held
// (so Ctrl+F and friends keep working).
export function shortcutFor(input: ShortcutInput): Shortcut | null {
  if (input.typing || input.blocked) return null;
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  switch (input.key) {
    case "f":
    case "F":
      return "flip";
    case "ArrowLeft":
      return "prev";
    case "ArrowRight":
      return "next";
    default:
      return null;
  }
}

export type DraftState = {
  // Stored caption of the photo.
  caption: string | null;
  captionEditing: boolean;
  captionDraft: string;
  noteOpen: boolean;
  noteDraft: string;
};

// True when leaving the photo would throw away typed text.
export function hasUnsavedChanges(s: DraftState): boolean {
  const captionChanged = s.captionEditing && s.captionDraft.trim() !== (s.caption ?? "").trim();
  const noteTyped = s.noteOpen && s.noteDraft.trim().length > 0;
  return captionChanged || noteTyped;
}

// Lines for the address block on the right of the postcard back.
export function addressLines(uploaderName: string, tripName?: string | null): string[] {
  const lines = [`Uploaded by ${uploaderName}`];
  if (tripName && tripName.trim()) lines.push(tripName.trim());
  return lines;
}

// Small stable tilt (degrees) for the stamp, derived from the photo id.
export function stampTilt(photoId: string): number {
  return rotationFor(`stamp${photoId}`, 4);
}

// Remaining characters under a limit, never negative.
export function charsLeft(text: string, max: number): number {
  return Math.max(0, max - text.length);
}
