"use client";

// One scroll area for a strip of chips or years, sideways ("x") or up and
// down ("y"): whether there is more on either side (for the pinned arrows),
// a page-by-page scroll for those arrows, dragging with the mouse (touch
// scrolls natively), and on a sideways strip the vertical mouse wheel scrolls
// it while the pointer is over it. At either end the wheel goes back to the
// page. Everything is measured in effects, never during render, so server
// and client render the same markup (arrows hidden until measured). `dep`
// must change whenever the content changes or the element is mounted anew.
import { useCallback, useEffect, useState, type RefObject } from "react";

export type ScrollAxis = "x" | "y";

const DRAG_THRESHOLD = 5;

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

    function onWheel(e: WheelEvent) {
      if (!el || axis !== "x" || e.ctrlKey) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // sideways wheels work natively
      const { pos, size, total } = metrics(el, "x");
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const atStart = pos <= 0;
      const atEnd = pos + size >= total - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return; // let the page scroll
      e.preventDefault();
      el.scrollLeft += delta;
    }

    let drag: { from: number; scroll: number; id: number; moved: boolean } | null = null;

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

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
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
