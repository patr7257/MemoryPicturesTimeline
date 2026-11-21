// Who gets a mouse wheel or trackpad event that lands on a scroll strip (the
// globe's sideways chip row, "x", or the vertical year rail, "y"). Pure, so it
// is unit tested; use-scroll-area.ts applies the answer.
//
// A wheel gesture belongs to whatever it started over. One that started
// outside the strip (the previous wheel event, anywhere on the page, came
// less than WHEEL_GESTURE_GAP_MS ago and this strip did not handle it) keeps
// scrolling the page while the pointer passes over the strip.

export type WheelAxis = "x" | "y";

export type WheelInput = {
  axis: WheelAxis;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  // Milliseconds since the previous wheel event anywhere; Infinity if none.
  sincePrevious: number;
  // Whether this strip handled that previous event.
  previousWasMine: boolean;
  // Whether the strip can still scroll towards its start or its end.
  canScrollBack: boolean;
  canScrollForward: boolean;
};

// "pass": leave the event alone, the page scrolls (not this strip's gesture).
// "native": leave the event alone, the browser scrolls the strip (its gesture).
// "strip": prevent the default and scroll the strip by the vertical delta.
// "page": prevent the default and scroll the page by the vertical delta.
export type WheelAction = "pass" | "native" | "strip" | "page";

export const WHEEL_GESTURE_GAP_MS = 250;

export function wheelAction(input: WheelInput): WheelAction {
  const { axis, deltaX, deltaY, shiftKey, ctrlKey } = input;
  if (ctrlKey) return "pass"; // zoom
  const vertical = Math.abs(deltaY) > Math.abs(deltaX);
  const startedElsewhere = input.sincePrevious < WHEEL_GESTURE_GAP_MS && !input.previousWasMine;
  const canScroll = deltaY < 0 ? input.canScrollBack : input.canScrollForward;

  if (axis === "x") {
    if (!vertical) return "native"; // sideways wheels scroll the row natively
    if (startedElsewhere && !shiftKey) return "pass";
    return canScroll ? "strip" : "pass"; // at either end the wheel goes back to the page
  }

  if (!vertical) return "pass";
  if (!startedElsewhere) return "native"; // scrolls the rail, chains to the page at its ends
  return canScroll ? "page" : "pass";
}
