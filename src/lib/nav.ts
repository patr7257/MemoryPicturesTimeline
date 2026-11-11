// Pure navigation model: which tabs exist and which section a pathname is in.
// Kept free of React so it is unit tested (see nav.test.ts).

export type NavSection =
  | "timeline"
  | "vacations"
  | "upload"
  | "map"
  | "people"
  | "notifications"
  | "account";

export type NavTab = {
  key: Exclude<NavSection, "account">;
  href: "/timeline" | "/vacations" | "/upload" | "/map" | "/people" | "/notifications";
  label: string;
};

// Desktop tab order. "Add photos" (upload) is the emphasised primary action.
export const NAV_TABS: readonly NavTab[] = [
  { key: "timeline", href: "/timeline", label: "Timeline" },
  { key: "vacations", href: "/vacations", label: "Vacations" },
  { key: "upload", href: "/upload", label: "Add photos" },
  { key: "map", href: "/map", label: "Map" },
  { key: "people", href: "/people", label: "People" },
  { key: "notifications", href: "/notifications", label: "Alerts" },
];

const ROOTS: ReadonlyArray<[string, NavSection]> = [
  ["timeline", "timeline"],
  ["slideshow", "timeline"],
  ["vacations", "vacations"],
  ["trips", "vacations"],
  ["upload", "upload"],
  ["map", "map"],
  ["people", "people"],
  ["notifications", "notifications"],
  ["account", "account"],
  ["members", "account"],
];

export function activeSection(pathname: string): NavSection | null {
  const path = pathname.split(/[?#]/)[0];
  const first = path.split("/").filter(Boolean)[0];
  if (!first) return "timeline";
  return ROOTS.find(([root]) => root === first)?.[1] ?? null;
}

// First letter for the avatar: name first, then email, "?" as a last resort.
export function viewerInitial(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}
