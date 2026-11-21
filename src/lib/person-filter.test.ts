import { describe, expect, it } from "vitest";

import {
  filterQuery,
  MAX_FAMILY_FILTER,
  MAX_PEOPLE_FILTER,
  matchesPeople,
  parseFamilyParam,
  parseFilterParams,
  parsePersonParam,
  personQuery,
  resolveFilter,
  toggleFamily,
  togglePerson,
  togglePersonIn,
} from "./person-filter";

const A = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a01";
const B = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a02";
const C = "0b6f2ab8-6d5f-4ceb-a2f5-9f4f3f0b6a03";

describe("parsePersonParam", () => {
  it("treats a missing param as everyone", () => {
    expect(parsePersonParam(undefined)).toEqual([]);
  });

  it("keeps a single old-style param working", () => {
    expect(parsePersonParam(A)).toEqual([A]);
  });

  it("reads repeated params in order", () => {
    expect(parsePersonParam([B, A])).toEqual([B, A]);
  });

  it("drops values that are not uuids", () => {
    expect(parsePersonParam(["nope", A, "", "1; drop table"])).toEqual([A]);
  });

  it("dedupes, ignoring case and whitespace", () => {
    expect(parsePersonParam([A, A.toUpperCase(), ` ${A} `])).toEqual([A]);
  });

  it("caps the selection", () => {
    const many = Array.from(
      { length: MAX_PEOPLE_FILTER + 5 },
      (_, i) => `0b6f2ab8-6d5f-4ceb-a2f5-${String(i).padStart(12, "0")}`,
    );
    expect(parsePersonParam(many)).toHaveLength(MAX_PEOPLE_FILTER);
  });
});

describe("togglePerson", () => {
  it("adds an absent id at the end", () => {
    expect(togglePerson([A], B)).toEqual([A, B]);
  });

  it("removes a present id", () => {
    expect(togglePerson([A, B], A)).toEqual([B]);
  });

  it("does not mutate its input", () => {
    const sel = [A];
    togglePerson(sel, B);
    expect(sel).toEqual([A]);
  });

  it("does not grow past the cap", () => {
    const full = Array.from(
      { length: MAX_PEOPLE_FILTER },
      (_, i) => `0b6f2ab8-6d5f-4ceb-a2f5-${String(i).padStart(12, "0")}`,
    );
    expect(togglePerson(full, C)).toEqual(full);
  });
});

describe("personQuery", () => {
  it("is empty for no filter", () => {
    expect(personQuery([])).toEqual({});
  });

  it("uses an array even for one id", () => {
    expect(personQuery([A])).toEqual({ person: [A] });
  });

  it("repeats the param for several ids", () => {
    const q = personQuery([A, B]);
    expect(new URLSearchParams(q.person!.map((p) => ["person", p])).toString()).toBe(
      `person=${A}&person=${B}`,
    );
  });
});

describe("matchesPeople", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesPeople([], [])).toBe(true);
  });

  it("matches when ANY selected person is tagged", () => {
    expect(matchesPeople([A, B], [B, C])).toBe(true);
  });

  it("does not match when none is tagged", () => {
    expect(matchesPeople([A], [B, C])).toBe(false);
    expect(matchesPeople([A], [])).toBe(false);
  });
});

const id = (n: number) => `0b6f2ab8-6d5f-4ceb-a2f5-${String(n).padStart(12, "0")}`;
const ANN = id(1), BO = id(2), CY = id(3), DI = id(4), ED = id(5), FLO = id(6), ZED = id(7);
const FA = id(101), FB = id(102), ZED_FAMILY = id(103), BIG = id(104);
const people = [
  { id: ANN, name: "Ann" },
  { id: BO, name: "Bo" },
  { id: CY, name: "Cy" },
  { id: DI, name: "Di" },
  { id: ED, name: "Ed" },
  { id: FLO, name: "Flo" },
];
const famA = { id: FA, name: "A", memberIds: [ANN, FLO] };
const famB = { id: FB, name: "B", memberIds: [ANN, BO, CY, DI, ED] };
const families = [famA, famB];
const none = { familyIds: [] as string[], personIds: [] as string[] };

describe("parseFamilyParam", () => {
  it("follows the person rules with its own cap", () => {
    expect(parseFamilyParam([FB, "nope", FA, FB.toUpperCase()])).toEqual([FB, FA]);
    const many = Array.from({ length: MAX_FAMILY_FILTER + 3 }, (_, i) => id(200 + i));
    expect(parseFamilyParam(many)).toHaveLength(MAX_FAMILY_FILTER);
  });
});

describe("resolveFilter", () => {
  it("narrows to the selected names inside a selected family", () => {
    const r = resolveFilter({ selection: { familyIds: [FB], personIds: [BO] }, families, people });
    expect(r.effective).toEqual([BO]);
    expect(r.nameChips.map((p) => p.id)).toEqual([ANN, BO, CY, DI, ED]);
  });

  it("takes the whole family when no name is selected", () => {
    expect(
      resolveFilter({ selection: { familyIds: [FB], personIds: [] }, families, people }).effective,
    ).toEqual([ANN, BO, CY, DI, ED]);
  });

  it("has no effective filter when nothing is on", () => {
    expect(resolveFilter({ selection: none, families, people }).effective).toBeNull();
  });

  it("ignores family and person ids the viewer cannot see", () => {
    const r = resolveFilter({
      selection: { familyIds: [ZED_FAMILY], personIds: [BO, ZED] },
      families,
      people,
    });
    expect(r.selection).toEqual({ familyIds: [], personIds: [BO] });
    expect(r.effective).toEqual([BO]);
  });

  it("drops a selected name that has no chip under the selected family", () => {
    expect(
      resolveFilter({ selection: { familyIds: [FA], personIds: [BO] }, families, people }).effective,
    ).toEqual([ANN, FLO]);
  });

  it("a family with no visible member has no chip and cannot be selected", () => {
    const empty = { id: "f-empty", name: "Empty", memberIds: [] as string[] };
    const hidden = { id: "f-hidden", name: "Hidden", memberIds: ["p-not-visible"] };
    const r = resolveFilter({
      selection: { familyIds: ["f-empty", "f-hidden"], personIds: [] },
      families: [...families, empty, hidden],
      people,
    });
    expect(r.familyChips).toEqual(families);
    expect(r.selection).toEqual({ familyIds: [], personIds: [] });
    expect(r.effective).toBeNull();
    expect(r.nameChips).toEqual(people);
  });

  it("shows family chips only with two or more families", () => {
    expect(resolveFilter({ selection: none, families: [famA], people }).familyChips).toEqual([]);
    expect(resolveFilter({ selection: none, families, people }).familyChips).toEqual(families);
  });

  it("lists a person in no family as the only chip", () => {
    const lone = { id: ANN, name: "Ann" };
    expect(resolveFilter({ selection: none, families: [], people: [lone] }).nameChips).toEqual([lone]);
  });

  it("does not cap the effective list", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ id: id(300 + i), name: `P${i}` }));
    const big = { id: BIG, name: "Big", memberIds: twenty.map((p) => p.id) };
    expect(
      resolveFilter({ selection: { familyIds: [BIG], personIds: [] }, families: [big], people: twenty })
        .effective,
    ).toHaveLength(20);
  });
});

describe("toggleFamily and togglePersonIn", () => {
  it("drops names that belong to no other selected family when a family goes off", () => {
    expect(toggleFamily({ familyIds: [FA, FB], personIds: [ANN, BO] }, FB, families)).toEqual({
      familyIds: [FA],
      personIds: [ANN],
    });
  });

  it("keeps a person who is in the other selected family", () => {
    expect(toggleFamily({ familyIds: [FA, FB], personIds: [ANN] }, FA, families)).toEqual({
      familyIds: [FB],
      personIds: [ANN],
    });
  });

  it("adds a family without touching the names", () => {
    expect(toggleFamily({ familyIds: [], personIds: [BO] }, FA, families)).toEqual({
      familyIds: [FA],
      personIds: [BO],
    });
  });

  it("toggles a person", () => {
    expect(togglePersonIn({ familyIds: [FA], personIds: [ANN] }, BO)).toEqual({
      familyIds: [FA],
      personIds: [ANN, BO],
    });
    expect(togglePersonIn({ familyIds: [], personIds: [ANN] }, ANN)).toEqual(none);
  });
});

describe("parseFilterParams and filterQuery", () => {
  it("is bare with no params", () => {
    expect(parseFilterParams({})).toEqual({ selection: none, nothingPicked: false, bare: true });
  });

  it("reads pick=none", () => {
    const r = parseFilterParams({ pick: "none" });
    expect(r.nothingPicked).toBe(true);
    expect(r.bare).toBe(false);
  });

  it("reads family and person", () => {
    const r = parseFilterParams({ family: FB, person: [BO, "nope"] });
    expect(r.selection).toEqual({ familyIds: [FB], personIds: [BO] });
    expect(r.bare).toBe(false);
  });

  it("builds queries", () => {
    expect(filterQuery(none)).toEqual({});
    expect(filterQuery(none, { emptyAs: "none" })).toEqual({ pick: "none" });
    expect(filterQuery({ familyIds: [FB], personIds: [BO] })).toEqual({ family: [FB], person: [BO] });
    expect(filterQuery({ familyIds: [], personIds: [BO] }, { emptyAs: "none" })).toEqual({ person: [BO] });
  });
});
