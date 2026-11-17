import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEVEL_NAME, isAdmin, taskScopeWhere } from "@/lib/access";
import { cardInclude } from "@/lib/tasks";
import { fmtDateLong, fmtTime, isOverdue, plural, workDayView } from "@/lib/format";
import { addDays, dayKey, startOfDay } from "@/lib/time";
import { WorkDayCard } from "@/components/WorkDayCard";
import { TaskCard } from "@/components/task/TaskCard";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCheck, IconFire, IconInbox, IconRepeat } from "@/components/icons";

export const metadata = { title: "Огляд · Taskflow" };

export default async function Dashboard() {
  const user = await requireUser();
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const scope = { AND: [taskScopeWhere(user), { archivedAt: null }] };

  const [workToday, lastWork, places, visible, recurringToday, pending] = await Promise.all([
    db.workDay.findUnique({ where: { userId_day: { userId: user.id, day: dayKey(now) } } }),
    db.workDay.findFirst({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, select: { place: true } }),
    db.workPlace.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
    db.task.findMany({ where: scope, include: cardInclude }),
    db.task.findMany({
      where: { assigneeId: user.id, recurringId: { not: null }, archivedAt: null, deadline: { gte: today, lt: tomorrow } },
      include: { column: true },
      orderBy: { deadline: "asc" },
    }),
    isAdmin(user)
      ? db.request.findMany({ where: { status: "PENDING" }, include: { requester: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 5 })
      : Promise.resolve([]),
  ]);

  const open = visible.filter((t) => !t.completedAt);
  const mineOpen = open.filter((t) => t.assigneeId === user.id);
  const late = open.filter((t) => isOverdue(t, now));
  const dueToday = open.filter((t) => t.deadline && t.deadline >= now && t.deadline < tomorrow);
  const doneToday = visible.filter((t) => t.completedAt && t.completedAt >= today);
  const manager = user.level >= 2;

  const tiles = [
    { label: manager ? "Відкриті задачі" : "Мої відкриті", value: manager ? open.length : mineOpen.length, color: "#2563eb", href: manager ? "/tasks?done=open" : "/my" },
    { label: "Прострочено", value: (manager ? late : late.filter((t) => t.assigneeId === user.id)).length, color: "#e5283b", href: "/tasks?overdue=1" },
    { label: "Строк сьогодні", value: (manager ? dueToday : dueToday.filter((t) => t.assigneeId === user.id)).length, color: "#f08a0c", href: "/my" },
    { label: "Виконано сьогодні", value: (manager ? doneToday : doneToday.filter((t) => t.assigneeId === user.id)).length, color: "#16a34a", href: "/tasks?done=done" },
  ];

  // разбивка по направлениям и по людям — для руководителей
  const byDirection = new Map<string, { name: string; color: string; open: number; late: number }>();
  for (const t of open) {
    const r = byDirection.get(t.directionId) ?? { name: t.direction.name, color: t.direction.color, open: 0, late: 0 };
    r.open++;
    if (isOverdue(t, now)) r.late++;
    byDirection.set(t.directionId, r);
  }
  const byPerson = new Map<string, { name: string; open: number; late: number }>();
  for (const t of open) {
    const r = byPerson.get(t.assigneeId) ?? { name: t.assignee.name, open: 0, late: 0 };
    r.open++;
    if (isOverdue(t, now)) r.late++;
    byPerson.set(t.assigneeId, r);
  }
  const people = [...byPerson.values()].sort((a, b) => b.late - a.late || b.open - a.open).slice(0, 10);
  const maxOpen = Math.max(1, ...people.map((p) => p.open));
  const upcoming = (manager ? open : mineOpen)
    .filter((t) => t.deadline)
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <div>
        <div className="text-sm font-semibold capitalize text-ink-3">{fmtDateLong(now)}</div>
        <h1 className="text-[1.9rem] font-extrabold tracking-tight">Привіт, {user.name.split(" ")[0]}</h1>
        <p className="text-ink-3">
          {LEVEL_NAME[user.level]}
          {user.roleNames.length > 0 && ` · ${user.roleNames.join(", ")}`}
        </p>
      </div>

      <WorkDayCard today={workToday ? workDayView(workToday) : null} places={places.map((p) => p.name)} lastPlace={lastWork?.place ?? null} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card lift relative overflow-hidden p-5">
            <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-15" style={{ background: t.color }} aria-hidden="true" />
            <div className="text-[2.4rem] font-extrabold leading-none tabular-nums" style={{ color: t.value ? t.color : "var(--ink-3)" }}>
              {t.value}
            </div>
            <div className="mt-2 text-sm font-bold text-ink-2">{t.label}</div>
          </Link>
        ))}
      </div>

      {recurringToday.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
            <IconRepeat size={18} />
            Щоденні задачі на сьогодні
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recurringToday.map((t) => {
              const done = !!t.completedAt;
              const lateR = !done && t.deadline! < now;
              return (
                <Link key={t.id} href={`/tasks/${t.id}`} className="card lift flex items-center gap-3 p-4">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white"
                    style={{ background: done ? "#16a34a" : lateR ? "#e5283b" : "#f08a0c" }}
                  >
                    {done ? <IconCheck size={18} /> : lateR ? <IconFire size={18} /> : <IconRepeat size={18} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{t.title}</span>
                    <span className="block text-sm text-ink-3">
                      до {fmtTime(t.deadline!)} · {done ? "виконано" : lateR ? "прострочено" : t.column.name}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <IconInbox size={18} />
            <h2 className="text-lg font-extrabold">Чекають вашого рішення</h2>
            <Link href="/requests" className="ml-auto text-sm font-bold text-ink-3 hover:text-ink">
              Усі запити →
            </Link>
          </div>
          <ul className="zebra overflow-hidden rounded-[14px]">
            {pending.map((r) => {
              const title = (JSON.parse(r.payload) as { title: string }).title;
              return (
                <li key={r.id}>
                  <Link href="/requests" className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                    <Avatar name={r.requester.name} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{title}</span>
                      <span className="block text-sm text-ink-3">
                        {r.type === "ASSIGN" ? "Призначення" : "Запит"} от {r.requester.name}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {manager && byDirection.size > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-extrabold">За відділами</h2>
            <div className="grid grid-cols-2 gap-3">
              {[...byDirection.entries()].map(([id, d]) => (
                <Link key={id} href={`/tasks?direction=${id}&done=open`} className="lift rounded-[16px] bg-panel p-4 hover:bg-white hover:shadow-[var(--shadow)]">
                  <div className="flex items-center gap-2 font-bold">
                    <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold tabular-nums">{d.open}</div>
                  <div className="text-sm text-ink-3">
                    {plural(d.open, "відкрита", "відкриті", "відкритих")}
                    {d.late > 0 && <span className="font-bold text-[#c01428]"> · {d.late} прострочено</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-extrabold">Відкриті задачі за працівниками</h2>
            <ul className="space-y-3">
              {people.map((p) => (
                <li key={p.name} className="flex items-center gap-3">
                  <Avatar name={p.name} size={30} />
                  <span className="w-32 shrink-0 truncate text-sm font-bold">{p.name}</span>
                  <span className="flex h-3 flex-1 gap-[2px] overflow-hidden rounded-full bg-panel">
                    {p.late > 0 && <span style={{ width: `${(p.late / maxOpen) * 100}%`, background: "#e5283b" }} />}
                    <span style={{ width: `${((p.open - p.late) / maxOpen) * 100}%`, background: "#2563eb" }} />
                  </span>
                  <span className="w-[8.5rem] shrink-0 text-right text-sm font-bold tabular-nums">
                    {p.open}
                    {p.late > 0 && <span className="font-semibold text-[#c01428]"> · {p.late} прострочено</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex gap-4 text-xs font-semibold text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                відкрито
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e5283b]" />
                прострочено
              </span>
            </p>
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold">Найближчі дедлайни</h2>
        {upcoming.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((t) => (
              <TaskCard key={t.id} t={t} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState title="Строків попереду немає" />
        )}
      </section>
    </div>
  );
}
