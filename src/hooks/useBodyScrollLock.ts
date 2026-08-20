import { useEffect } from "react";

export function useBodyScrollLock(locked = true) {
  useEffect(() => {
    if (!locked) return;

    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;

    html.classList.add("modal-open");
    body.classList.add("modal-open");
    body.style.top = `-${scrollY}px`;

    return () => {
      html.classList.remove("modal-open");
      body.classList.remove("modal-open");
      body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
