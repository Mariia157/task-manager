import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewStats, staffScopeWhere, taskScopeWhere } from "@/lib/access";
import { db } from "@/lib/db";
import { getDicts } from "@/lib/tasks";
import { dailySeries, personStats } from "@/lib/stats";
import { OVERDUE, fmtDateLong, fmtDayShort } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { DayBars } from "@/components/DayBars";
import { dayKey, startOfMonth } from "@/lib/time";

export const metadata = { title: "Статистика · Taskflow" };

const RANGES = [7, 14, 30] as const;

/** Статистика по задачам, видимым пользователю: руководитель группы — свои люди, направления — своё, админ — всё. */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ direction?: string; project?: string; days?: string }> }) {
  const user = await requireUser();
  if (!canViewStats(user)) notFound();
  const sp = await searchParams;
  const now = new Date();
  const days = RANGES.find((r) => String(r) === sp.days) ?? 14;
  const { directions, projects } = await getDicts();
  const direction = directions.find((d) => d.id === sp.direction)?.id;
  const project = projects.find((p) => p.id === sp.project)?.id;

  // свои люди: он сам + подчинённые и отделы по должности. Задачи, поставленные человеку
  // из другого отдела, в статистику руководителя не идут — этот человек не его сотрудник
  const staff = staffScopeWhere(user);
  const ownPeople = staff && Object.keys(staff).length === 0 ? {} : { OR: [{ assigneeId: user.id }, ...(staff ? [staff] : [])] };
  const tasks = await db.task.findMany({
    where: {
      AND: [taskScopeWhere(user), ownPeople, { archivedAt: null }, direction ? { directionId: direction } : {}, project ? { projectId: project } : {}],
    },
    select: { assigneeId: true, deadline: true, completedAt: true, lateOk: true, assignee: { select: { id: true, name: true, active: true } } },
  });
  const peopleMap = new Map(tasks.map((t) => [t.assigneeId, t.assignee]));
  if (user.level >= 2 && !direction && !project) {
    const subs = await db.user.findMany({ where: { id: { in: user.subordinateIds } }, select: { id: true, name: true, active: true } });
    for (const s of subs) peopleMap.set(s.id, s);
  }
  const people = [...peopleMap.values()];

  const rows = personStats(people, tasks, now).sort((a, b) => b.month - a.month || b.week - a.week || a.name.localeCompare(b.name, "uk"));
  const total = rows.reduce(
    (s, r) => ({ today: s.today + r.today, week: s.week + r.week, month: s.month + r.month, onTime: s.onTime + r.monthOnTime }),
    { today: 0, week: 0, month: 0, onTime: 0 },
  );
  const series = dailySeries(tasks, now, days).map((d) => ({
    key: d.key,
    short: fmtDayShort(d.date),
    long: fmtDateLong(d.date),
    closed: d.closed,
    onTime: d.onTime,
  }));

  const href = (patch: { direction?: string | null; project?: string | null; days?: number }) => {
    const p = new URLSearchParams();
    const dir = patch.direction === undefined ? direction : patch.direction;
    const prj = patch.project === undefined ? project : patch.project;
    const dd = patch.days ?? days;
    if (dir) p.set("direction", dir);
    if (prj) p.set("project", prj);
    if (dd !== 14) p.set("days", String(dd));
    const qs = p.toString();
    return qs ? `/stats?${qs}` : "/stats";
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div>
        <h1 className="text-[1.9rem] font-extrabold tracking-tight">Статистика</h1>
        <p className="mt-1 text-ink-3">Виконано = картка в колонці «Готово». Рахується за поточним виконавцем, у межах вашого доступу.</p>
      </div>

      <div className="space-y-2.5">
        <div className="scroll-x -mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip href={href({ direction: null })} on={!direction}>
            Усі відділи
          </Chip>
          {directions.map((d) => (
            <Chip key={d.id} href={href({ direction: d.id })} on={direction === d.id} color={d.color}>
              {d.name}
            </Chip>
          ))}
        </div>
        <div className="scroll-x -mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip href={href({ project: null })} on={!project}>
            Усі проєкти
          </Chip>
          {projects.map((p) => (
            <Chip key={p.id} href={href({ project: p.id })} on={project === p.id} color={p.color}>
              {p.name}
            </Chip>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Tile label="Сьогодні" value={total.today} />
        <Tile label="За тиждень" value={total.week} />
        <Tile label="За місяць" value={total.month} accent />
        <Tile label="Вчасно за місяць" value={total.month ? `${Math.round((total.onTime / total.month) * 100)}%` : "—"} sub={`${total.onTime} з ${total.month}`} />
      </section>

      <section className="card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">Виконано по днях</h2>
          <div className="flex gap-1 rounded-[13px] bg-sunken p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={href({ days: r })}
                scroll={false}
                aria-current={r === days ? "true" : undefined}
                className={`flex h-8 items-center rounded-[10px] px-3 text-sm font-bold ${r === days ? "bg-white text-ink shadow-[0_2px_8px_rgba(29,33,48,.12)]" : "text-ink-3 hover:text-ink"}`}
              >
                {r} дн.
              </Link>
            ))}
          </div>
        </div>
        <DayBars data={series} label="Виконано" onTimeLabel="вчасно" />
      </section>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Немає даних" />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="bg-panel text-xs font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-5 py-3.5">Працівник</th>
                  <th className="px-3 py-3.5 text-right">Сьогодні</th>
                  <th className="px-3 py-3.5 text-right">Тиждень</th>
                  <th className="px-3 py-3.5 text-right">Місяць</th>
                  <th className="px-3 py-3.5 text-right">Вчасно</th>
                  <th className="px-3 py-3.5 text-right">Відкрито</th>
                  <th className="px-3 py-3.5 text-right">Прострочено</th>
                  <th className="px-5 py-3.5 text-right">
                    <span className="sr-only">Звіт</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-panel">
                {rows.map((r) => {
                  const inactive = peopleMap.get(r.id)?.active === false;
                  const share = r.month ? Math.round((r.monthOnTime / r.month) * 100) : null;
                  return (
                    <tr key={r.id} className={inactive ? "opacity-60" : ""}>
                      <td className="px-5 py-3">
                        <Link href={`/tasks?assignee=${r.id}`} className="inline-flex items-center gap-3 font-semibold hover:underline">
                          <Avatar name={r.name} size={32} />
                          {r.name}
                          {inactive && <span className="text-xs font-medium text-ink-3">(вимкнено)</span>}
                        </Link>
                      </td>
                      <Num v={r.today} />
                      <Num v={r.week} />
                      <td className="px-3 py-3 text-right">
                        <span
                          className="inline-flex min-w-[2.5rem] justify-center rounded-full px-2.5 py-1 text-[0.95rem] font-extrabold text-white"
                          style={{ background: r.month ? "#16a34a" : "#c9c4ba" }}
                        >
                          {r.month}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold" style={{ color: share === null ? undefined : share >= 80 ? "#15803d" : share >= 50 ? "#b45f06" : "#c01428" }}>
                        {share === null ? <span className="text-ink-3">—</span> : `${share}%`}
                      </td>
                      <Num v={r.open} />
                      <td className="px-3 py-3 text-right">
                        {r.overdue ? (
                          <span className="inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 font-extrabold text-white" style={{ background: OVERDUE.bg }}>
                            {r.overdue}
                          </span>
                        ) : (
                          <span className="text-ink-3">0</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/reports?${new URLSearchParams({ user: r.id, from: dayKey(startOfMonth(now)), to: dayKey(now) })}`} className="btn btn-soft btn-sm">
                          Звіт
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Num({ v }: { v: number }) {
  return <td className={`px-3 py-3 text-right font-bold ${v ? "" : "text-ink-3"}`}>{v}</td>;
}

function Tile({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "!bg-[#16a34a] text-white shadow-[0_10px_26px_rgba(22,163,74,.3)]" : ""}`}>
      <div className={`text-sm font-semibold ${accent ? "text-white/85" : "text-ink-3"}`}>{label}</div>
      <div className="mt-2 text-[2.2rem] font-extrabold leading-none">{value}</div>
      {sub && <div className={`mt-1.5 text-sm ${accent ? "text-white/80" : "text-ink-3"}`}>{sub}</div>}
    </div>
  );
}

function Chip({ href, on, children, color }: { href: string; on: boolean; children: React.ReactNode; color?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-all ${
        on ? "bg-ink text-white shadow-[0_6px_16px_rgba(29,33,48,.25)]" : "bg-card text-ink-2 shadow-[var(--shadow-sm)] hover:-translate-y-0.5"
      }`}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "#fff" : color }} />}
      {children}
    </Link>
  );
}
