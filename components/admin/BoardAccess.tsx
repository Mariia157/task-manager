"use client";

import { useEffect, useState, useTransition } from "react";
import { setBoardAccessAction } from "@/app/actions/admin";
import { Avatar } from "@/components/ui/Avatar";

type Person = { id: string; name: string; level: number };

/** Выбор доступа: «Все сотрудники» или «Только выбранные» + отметки людей. Отдаёт поля access и members в форму. */
export function AccessPicker({ people, initialAll, initialIds }: { people: Person[]; initialAll: boolean; initialIds: string[] }) {
  const [all, setAll] = useState(initialAll);
  const [ids, setIds] = useState(initialIds);
  const staff = people.filter((p) => p.level < 4);
  return (
    <div className="space-y-3">
      <input type="hidden" name="access" value={all ? "all" : "selected"} />
      {!all && ids.map((id) => <input key={id} type="hidden" name="members" value={id} />)}
      <div className="flex gap-1 rounded-[13px] bg-sunken p-1 text-sm font-bold">
        {[
          [false, "Лише вибрані"],
          [true, "Усі працівники"],
        ].map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={all === v}
            onClick={() => setAll(v as boolean)}
            className={`h-9 flex-1 rounded-[10px] px-3 ${all === v ? "bg-white text-ink shadow-sm" : "text-ink-3"}`}
          >
            {l as string}
          </button>
        ))}
      </div>
      {all ? (
        <p className="text-sm text-ink-3">Дошку бачать усі. Задачі на ній кожен бачить за своїм рівнем доступу.</p>
      ) : (
        <>
          <p className="text-sm text-ink-3">
            Дошку бачать лише позначені й адміни. Іншим можна ставити задачі на цій дошці — вони побачать лише свої задачі, але не дошку.
          </p>
          <div className="flex flex-wrap gap-2">
            {staff.map((p) => {
              const on = ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setIds(on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}
                  className={`inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition-all ${
                    on ? "bg-ink text-white shadow-[0_4px_12px_rgba(29,33,48,.25)]" : "bg-panel text-ink-2 hover:bg-sunken"
                  }`}
                >
                  <Avatar name={p.name} size={28} />
                  {p.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-3">Позначено: {ids.length}</p>
        </>
      )}
    </div>
  );
}

/** Кнопка «Доступ» на доске / в админке: окно с выбором и сохранением. */
export function BoardAccessButton({ projectId, name, people, accessAll, memberIds }: { projectId: string; name: string; people: Person[]; accessAll: boolean; memberIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-soft btn-sm">
        {accessAll ? "🌐 Доступ: усі" : `🔒 Доступ: ${memberIds.length}`}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Доступ до дошки «${name}»`}>
          <button className="absolute inset-0 bg-[#1d2130]/40" aria-label="Закрити" onClick={() => setOpen(false)} />
          <form
            action={(f) =>
              start(async () => {
                await setBoardAccessAction(projectId, f);
                setOpen(false);
              })
            }
            className="pop relative max-h-[90vh] w-full max-w-[640px] space-y-4 overflow-y-auto p-6"
          >
            <h2 className="text-xl font-extrabold">Доступ до дошки «{name}»</h2>
            <AccessPicker people={people} initialAll={accessAll} initialIds={memberIds} />
            <div className="flex gap-2.5">
              <button className="btn btn-primary flex-1" disabled={pending}>
                Зберегти доступ
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-soft">
                Скасувати
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
