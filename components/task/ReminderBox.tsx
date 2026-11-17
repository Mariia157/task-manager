"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { addReminderAction, deleteReminderAction } from "@/app/actions/tasks";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { IconX } from "@/components/icons";

type R = { id: string; remindAt: Date; note: string; user: { id: string; name: string } };

const LABELS = { today: "Сьогодні", tomorrow: "Завтра", week: "За тиждень", prev: "Попередній місяць", next: "Наступний місяць" };

/** «⏰ Напомнить»: бот пришлёт сообщение в выбранное время. Руководитель задачи может напомнить исполнителю. */
export function ReminderBox({
  taskId,
  reminders,
  meId,
  canRemindAssignee,
  assigneeName,
  hasDeadline,
  today,
  botConnected,
  fmt,
}: {
  taskId: string;
  reminders: R[];
  meId: string;
  canRemindAssignee: boolean;
  assigneeName: string;
  hasDeadline: boolean;
  today: string;
  botConnected: boolean;
  /** подписи времени готовим на сервере (часовой пояс Киева) */
  fmt: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(addReminderAction.bind(null, taskId), {});
  const [, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const [target, setTarget] = useState<"me" | "assignee">("me");
  const preset = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const send = (p: string) => {
    if (preset.current) preset.current.value = p;
    form.current?.requestSubmit();
  };

  return (
    <div>
      {reminders.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-[12px] bg-panel px-3 py-2 text-sm">
              <span aria-hidden="true">⏰</span>
              <span className="min-w-0 flex-1">
                <span className="font-bold">{fmt[r.id]}</span>
                {r.user.id !== meId && <span className="text-ink-3"> · для {r.user.name}</span>}
                {r.note && <span className="block truncate text-xs text-ink-3">{r.note}</span>}
              </span>
              <button
                type="button"
                onClick={() => start(() => deleteReminderAction(r.id))}
                aria-label="Прибрати нагадування"
                className="rounded-lg p-1 text-ink-3 hover:text-[#c01428]"
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form ref={form} action={action} className="space-y-2.5">
        <input ref={preset} type="hidden" name="preset" defaultValue="" />
        <input type="hidden" name="target" value={target} />
        {canRemindAssignee && (
          <div className="flex gap-1 rounded-[12px] bg-sunken p-1 text-sm font-bold">
            {(["me", "assignee"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={target === t}
                onClick={() => setTarget(t)}
                className={`h-8 flex-1 truncate rounded-[9px] px-2 ${target === t ? "bg-white text-ink shadow-sm" : "text-ink-3"}`}
              >
                {t === "me" ? "Мені" : assigneeName.split(" ")[0]}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {[
            ["1h", "Через годину"],
            ["3h", "За 3 години"],
            ["tomorrow", "Завтра о 9:00"],
            ...(hasDeadline ? [["beforeDeadline", "За годину до строку"]] : []),
          ].map(([k, l]) => (
            <button key={k} type="button" disabled={pending} onClick={() => send(k)} className="h-9 rounded-full bg-panel px-3 text-[0.8rem] font-bold text-ink-2 hover:bg-sunken">
              {l}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={custom}
            onClick={() => setCustom(!custom)}
            className={`h-9 rounded-full px-3 text-[0.8rem] font-bold ${custom ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-sunken"}`}
          >
            Свій час
          </button>
        </div>
        {custom && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <DateField name="date" defaultValue={today} today={today} locale="uk" labels={LABELS} />
              </div>
              <div className="w-[112px]">
                <TimeField name="time" defaultValue="10:00" ariaLabel="Час" />
              </div>
            </div>
            <input name="note" maxLength={200} placeholder="Нотатка (необов’язково)" className="field" />
            <button type="button" disabled={pending} onClick={() => send("")} className="btn btn-primary btn-sm w-full">
              Нагадати
            </button>
          </div>
        )}
      </form>
      {state.error && <div className="mt-2 text-sm font-semibold text-[#c01428]">{state.error}</div>}
      {state.ok && <div className="mt-2 text-sm font-semibold text-[#15803d]">{state.ok}</div>}
      {!botConnected && target === "me" && (
        <p className="mt-2 text-xs text-ink-3">Нагадування приходять у Telegram — підключіть бота в «Профілі».</p>
      )}
    </div>
  );
}
