"use client";

import { useState } from "react";

/** Переключатель вместо чекбокса. В форму уходит name=value (по умолчанию 1). */
export function Switch({ name, defaultChecked, label, hint, value = "1" }: { name: string; defaultChecked?: boolean; label: string; hint?: string; value?: string }) {
  const [on, setOn] = useState(!!defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="flex w-full items-center gap-4 rounded-2xl bg-panel px-4 py-3.5 text-left transition-colors hover:bg-sunken/60"
    >
      {on && <input type="hidden" name={name} value={value} />}
      <span
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? "#1d2130" : "#d6d1c8", boxShadow: "inset 0 1px 3px rgba(29,33,48,.18)" }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(29,33,48,.3)] transition-all duration-200"
          style={{ left: on ? 24 : 4 }}
        />
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}
