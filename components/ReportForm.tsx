"use client";

import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";

type Preset = { id: string; label: string; from: string; to: string };

const LABELS = { today: "Сьогодні", tomorrow: "Завтра", week: "За тиждень", prev: "Попередній місяць", next: "Наступний місяць" };

/** Выбор сотрудника и периода. Отправка — обычный GET, чтобы ссылку на отчёт можно было переслать. */
export function ReportForm({
  people,
  presets,
  today,
  initial,
}: {
  people: SelectOption[];
  presets: Preset[];
  today: string;
  initial: { user: string; from: string; to: string };
}) {
  const [range, setRange] = useState({ from: initial.from, to: initial.to });
  const active = presets.find((p) => p.from === range.from && p.to === range.to)?.id;

  return (
    <form method="get" action="/reports" className="card space-y-5 p-5 sm:p-7">
      <div className="sm:max-w-[420px]">
        <label className="label" htmlFor="user">Працівник</label>
        <Select id="user" name="user" options={people} defaultValue={initial.user} required placeholder="Виберіть працівника" searchPlaceholder="Знайти…" emptyText="Нікого не знайдено" />
      </div>

      <div>
        <span className="label">Період</span>
        <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1 sm:flex-wrap">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={active === p.id}
              onClick={() => setRange({ from: p.from, to: p.to })}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-all ${
                active === p.id ? "bg-ink text-white shadow-[0_6px_16px_rgba(29,33,48,.25)]" : "bg-panel text-ink-2 hover:bg-sunken"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:max-w-[620px]">
          <div>
            <span className="label">З</span>
            {/* key: при выборе готового периода поле пересоздаётся с новой датой */}
            <DateField key={`f${range.from}`} name="from" defaultValue={range.from} today={today} locale="uk" labels={LABELS} required />
          </div>
          <div>
            <span className="label">По (включно)</span>
            <DateField key={`t${range.to}`} name="to" defaultValue={range.to} today={today} locale="uk" labels={LABELS} required />
          </div>
        </div>
      </div>

      <button className="btn btn-primary">Показати звіт</button>
    </form>
  );
}
