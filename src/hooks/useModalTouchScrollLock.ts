import { useEffect, type RefObject } from "react";

function closestScrollableWithin(root: HTMLElement, start: EventTarget | null) {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== root) {
    const style = window.getComputedStyle(node);
    const scrollableY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight;
    if (scrollableY) return node;
    node = node.parentElement;
  }
  return null;
}

export function useModalTouchScrollLock(
  ref: RefObject<HTMLElement | null>,
  locked = true,
) {
  useEffect(() => {
    if (!locked || !ref.current) return;

    const root = ref.current;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? startY;
      const deltaY = currentY - startY;
      const scrollable = closestScrollableWithin(root, event.target);

      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const atTop = scrollable.scrollTop <= 0;
      const atBottom =
        scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
    };
  }, [locked, ref]);
}
