import { describe, expect, it } from "vitest";

import { activeSection, NAV_TABS, viewerInitial } from "./nav";

describe("activeSection", () => {
  it("treats / as the timeline", () => {
    expect(activeSection("/")).toBe("timeline");
  });

  it("ignores query strings and hashes", () => {
    expect(activeSection("/timeline?person=x")).toBe("timeline");
    expect(activeSection("/map#top")).toBe("map");
  });

  it("maps top-level sections", () => {
    expect(activeSection("/timeline")).toBe("timeline");
    expect(activeSection("/vacations")).toBe("vacations");
    expect(activeSection("/upload")).toBe("upload");
    expect(activeSection("/map")).toBe("map");
    expect(activeSection("/family")).toBe("family");
    expect(activeSection("/people")).toBe("family");
    expect(activeSection("/members")).toBe("family");
    expect(activeSection("/settings")).toBe("settings");
    expect(activeSection("/notifications")).toBe("settings");
    expect(activeSection("/countries")).toBe("countries");
  });

  it("counts every trip page as vacations", () => {
    expect(activeSection("/trips/abc")).toBe("vacations");
    expect(activeSection("/trips/abc/edit")).toBe("vacations");
    expect(activeSection("/trips/abc/slideshow")).toBe("vacations");
  });

  it("marks the account menu for /account", () => {
    expect(activeSection("/account")).toBe("account");
  });

  it("does not match on a shared prefix", () => {
    expect(activeSection("/mapping")).toBeNull();
    expect(activeSection("/peoples")).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(activeSection("/nope")).toBeNull();
    expect(activeSection("/login")).toBeNull();
  });

  it("tolerates a trailing slash", () => {
    expect(activeSection("/vacations/")).toBe("vacations");
  });
});

describe("NAV_TABS", () => {
  it("lists the desktop tabs in the agreed order", () => {
    expect(NAV_TABS.map((t) => t.key)).toEqual([
      "timeline",
      "vacations",
      "upload",
      "map",
      "countries",
      "family",
      "settings",
    ]);
  });

  it("labels the tabs and shows Settings as an icon only", () => {
    expect(NAV_TABS.map((t) => t.label)).toEqual(["Timeline", "Vacations", "Add photos", "Map", "Countries", "Family", "Settings"]);
    expect(NAV_TABS.find((t) => t.key === "settings")?.iconOnly).toBe(true);
  });

  it("puts Countries directly after Map", () => {
    const i = NAV_TABS.findIndex((t) => t.key === "map");
    expect(NAV_TABS[i + 1]).toEqual({ key: "countries", href: "/countries", label: "Countries" });
  });
});

describe("viewerInitial", () => {
  it("prefers the name, then the email", () => {
    expect(viewerInitial("patrick", "x@y.dk")).toBe("P");
    expect(viewerInitial("  ", "mette@y.dk")).toBe("M");
    expect(viewerInitial("", "")).toBe("?");
  });
});
