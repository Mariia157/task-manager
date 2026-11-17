"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

/** Textarea, которая растёт по содержимому (до maxRows), без ручки ресайза. */
export function AutoTextarea({ minRows = 2, maxRows = 16, className = "", onInput, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fit() {
    const el = ref.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minRows * lh + pad), maxRows * lh + pad)}px`;
  }

  useEffect(fit);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      className={`field resize-none leading-relaxed ${className}`}
      {...rest}
    />
  );
}
