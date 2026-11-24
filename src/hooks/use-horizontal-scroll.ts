import { useCallback, useEffect, useState, type RefObject } from "react";
import { REDUCED_MOTION } from "@/constants";

/** Share of the visible width that one arrow press scrolls. */
const PAGE_FRACTION = 0.7;
/** Pixels a mouse press has to travel before it counts as a drag instead of a click. */
const DRAG_THRESHOLD = 5;

/**
 * Makes a sideways-scrolling strip usable with a mouse as well as touch: the vertical wheel
 * scrolls it sideways, a mouse drag slides it (without firing a click), and `canScrollStart` /
 * `canScrollEnd` say whether there is more to see either way, for scroll arrows.
 */
export function useHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft > 1,
        end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });

    const onWheel = (e: WheelEvent) => {
      // Leave trackpad swipes and pages that don't overflow to the browser.
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    let drag: { x: number; left: number; moved: boolean; pointer: number } | null = null;
    const swallowClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerDown = (e: PointerEvent) => {
      // Touch and pens scroll natively.
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: el.scrollLeft, moved: false, pointer: e.pointerId };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        drag.moved = true;
        el.setPointerCapture(drag.pointer);
      }
      el.scrollLeft = drag.left - dx;
    };
    const onPointerUp = () => {
      if (drag?.moved) {
        // The release after a drag must not also activate the tab under the pointer.
        el.addEventListener("click", swallowClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", swallowClick, { capture: true }));
      }
      drag = null;
    };

    // Both observers report once on start, which sets the first edges.
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const children = new MutationObserver(update);
    children.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      resize.disconnect();
      children.disconnect();
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [ref]);

  const scrollPage = useCallback(
    (direction: -1 | 1) => {
      const el = ref.current;
      if (!el) return;
      el.scrollBy({
        left: direction * el.clientWidth * PAGE_FRACTION,
        behavior: window.matchMedia(REDUCED_MOTION).matches ? "instant" : "smooth",
      });
    },
    [ref],
  );

  return { canScrollStart: edges.start, canScrollEnd: edges.end, scrollPage };
}
