import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageRecurring } from "@/lib/access";
import { manageableRecurring } from "@/lib/recurringView";
import { addDays, dayKey, startOfDay } from "@/lib/time";
import { fmtDayShort, isDoneLate, priorityMeta } from "@/lib/format";
import { deleteRecurringAction } from "@/app/actions/recurring";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconEdit, IconPlus, IconRepeat, IconTrash } from "@/components/icons";

export const metadata = { title: "Щоденні задачі · Taskflow" };

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default async function RecurringPage() {
  const user = await requireUser();
  if (!canManageRecurring(user)) redirect("/");
  const list = await manageableRecurring(user);
  const now = new Date();
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(now), i - 13));
  const history = await db.task.findMany({
    where: { recurringId: { in: list.map((r) => r.id) }, recurringDay: { gte: dayKey(days[0]) } },
    select: { id: true, recurringId: true, recurringDay: true, completedAt: true, deadline: true, lateOk: true },
  });

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">Щоденні задачі</h1>
          <p className="mt-1 text-ink-3">Повторюються за розкладом: картка з’являється сама в потрібні дні, бот нагадує до строку. Позначки виконання зберігаються по днях.</p>
        </div>
        <Link href="/recurring/new" className="btn btn-primary">
          <IconPlus size={17} />
          Нова щоденна задача
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Щоденних задач поки немає" hint="Наприклад: звіт по продажах до 9:00 щодня." />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map((r) => {
            const pm = priorityMeta(r.priority);
            const marks = new Map(history.filter((h) => h.recurringId === r.id).map((h) => [h.recurringDay, h]));
            return (
              <article key={r.id} className={`card p-4 sm:p-5 ${r.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start gap-4">
                  <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-white sm:flex" style={{ background: r.direction.color }}>
                    <IconRepeat size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold">{r.title}</h2>
                      {!r.active && <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-bold text-ink-2">вимкнена</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar name={r.assignee.name} size={22} />
                        {r.assignee.name}
                      </span>
                      <span className="font-bold">до {r.dueTime}</span>
                      <span>{r.weekdays === "1234567" ? "щодня" : [...r.weekdays].map((d) => DAY_NAMES[+d - 1]).join(", ")}</span>
                      <span className="font-bold" style={{ color: r.direction.color }}>
                        {r.direction.name}
                        {r.subtype && ` · ${r.subtype.name}`}
                      </span>
                      <span className="font-bold" style={{ color: pm.text }}>
                        {pm.label}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: r.project.color }} />
                        {r.project.name}
                      </span>
                      <span className="text-ink-3">{r.remindBefore ? `нагадування за ${r.remindBefore} хв` : "без нагадування"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/recurring/${r.id}`} className="btn btn-soft btn-sm" aria-label="Змінити">
                      <IconEdit size={15} />
                    </Link>
                    <form action={deleteRecurringAction.bind(null, r.id)}>
                      <button className="btn btn-soft btn-sm" aria-label="Видалити щоденну задачу">
                        <IconTrash size={15} />
                      </button>
                    </form>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3">Останні 14 днів</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {days.map((d) => {
                      const k = dayKey(d);
                      const m = marks.get(k);
                      const state = !m ? "none" : m.completedAt ? (isDoneLate(m) ? "late" : "done") : m.deadline && m.deadline < now ? "miss" : "open";
                      const style = {
                        none: { bg: "var(--panel)", fg: "var(--ink-3)", t: "не було" },
                        done: { bg: "#16a34a", fg: "#fff", t: "вчасно" },
                        late: { bg: "#f08a0c", fg: "#fff", t: "із запізненням" },
                        miss: { bg: "#e5283b", fg: "#fff", t: "не виконано" },
                        open: { bg: "#dbe6fb", fg: "#1d4ed8", t: "в роботі" },
                      }[state];
                      const cell = (
                        <span
                          className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[11px] text-[0.68rem] font-bold leading-tight"
                          style={{ background: style.bg, color: style.fg }}
                          title={`${fmtDayShort(d)} — ${style.t}`}
                        >
                          {fmtDayShort(d)}
                        </span>
                      );
                      return m ? (
                        <Link key={k} href={`/tasks/${m.id}`} className="transition-transform hover:-translate-y-0.5">
                          {cell}
                        </Link>
                      ) : (
                        <span key={k}>{cell}</span>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-ink-3">
                    {[
                      ["#16a34a", "вчасно"],
                      ["#f08a0c", "із запізненням"],
                      ["#e5283b", "не виконано"],
                      ["#dbe6fb", "в роботі"],
                    ].map(([c, t]) => (
                      <span key={t} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
