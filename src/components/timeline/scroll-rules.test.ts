import { describe, expect, it } from "vitest";

import { WHEEL_GESTURE_GAP_MS, wheelAction, type WheelInput } from "./scroll-rules";

// A wheel event with nothing before it (a fresh gesture) over a strip that
// can scroll both ways.
function input(over: Partial<WheelInput> = {}): WheelInput {
  return {
    axis: "x",
    deltaX: 0,
    deltaY: 100,
    shiftKey: false,
    ctrlKey: false,
    sincePrevious: Number.POSITIVE_INFINITY,
    previousWasMine: false,
    canScrollBack: true,
    canScrollForward: true,
    ...over,
  };
}

const recent = WHEEL_GESTURE_GAP_MS - 1;

describe("wheelAction on a sideways strip", () => {
  it("takes a vertical wheel that starts over the strip", () => {
    expect(wheelAction(input())).toBe("strip");
  });

  it("keeps taking a gesture it already handled", () => {
    expect(wheelAction(input({ sincePrevious: 16, previousWasMine: true }))).toBe("strip");
  });

  it("leaves a vertical wheel to the page when the gesture started elsewhere", () => {
    expect(wheelAction(input({ sincePrevious: recent, previousWasMine: false }))).toBe("pass");
  });

  it("treats a wheel after a pause as a new gesture", () => {
    expect(
      wheelAction(input({ sincePrevious: WHEEL_GESTURE_GAP_MS, previousWasMine: false })),
    ).toBe("strip");
  });

  it("always takes Shift plus wheel, even mid page scroll", () => {
    expect(wheelAction(input({ shiftKey: true, sincePrevious: recent }))).toBe("strip");
  });

  it("lets a horizontal wheel scroll the strip natively, even mid page scroll", () => {
    expect(wheelAction(input({ deltaX: 40, deltaY: 5, sincePrevious: recent }))).toBe("native");
  });

  it("gives the wheel back to the page at either end", () => {
    expect(wheelAction(input({ deltaY: -100, canScrollBack: false }))).toBe("pass");
    expect(wheelAction(input({ deltaY: 100, canScrollForward: false }))).toBe("pass");
  });

  it("never takes Ctrl plus wheel (zoom)", () => {
    expect(wheelAction(input({ ctrlKey: true }))).toBe("pass");
  });
});

describe("wheelAction on the vertical year rail", () => {
  const rail = (over: Partial<WheelInput> = {}) => input({ axis: "y", ...over });

  it("scrolls the rail natively when the gesture starts over it", () => {
    expect(wheelAction(rail())).toBe("native");
    expect(wheelAction(rail({ sincePrevious: 16, previousWasMine: true }))).toBe("native");
  });

  it("chains to the page natively at its ends, as before", () => {
    expect(wheelAction(rail({ canScrollForward: false }))).toBe("native");
  });

  it("scrolls the page instead when a page scroll passes over the rail", () => {
    expect(wheelAction(rail({ sincePrevious: recent }))).toBe("page");
  });

  it("leaves a passing page scroll alone where the rail could not scroll anyway", () => {
    expect(wheelAction(rail({ sincePrevious: recent, canScrollForward: false }))).toBe("pass");
  });

  it("leaves sideways wheels and Ctrl plus wheel to the page", () => {
    expect(wheelAction(rail({ deltaX: 40, deltaY: 0 }))).toBe("pass");
    expect(wheelAction(rail({ ctrlKey: true }))).toBe("pass");
  });
});
