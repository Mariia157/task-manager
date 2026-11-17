"use client";

import { useEffect, useRef, useState } from "react";

/** Открытие/закрытие всплывашки: клик снаружи и Esc закрывают; решает, открываться вниз или вверх. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(estimatedHeight = 320) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const root = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function show() {
    const r = root.current?.getBoundingClientRect();
    if (r) setUp(window.innerHeight - r.bottom < estimatedHeight && r.top > window.innerHeight - r.bottom);
    setOpen(true);
  }

  return { open, setOpen, show, up, root };
}
