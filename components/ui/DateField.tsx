"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePopover } from "./usePopover";
import { IconCalendar } from "@/components/icons";

/** Даты как строки YYYY-MM-DD; календарная арифметика в UTC, чтобы не зависеть от пояса браузера. */
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const key = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};
const shift = (s: string, days: number) => {
  const p = parse(s)!;
  return key(p.y, p.m, p.d + days);
};

export function DateField({
  name,
  id,
  defaultValue,
  today,
  locale,
  labels,
  required,
}: {
  name: string;
  id?: string;
  defaultValue: string;
  /** сегодняшняя дата по Киеву, YYYY-MM-DD — считается на сервере */
  today: string;
  locale: "uk" | "en";
  labels: { today: string; tomorrow: string; week: string; prev: string; next: string };
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const sel = parse(value) ?? parse(today)!;
  const [view, setView] = useState({ y: sel.y, m: sel.m });
  const [focus, setFocus] = useState(value || today);
  const { open, setOpen, show, up, root } = usePopover(400);
  const btn = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const L = locale === "en" ? "en-GB" : "uk-UA";

  const fmt = (s: string) => {
    const p = parse(s);
    if (!p) return "";
    return new Intl.DateTimeFormat(L, { timeZone: "UTC", weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(new Date(Date.UTC(p.y, p.m - 1, p.d)));
  };
  const monthTitle = new Intl.DateTimeFormat(L, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(view.y, view.m - 1, 1)));
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(L, { timeZone: "UTC", weekday: "short" }).format(new Date(Date.UTC(2026, 0, 5 + i)))),
    [L],
  );

  // 6 недель, начиная с понедельника
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m - 1, 1));
    const back = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const k = key(view.y, view.m, 1 - back + i);
      const p = parse(k)!;
      return { k, d: p.d, inMonth: p.m === view.m };
    });
  }, [view]);

  function choose(k: string) {
    setValue(k);
    setFocus(k);
    setOpen(false);
    btn.current?.focus();
  }

  function moveFocus(k: string) {
    setFocus(k);
    const p = parse(k)!;
    if (p.y !== view.y || p.m !== view.m) setView({ y: p.y, m: p.m });
    setTimeout(() => grid.current?.querySelector<HTMLButtonElement>(`[data-k="${k}"]`)?.focus(), 0);
  }

  function onGridKey(e: KeyboardEvent) {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(shift(focus, map[e.key]));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  }

  function toggle() {
    if (open) return setOpen(false);
    const p = parse(value) ?? parse(today)!;
    setView({ y: p.y, m: p.m });
    setFocus(value || today);
    show();
    setTimeout(() => grid.current?.querySelector<HTMLButtonElement>(`[data-k="${value || today}"]`)?.focus(), 0);
  }

  const step = (n: number) => setView((v) => ({ y: v.y + Math.floor((v.m - 1 + n) / 12), m: ((((v.m - 1 + n) % 12) + 12) % 12) + 1 }));

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      {required && <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" value={value} required onChange={() => {}} />}
      <button
        ref={btn}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            toggle();
          }
        }}
        className={`field sel-trigger flex w-full items-center gap-2.5 text-left ${open ? "is-open" : ""}`}
      >
        <IconCalendar size={17} />
        <span className="flex-1 truncate first-letter:uppercase">{fmt(value)}</span>
      </button>

      {open && (
        <div role="dialog" className={`pop absolute left-0 z-50 w-[320px] max-w-[calc(100vw-2rem)] p-3 ${up ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => step(-1)} aria-label={labels.prev} className="cal-nav">
              <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true"><path d="M6.5 1 1.5 6l5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="text-[0.95rem] font-extrabold first-letter:uppercase" aria-live="polite">{monthTitle}</div>
            <button type="button" onClick={() => step(1)} aria-label={labels.next} className="cal-nav">
              <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true"><path d="M1.5 1l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[0.7rem] font-bold uppercase text-ink-3">
            {weekdays.map((w, i) => (
              <div key={i} className={i >= 5 ? "text-[#c01428]/70" : ""}>{w.replace(".", "")}</div>
            ))}
          </div>
          <div ref={grid} role="grid" className="grid grid-cols-7 gap-1" onKeyDown={onGridKey}>
            {cells.map((c, i) => {
              const isSel = c.k === value;
              const isToday = c.k === today;
              const past = c.k < today;
              return (
                <button
                  key={c.k}
                  type="button"
                  data-k={c.k}
                  tabIndex={c.k === focus ? 0 : -1}
                  aria-pressed={isSel}
                  aria-label={fmt(c.k)}
                  onClick={() => choose(c.k)}
                  className={`h-10 rounded-[11px] text-sm font-bold transition-all ${
                    isSel
                      ? "bg-ink text-white shadow-[0_6px_14px_rgba(29,33,48,.28)]"
                      : isToday
                        ? "bg-[#e7efff] text-[#1d4ed8] hover:bg-[#d8e4fb]"
                        : c.inMonth
                          ? `${past ? "text-ink-3" : i % 7 >= 5 ? "text-[#c01428]/80" : "text-ink"} hover:bg-panel`
                          : "text-ink-3/50 hover:bg-panel"
                  }`}
                >
                  {c.d}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-1.5">
            {[
              { l: labels.today, k: today },
              { l: labels.tomorrow, k: shift(today, 1) },
              { l: labels.week, k: shift(today, 7) },
            ].map((b) => (
              <button
                key={b.l}
                type="button"
                onClick={() => choose(b.k)}
                className={`h-8 flex-1 rounded-[10px] text-xs font-bold transition-colors ${b.k === value ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-sunken"}`}
              >
                {b.l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
