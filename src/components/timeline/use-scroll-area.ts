"use client";

// One scroll area for a strip of chips or years, sideways ("x") or up and
// down ("y"): whether there is more on either side (for the pinned arrows),
// a page-by-page scroll for those arrows, dragging with the mouse (touch
// scrolls natively), and on a sideways strip the vertical mouse wheel scrolls
// it while the pointer is over it. At either end the wheel goes back to the
// page, and a page scroll that only passes over a strip keeps scrolling the
// page (rules in scroll-rules.ts). Everything is measured in effects, never
// during render, so server and client render the same markup (arrows hidden
// until measured). `dep`
// must change whenever the content changes or the element is mounted anew.
import { useCallback, useEffect, useState, type RefObject } from "react";

import { wheelAction } from "./scroll-rules";

export type ScrollAxis = "x" | "y";

const DRAG_THRESHOLD = 5;

// The last two wheel events seen anywhere on the page, and which strip (if
// any) handled each. One passive capture listener on window, shared by every
// strip, runs before a strip's own listener and moves `latest` to `previous`.
type WheelSeen = { time: number; handledBy: HTMLElement | null };
const wheels: { previous: WheelSeen; latest: WheelSeen } = {
  previous: { time: Number.NEGATIVE_INFINITY, handledBy: null },
  latest: { time: Number.NEGATIVE_INFINITY, handledBy: null },
};
let wheelWatchers = 0;

function onAnyWheel(e: WheelEvent) {
  wheels.previous = wheels.latest;
  wheels.latest = { time: e.timeStamp, handledBy: null };
}

function watchWheels(): () => void {
  if (wheelWatchers++ === 0) {
    window.addEventListener("wheel", onAnyWheel, { capture: true, passive: true });
  }
  return () => {
    if (--wheelWatchers === 0) {
      window.removeEventListener("wheel", onAnyWheel, { capture: true });
      wheels.previous = { time: Number.NEGATIVE_INFINITY, handledBy: null };
      wheels.latest = { time: Number.NEGATIVE_INFINITY, handledBy: null };
    }
  };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function behavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function metrics(el: HTMLElement, axis: ScrollAxis) {
  return axis === "x"
    ? { pos: el.scrollLeft, size: el.clientWidth, total: el.scrollWidth }
    : { pos: el.scrollTop, size: el.clientHeight, total: el.scrollHeight };
}

// Scrolls the area (never the page) so the child is fully visible, `inset`
// px clear of each edge so a pinned arrow and its fade never cover it.
export function revealIn(
  area: HTMLElement,
  child: HTMLElement,
  axis: ScrollAxis,
  inset: number,
  center = false,
) {
  const a = area.getBoundingClientRect();
  const c = child.getBoundingClientRect();
  const start = axis === "x" ? c.left - a.left : c.top - a.top;
  const length = axis === "x" ? c.width : c.height;
  const { size } = metrics(area, axis);
  const fits = start >= inset && start + length <= size - inset;
  if (fits) return;
  const by = center ? start - (size - length) / 2 : start < inset ? start - inset : start + length - (size - inset);
  area.scrollBy({ [axis === "x" ? "left" : "top"]: by, behavior: behavior() });
}

export function useScrollArea(ref: RefObject<HTMLElement | null>, axis: ScrollAxis, dep: unknown) {
  const [edges, setEdges] = useState({ start: false, end: false });

  // More on either side, kept in sync on scroll, resize and content changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const { pos, size, total } = metrics(el, axis);
      const start = pos > 1;
      const end = pos + size < total - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [ref, axis, dep]);

  // Mouse wheel and mouse drag.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stopWatching = watchWheels();

    // Who takes the wheel is decided in scroll-rules.ts: a page scroll that
    // merely passes over the strip keeps scrolling the page.
    function onWheel(e: WheelEvent) {
      if (!el) return;
      const { pos, size, total } = metrics(el, axis);
      const action = wheelAction({
        axis,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        sincePrevious: e.timeStamp - wheels.previous.time,
        previousWasMine: wheels.previous.handledBy === el,
        canScrollBack: pos > 0,
        canScrollForward: pos + size < total - 1,
      });
      if (action === "native" || action === "strip") wheels.latest.handledBy = el;
      if (action === "pass" || action === "native") return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (action === "strip") el.scrollLeft += delta;
      else window.scrollBy({ top: delta, behavior: "auto" });
    }

    let drag: { from: number; scroll: number; id: number; moved: boolean } | null = null;

    // Drops a drag, also one whose release never reached the strip (the
    // mouse was let go outside it, or the window lost focus).
    function endDrag() {
      if (!el || !drag) return;
      const { id } = drag;
      drag = null;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    }

    function onPointerDown(e: PointerEvent) {
      if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
      drag = {
        from: axis === "x" ? e.clientX : e.clientY,
        scroll: metrics(el, axis).pos,
        id: e.pointerId,
        moved: false,
      };
    }

    function onPointerMove(e: PointerEvent) {
      if (!el || !drag || e.pointerId !== drag.id) return;
      // No button held: the release happened somewhere the strip never heard of.
      if (e.buttons === 0) {
        endDrag();
        return;
      }
      const delta = (axis === "x" ? e.clientX : e.clientY) - drag.from;
      if (!drag.moved) {
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        drag.moved = true;
        el.setPointerCapture(drag.id);
        el.dataset.dragging = "true";
      }
      if (axis === "x") el.scrollLeft = drag.scroll - delta;
      else el.scrollTop = drag.scroll - delta;
    }

    // A drag must not end in a click on the chip or year it started on.
    function swallowClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
    }

    function onPointerUp(e: PointerEvent) {
      if (!el || !drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      delete el.dataset.dragging;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.addEventListener("click", swallowClick, { capture: true, once: true });
      // No click follows a pointercancel: drop the guard on the next task.
      window.setTimeout(() => el.removeEventListener("click", swallowClick, { capture: true }), 0);
    }

    // Before the drag threshold nothing is captured, so the strip would never
    // hear the release once the mouse leaves it: give up on that press.
    function onPointerLeave(e: PointerEvent) {
      if (drag && e.pointerId === drag.id && !drag.moved) endDrag();
    }

    function onLostCapture(e: PointerEvent) {
      if (drag && e.pointerId === drag.id) endDrag();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("lostpointercapture", onLostCapture);
    window.addEventListener("blur", endDrag);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("lostpointercapture", onLostCapture);
      window.removeEventListener("blur", endDrag);
      endDrag();
      stopWatching();
    };
  }, [ref, axis, dep]);

  // About one visible length per press.
  const page = useCallback(
    (dir: 1 | -1) => {
      const el = ref.current;
      if (!el) return;
      const by = dir * metrics(el, axis).size * 0.8;
      el.scrollBy({ [axis === "x" ? "left" : "top"]: by, behavior: behavior() });
    },
    [ref, axis],
  );

  return { edges, page };
}
