"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import type { RecState } from "@/app/actions/recurring";
import { Select } from "@/components/ui/Select";
import { TimeField } from "@/components/ui/TimeField";
import { AutoTextarea } from "@/components/ui/AutoTextarea";
import { Switch } from "@/components/ui/Switch";
import { PRIORITY_META } from "@/lib/format";

type Dir = { id: string; name: string; color: string; subtypeLabel: string; subtypes: { id: string; name: string }[] };

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export function RecurringForm({
  action,
  initial,
  projects,
  directions,
  people,
  isEdit,
}: {
  action: (p: RecState, f: FormData) => Promise<RecState>;
  initial: {
    title: string;
    description: string;
    assigneeId: string;
    projectId: string;
    directionId: string;
    subtypeId: string;
    priority: string;
    dueTime: string;
    weekdays: string;
    remindBefore: number;
    active: boolean;
  };
  projects: { value: string; label: string; color: string }[];
  directions: Dir[];
  people: { value: string; label: string; avatar: string }[];
  isEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [directionId, setDirectionId] = useState(initial.directionId);
  const [subtypeId, setSubtypeId] = useState(initial.subtypeId);
  const [days, setDays] = useState(initial.weekdays);
  const [priority, setPriority] = useState(initial.priority);
  const dir = directions.find((d) => d.id === directionId);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7">
      <div>
        <label className="label" htmlFor="title">Назва</label>
        <input id="title" name="title" required maxLength={200} defaultValue={initial.title} className="field text-lg font-semibold" placeholder="Наприклад: звіт по продажах" />
      </div>
      <div>
        <label className="label" htmlFor="description">Що зробити</label>
        <AutoTextarea id="description" name="description" minRows={2} maxLength={5000} defaultValue={initial.description} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="assigneeId">Виконавець</label>
          <Select id="assigneeId" name="assigneeId" options={people} defaultValue={initial.assigneeId} required placeholder="Кому" searchPlaceholder="Знайти…" />
        </div>
        <div>
          <label className="label" htmlFor="projectId">Проєкт (дошка)</label>
          <Select id="projectId" name="projectId" options={projects} defaultValue={initial.projectId} required placeholder="Куди" />
        </div>
        <div>
          <label className="label" htmlFor="directionId">Відділ</label>
          <Select
            id="directionId"
            name="directionId"
            value={directionId}
            onChange={(v) => {
              setDirectionId(v);
              setSubtypeId("");
            }}
            required
            options={directions.map((d) => ({ value: d.id, label: d.name, color: d.color }))}
          />
        </div>
        {dir && dir.subtypes.length > 0 ? (
          <div>
            <label className="label" htmlFor="subtypeId">{dir.subtypeLabel}</label>
            <Select
              id="subtypeId"
              name="subtypeId"
              value={subtypeId}
              onChange={setSubtypeId}
              options={[{ value: "", label: "Не вказано" }, ...dir.subtypes.map((s) => ({ value: s.id, label: s.name })), { value: "__new", label: "✎ Вписати вручну" }]}
            />
            {subtypeId === "__new" && (
              <input
                name="subtypeNew"
                className="field mt-2.5"
                maxLength={60}
                autoFocus
                required
                placeholder={`Впишіть: ${dir.subtypeLabel.toLowerCase()}`}
                aria-label={`${dir.subtypeLabel} — вручну`}
              />
            )}
          </div>
        ) : (
          <input type="hidden" name="subtypeId" value="" />
        )}
      </div>

      <div>
        <span className="label">Пріоритет</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRIORITY_META) as (keyof typeof PRIORITY_META)[]).map((p) => {
            const m = PRIORITY_META[p];
            const on = p === priority;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => setPriority(p)}
                className="h-10 rounded-[13px] px-4 text-sm font-bold transition-all"
                style={on ? { background: m.color, color: "#fff", boxShadow: `0 6px 14px ${m.color}55` } : { background: m.soft, color: m.text }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="priority" value={priority} />
      </div>

      <div className="grid gap-5 sm:grid-cols-[150px_1fr_200px]">
        <div>
          <label className="label">Строк протягом дня</label>
          <TimeField name="dueTime" defaultValue={initial.dueTime} ariaLabel="Строк" />
        </div>
        <div>
          <span className="label">Дні</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const k = String(i + 1);
              const on = days.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  aria-label={d}
                  onClick={() => setDays(on ? days.replace(k, "") : [...days, k].sort().join(""))}
                  className={`h-[2.85rem] w-11 rounded-[13px] text-sm font-bold transition-all ${on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-sunken text-ink-3"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {[...days].map((k) => (
            <input key={k} type="hidden" name="weekdays" value={k} />
          ))}
        </div>
        <div>
          <label className="label" htmlFor="remindBefore">Нагадати в Telegram за</label>
          <Select
            id="remindBefore"
            name="remindBefore"
            defaultValue={String(initial.remindBefore)}
            options={[
              { value: "0", label: "Не нагадувати" },
              { value: "15", label: "15 хвилин" },
              { value: "30", label: "30 хвилин" },
              { value: "60", label: "1 година" },
              { value: "120", label: "2 години" },
              { value: "180", label: "3 години" },
            ]}
          />
        </div>
      </div>

      {isEdit && <Switch name="active" defaultChecked={initial.active} label="Активна" hint="Вимкнена щоденна задача не створює картки" />}

      {state.error && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {state.error}
        </div>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {isEdit ? "Зберегти" : "Створити щоденну задачу"}
        </button>
        <Link href="/recurring" className="btn btn-soft">
          Скасувати
        </Link>
      </div>
    </form>
  );
}
