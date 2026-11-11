import { describe, expect, it } from "vitest";

import {
  hasDirtyInput,
  hasOpenModal,
  hasUnsavedWork,
  isSafeToAutoReload,
  type ProbeRoot,
  type ProbedElement,
} from "./stale-bundle";

type Fake = Partial<ProbedElement> & { hiddenAncestor?: boolean };

function el(f: Fake): ProbedElement {
  return {
    ...f,
    closest: (selector: string) => (selector === '[aria-hidden="true"]' && f.hiddenAncestor ? {} : null),
  };
}

// A stand-in document that answers each selector with the given elements.
function root(bySelector: Record<string, Fake[]>): ProbeRoot {
  return { querySelectorAll: (selector: string) => (bySelector[selector] ?? []).map(el) };
}

const SAFE = { hidden: true, modalOpen: false, dirtyInput: false, unsavedWork: false };

describe("isSafeToAutoReload", () => {
  it("reloads only a hidden, idle page", () => {
    expect(isSafeToAutoReload(SAFE)).toBe(true);
  });

  it("never reloads a visible page", () => {
    expect(isSafeToAutoReload({ ...SAFE, hidden: false })).toBe(false);
  });

  it("never reloads over an open dialog, typed text or an upload queue", () => {
    expect(isSafeToAutoReload({ ...SAFE, modalOpen: true })).toBe(false);
    expect(isSafeToAutoReload({ ...SAFE, dirtyInput: true })).toBe(false);
    expect(isSafeToAutoReload({ ...SAFE, unsavedWork: true })).toBe(false);
  });
});

const DIALOGS = '[role="dialog"], [role="alertdialog"]';

describe("hasOpenModal", () => {
  it("sees a mounted dialog", () => {
    expect(hasOpenModal(root({ [DIALOGS]: [{}] }))).toBe(true);
  });

  it("ignores a closed dialog kept under aria-hidden", () => {
    expect(hasOpenModal(root({ [DIALOGS]: [{ hiddenAncestor: true }] }))).toBe(false);
    expect(hasOpenModal(root({}))).toBe(false);
  });
});

describe("hasDirtyInput", () => {
  const fields = (...f: Fake[]) => root({ "input, textarea": f });

  it("counts a text field with a value", () => {
    expect(hasDirtyInput(fields({ type: "text", value: "Oslo" }))).toBe(true);
    expect(hasDirtyInput(fields({ value: "notes" }))).toBe(true);
  });

  it("ignores empty, untyped, read-only, disabled and hidden fields", () => {
    expect(
      hasDirtyInput(
        fields(
          { type: "text", value: "" },
          { type: "hidden", value: "x" },
          { type: "file", value: "C:\\fakepath\\a.jpg" },
          { type: "text", value: "x", readOnly: true },
          { type: "text", value: "x", disabled: true },
          { type: "text", value: "x", hiddenAncestor: true },
        ),
      ),
    ).toBe(false);
  });
});

describe("hasUnsavedWork", () => {
  it("is true when anything carries the marker", () => {
    expect(hasUnsavedWork(root({ "[data-unsaved-work]": [{}] }))).toBe(true);
  });

  it("is false without it", () => {
    expect(hasUnsavedWork(root({}))).toBe(false);
  });
});
