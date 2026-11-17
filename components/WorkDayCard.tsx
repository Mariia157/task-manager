"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endDayAction, startDayAction, type WorkDayState } from "@/app/actions/workday";

export type WorkDayView = { place: string; start: string; end: string | null; duration: string | null };

/**
 * Отметка рабочего дня на главной: место работы → «Начало дня», вечером — «Конец дня».
 * Время приходит уже отформатированным по Киеву (с сервера).
 */
export function WorkDayCard({ today, places, lastPlace }: { today: WorkDayView | null; places: string[]; lastPlace: string | null }) {
  const [place, setPlace] = useState(lastPlace && places.includes(lastPlace) ? lastPlace : "");
  const [state, start, starting] = useActionState<WorkDayState, FormData>(startDayAction, {});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [endError, setEndError] = useState("");
  const [ending, run] = useTransition();
  const router = useRouter();

  const tone = !today ? "#f08a0c" : today.end ? "#16a34a" : "#2563eb";

  return (
    <section className="card relative overflow-hidden p-5 sm:p-6" aria-label="Робочий день">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone }} aria-hidden="true" />
      {!today && (
        <form action={start} className="space-y-3.5">
          <div>
            <h2 className="text-lg font-extrabold">Робочий день не розпочато</h2>
            <p className="text-sm text-ink-3">Виберіть, де ви сьогодні працюєте, і позначте початок дня.</p>
          </div>
          <input type="hidden" name="place" value={place} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Місце роботи">
            {places.map((p) => {
              const on = p === place;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPlace(p)}
                  className={`h-11 rounded-[14px] px-4 text-[0.95rem] font-bold transition-all hover:-translate-y-0.5 ${on ? "bg-ink text-white shadow-[0_6px_16px_rgba(29,33,48,0.25)]" : "bg-sunken text-ink-2"}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={!place || starting}>
              Початок дня
            </button>
            {state.error && <span className="text-sm font-semibold text-[#c01428]">{state.error}</span>}
          </div>
        </form>
      )}

      {today && !today.end && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">Робочий день триває</h2>
            <p className="text-ink-2">
              з <b className="tabular-nums">{today.start}</b> · {today.place}
            </p>
          </div>
          {!confirmEnd ? (
            <button type="button" onClick={() => setConfirmEnd(true)} className="btn btn-primary">
              Кінець дня
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-2">Завершити робочий день?</span>
              <button
                type="button"
                disabled={ending}
                onClick={() =>
                  run(async () => {
                    const r = await endDayAction();
                    setEndError(r.error ?? "");
                    setConfirmEnd(false);
                    router.refresh();
                  })
                }
                className="btn btn-primary btn-sm"
              >
                Так, кінець дня
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="btn btn-soft btn-sm">
                Скасувати
              </button>
            </div>
          )}
          {endError && <div className="w-full text-sm font-semibold text-[#c01428]">{endError}</div>}
        </div>
      )}

      {today?.end && (
        <div>
          <h2 className="text-lg font-extrabold">Робочий день закрито</h2>
          <p className="text-ink-2">
            <b className="tabular-nums">
              {today.start}–{today.end}
            </b>{" "}
            · {today.duration} · {today.place}
          </p>
        </div>
      )}
    </section>
  );
}
