"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { IconSearch, IconStar, IconX } from "@/components/icons";
import { Select, type SelectOption } from "@/components/ui/Select";
import { deleteViewAction, saveViewAction } from "@/app/actions/admin";

type Dir = { id: string; name: string; color: string; subtypeLabel: string; subtypes: { id: string; name: string }[] };
export type ViewChip = { id: string; name: string; query: string; mine: boolean; shared: boolean };

const FILTER_KEYS = ["q", "business", "project", "direction", "subtype", "assignee", "priority", "overdue", "done"];

/** Сравнение видов без учёта порядка параметров и служебных ключей. */
function norm(qs: string) {
  const p = new URLSearchParams(qs);
  return FILTER_KEYS.filter((k) => p.get(k))
    .map((k) => `${k}=${p.get(k)}`)
    .join("&");
}

export function FilterBar({
  business,
  projects,
  directions,
  people,
  sorts,
  views,
  canShare,
}: {
  /** виды работы (HR, Продажа, …): основные + вписанные вручную */
  business?: SelectOption[];
  projects?: SelectOption[];
  directions: Dir[];
  people: SelectOption[];
  sorts?: SelectOption[];
  views: ViewChip[];
  canShare: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saving, setSaving] = useState(false);
  // на телефоне фильтры свёрнуты в кнопку
  const [open, setOpen] = useState(false);

  function go(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  }
  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    go(next);
  }

  const dir = directions.find((d) => d.id === sp.get("direction"));
  const current = norm(sp.toString());
  const hasFilters = current !== "";
  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && sp.get(k)).length;

  return (
    <div className={`card p-3 transition-opacity sm:p-4 ${pending ? "opacity-70" : ""}`}>
      {views.length > 0 || hasFilters ? (
        <div className="scroll-x -mx-1 mb-3 flex items-center gap-2 px-1 pb-0.5 sm:flex-wrap">
          {views.map((v) => {
            const on = norm(v.query) === current;
            return (
              <span key={v.id} className="inline-flex shrink-0 items-center">
                <button
                  onClick={() => {
                    const next = new URLSearchParams(v.query);
                    const s = sp.get("sort");
                    if (s) next.set("sort", s);
                    go(on ? new URLSearchParams() : next);
                  }}
                  aria-pressed={on}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-all ${
                    on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-panel text-ink-2 hover:bg-sunken"
                  } ${v.mine || (canShare && v.shared) ? "rounded-r-none pr-2.5" : ""}`}
                >
                  <IconStar size={14} />
                  {v.name}
                </button>
                {(v.mine || (canShare && v.shared)) && (
                  <button
                    onClick={() => start(() => deleteViewAction(v.id))}
                    aria-label={`Видалити фільтр «${v.name}»`}
                    className={`inline-flex h-9 items-center rounded-r-full pl-1 pr-2.5 transition-colors ${on ? "bg-ink text-white/70 hover:text-white" : "bg-panel text-ink-3 hover:bg-sunken hover:text-ink"}`}
                  >
                    <IconX size={13} />
                  </button>
                )}
              </span>
            );
          })}
          {hasFilters && !views.some((v) => norm(v.query) === current) && (
            saving ? (
              <form
                className="flex shrink-0 items-center gap-1.5"
                action={(f) => {
                  setSaving(false);
                  start(() => saveViewAction(f));
                }}
              >
                <input type="hidden" name="query" value={current} />
                <input name="name" required maxLength={40} autoFocus placeholder="Назва фільтра" className="field !h-9 !min-h-0 w-44 !py-1 text-sm" />
                {canShare && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                    <input type="checkbox" name="shared" value="1" className="h-4 w-4 accent-[#1d2130]" />
                    для всіх
                  </label>
                )}
                <button className="btn btn-primary btn-sm">Зберегти</button>
                <button type="button" onClick={() => setSaving(false)} className="btn btn-soft btn-sm">
                  Скасувати
                </button>
              </form>
            ) : (
              <button onClick={() => setSaving(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-3 hover:text-ink">
                + Зберегти фільтр
              </button>
            )
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <label className="relative min-w-0 flex-[2_1_200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-3">
            <IconSearch size={17} />
          </span>
          <input
            key={sp.get("q") ?? ""}
            className="field pl-10"
            placeholder="Пошук за назвою й описом"
            aria-label="Пошук"
            defaultValue={sp.get("q") ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              clearTimeout(timer.current);
              timer.current = setTimeout(() => set({ q: v.trim() || null }), 300);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`btn h-[2.85rem] shrink-0 sm:hidden ${activeCount ? "btn-primary" : "btn-soft"}`}
        >
          Фільтри{activeCount ? ` · ${activeCount}` : ""}
        </button>
        <div className={`${open ? "flex" : "hidden"} w-full flex-col gap-2.5 sm:contents`}>
        {business && business.length > 0 && (
          <F value={sp.get("business")} all="Усі види роботи" options={business} onChange={(v) => set({ business: v })} />
        )}
        {projects && <F value={sp.get("project")} all="Усі проєкти" options={projects} onChange={(v) => set({ project: v })} />}
        <F
          value={sp.get("direction")}
          all="Усі відділи"
          options={directions.map((d) => ({ value: d.id, label: d.name, color: d.color }))}
          onChange={(v) => set({ direction: v, subtype: null })}
        />
        {dir && dir.subtypes.length > 0 && (
          <F
            value={sp.get("subtype")}
            all={`${dir.subtypeLabel}: усі`}
            options={dir.subtypes.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => set({ subtype: v })}
          />
        )}
        <F value={sp.get("assignee")} all="Усі виконавці" options={people} onChange={(v) => set({ assignee: v })} />
        <F
          value={sp.get("priority")}
          all="Будь-який пріоритет"
          options={[
            { value: "HIGH", label: "Високий", color: "#e5283b" },
            { value: "MEDIUM", label: "Середній", color: "#f08a0c" },
            { value: "LOW", label: "Низький", color: "#64748b" },
          ]}
          onChange={(v) => set({ priority: v })}
        />
        {sorts && (
          <Select
            className="w-full sm:w-auto sm:min-w-[170px] sm:flex-[1_1_170px]"
            value={sp.get("sort") ?? sorts[0].value}
            onChange={(v) => set({ sort: v === sorts[0].value ? null : v })}
            options={sorts}
            ariaLabel="Сортування"
          />
        )}
        </div>
      </div>
      <div className={`mt-3 ${open ? "flex" : "hidden"} flex-wrap items-center gap-2 sm:flex`}>
        <Toggle on={sp.get("overdue") === "1"} onClick={() => set({ overdue: sp.get("overdue") === "1" ? null : "1" })} label="Лише прострочені" tone="#e5283b" />
        <Toggle on={sp.get("done") === "open"} onClick={() => set({ done: sp.get("done") === "open" ? null : "open" })} label="Сховати виконані" tone="#16a34a" />
        {hasFilters && (
          <button
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-3 hover:text-ink"
            onClick={() => {
              const next = new URLSearchParams();
              const s = sp.get("sort");
              if (s) next.set("sort", s);
              go(next);
            }}
          >
            Скинути
          </button>
        )}
      </div>
    </div>
  );
}

function F({ value, onChange, options, all }: { value: string | null; onChange: (v: string | null) => void; options: SelectOption[]; all: string }) {
  return (
    <Select
      className="w-full sm:w-auto sm:min-w-[160px] sm:flex-[1_1_160px]"
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={[{ value: "", label: all }, ...options]}
      ariaLabel={all}
      searchPlaceholder="Знайти…"
      emptyText="Нічого не знайдено"
    />
  );
}

function Toggle({ on, onClick, label, tone }: { on: boolean; onClick: () => void; label: string; tone: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-all"
      style={on ? { background: tone, color: "#fff", boxShadow: `0 4px 12px ${tone}55` } : { background: "var(--sunken)", color: "var(--ink-2)" }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "#fff" : tone }} />
      {label}
    </button>
  );
}
