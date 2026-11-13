"use client";

// For a sideways-scrolling row: whether there is more to see on either side,
// kept in sync on scroll and resize, plus a page-by-page scroll for arrow
// buttons. `dep` re-measures when the content changes (e.g. item count).
import { useCallback, useEffect, useState, type RefObject } from "react";

export function useScrollEdges(ref: RefObject<HTMLElement | null>, dep: unknown) {
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
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
  }, [ref, dep]);

  const page = useCallback(
    (dir: 1 | -1) => {
      const el = ref.current;
      if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
    },
    [ref],
  );

  return { edges, page };
}
