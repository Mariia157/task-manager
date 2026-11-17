"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePopover } from "./usePopover";
import { Avatar } from "./Avatar";
import { IconCheck, IconSearch } from "@/components/icons";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  /** цветная точка слева (статусы) */
  color?: string;
  /** аватар с инициалами (люди) */
  avatar?: string;
  disabled?: boolean;
};

type Props = {
  options: SelectOption[];
  /** контролируемое значение */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** имя поля для формы — значение уходит через скрытый input */
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** поиск по списку; по умолчанию — если вариантов больше 8 */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** вид кнопки: обычное поле или «таблетка» для фильтров */
  variant?: "field" | "chip";
};

export function Select({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  id,
  placeholder = "—",
  ariaLabel,
  required,
  disabled,
  className = "",
  searchable,
  searchPlaceholder = "…",
  emptyText = "—",
  variant = "field",
}: Props) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const { open, setOpen, show, up, root } = usePopover();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const listId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ s: "", t: 0 });

  const canSearch = searchable ?? options.length > 8;
  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase();
    return s ? options.filter((o) => o.label.toLocaleLowerCase().includes(s)) : options;
  }, [options, q]);
  const selected = options.find((o) => o.value === current);

  function openList() {
    if (disabled) return;
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    show();
    if (canSearch) setTimeout(() => search.current?.focus(), 0);
  }

  function pick(o: SelectOption) {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange?.(o.value);
    setOpen(false);
    btn.current?.focus();
  }

  function move(delta: number) {
    if (!filtered.length) return;
    let i = active;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i].disabled) break;
    }
    setActive(i);
    document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: "nearest" });
  }

  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
    else if (!canSearch && e.key.length === 1) {
      // быстрый переход по первым буквам
      const now = e.timeStamp;
      typeahead.current.s = (now - typeahead.current.t < 600 ? typeahead.current.s : "") + e.key.toLocaleLowerCase();
      typeahead.current.t = now;
      const i = filtered.findIndex((o) => o.label.toLocaleLowerCase().startsWith(typeahead.current.s));
      if (i >= 0) setActive(i);
    }
  }

  const chip = variant === "chip";
  const isPlaceholder = !selected;

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      {name && <input type="hidden" name={name} value={current} />}
      {/* невидимое поле, чтобы работала встроенная проверка required */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
          value={current}
          required
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            openList();
          }}
        />
      )}
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        className={`${chip ? "sel-chip" : "field"} sel-trigger flex w-full items-center gap-2.5 text-left ${open ? "is-open" : ""} ${
          isPlaceholder ? "text-ink-3" : ""
        }`}
      >
        {selected?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.color }} />}
        {selected?.avatar && <Avatar name={selected.avatar} size={22} />}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M1 1.5l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={`pop absolute left-0 z-50 w-full min-w-[220px] ${up ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"}`}>
          {canSearch && (
            <div className="relative p-2 pb-1">
              <span className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-[40%] text-ink-3">
                <IconSearch size={15} />
              </span>
              <input
                ref={search}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                className="field !h-10 !py-2 pl-9 text-sm"
              />
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-[280px] overflow-y-auto p-1.5 overscroll-contain">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">{emptyText}</li>}
            {filtered.map((o, i) => {
              const sel = o.value === current;
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={sel}
                  aria-disabled={o.disabled}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[0.95rem] transition-colors ${
                    o.disabled ? "cursor-default opacity-40" : ""
                  } ${i === active ? "bg-panel" : ""} ${sel ? "font-bold text-ink" : "font-medium text-ink-2"}`}
                >
                  {o.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                  {o.avatar && <Avatar name={o.avatar} size={24} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs font-medium text-ink-3">{o.hint}</span>}
                  </span>
                  {sel && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                      <IconCheck size={12} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
