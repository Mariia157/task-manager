"use client";

import { useRef, useState } from "react";
import { usePopover } from "./usePopover";
import { IconClock } from "@/components/icons";

const PRESETS = Array.from({ length: 27 }, (_, i) => {
  const mins = 8 * 60 + i * 30; // 08:00 … 21:00
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

function normalize(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return null;
  let h: number, m: number;
  if (digits.length <= 2) [h, m] = [+digits, 0];
  else if (digits.length === 3) [h, m] = [+digits.slice(0, 1), +digits.slice(1)];
  else [h, m] = [+digits.slice(0, 2), +digits.slice(2)];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Время: можно впечатать («930», «18», «18:45») или выбрать из сетки. */
export function TimeField({ name, id, defaultValue, ariaLabel }: { name: string; id?: string; defaultValue: string; ariaLabel?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [text, setText] = useState(defaultValue);
  const { open, setOpen, show, up, root } = usePopover(260);
  const input = useRef<HTMLInputElement>(null);

  function commit(v: string) {
    const n = normalize(v);
    if (n) {
      setValue(n);
      setText(n);
    } else setText(value);
  }

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      <div className={`field sel-trigger flex items-center gap-2.5 !py-0 ${open ? "is-open" : ""}`}>
        <IconClock size={17} />
        <input
          ref={input}
          id={id}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          maxLength={5}
          onFocus={() => {
            show();
            // прокрутить сетку (не страницу) к выбранному времени
            setTimeout(() => {
              const el = root.current?.querySelector<HTMLElement>("[data-sel=true]");
              if (el?.parentElement) el.parentElement.scrollTop = el.offsetTop - 80;
            }, 0);
          }}
          onChange={(e) => setText(e.target.value.replace(/[^\d:]/g, ""))}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
              setOpen(false);
            } else if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const i = PRESETS.indexOf(value);
              const next = PRESETS[Math.min(PRESETS.length - 1, Math.max(0, (i < 0 ? 19 : i) + (e.key === "ArrowDown" ? 1 : -1)))];
              setValue(next);
              setText(next);
            }
          }}
          className="h-[2.85rem] w-full bg-transparent font-semibold tabular-nums outline-none focus-visible:outline-none"
        />
      </div>
      {open && (
        <div className={`pop absolute right-0 z-50 w-[260px] p-2 ${up ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"}`}>
          <div className="grid max-h-[220px] grid-cols-3 gap-1 overflow-y-auto">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                data-sel={p === value}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(p);
                  setText(p);
                  setOpen(false);
                }}
                className={`h-9 rounded-[10px] text-sm font-bold tabular-nums transition-colors ${p === value ? "bg-ink text-white" : "text-ink-2 hover:bg-panel"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
