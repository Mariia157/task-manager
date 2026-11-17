import "server-only";
import { db } from "@/lib/db";
import { canViewStats, staffScopeWhere, taskScopeWhere } from "@/lib/access";
import { getDicts } from "@/lib/tasks";
import { addDays, dayKey, fromZoned, startOfDay, startOfMonth, startOfWeek } from "@/lib/time";
import type { CurrentUser } from "@/lib/auth";
import { isDoneLate } from "@/lib/format";

/** Период отчёта: даты по Киеву, обе включительно. */
export type Period = { from: string; to: string };

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseKey = (k: string) => {
  const m = KEY.exec(k);
  return m ? fromZoned(+m[1], +m[2], +m[3]) : null;
};

/** Готовые периоды для кнопок. */
export function presets(now = new Date()) {
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  const prevMonth = startOfMonth(addDays(month, -1));
  return [
    { id: "today", label: "Сьогодні", from: dayKey(today), to: dayKey(today) },
    { id: "yesterday", label: "Учора", from: dayKey(addDays(today, -1)), to: dayKey(addDays(today, -1)) },
    { id: "week", label: "Цей тиждень", from: dayKey(week), to: dayKey(today) },
    { id: "prevweek", label: "Минулий тиждень", from: dayKey(addDays(week, -7)), to: dayKey(addDays(week, -1)) },
    { id: "month", label: "Цей місяць", from: dayKey(month), to: dayKey(today) },
    { id: "prevmonth", label: "Минулий місяць", from: dayKey(prevMonth), to: dayKey(addDays(month, -1)) },
    { id: "30d", label: "30 днів", from: dayKey(addDays(today, -29)), to: dayKey(today) },
  ];
}

/** Проверить и нормализовать период: не больше года, «с» не позже «по». */
export function parsePeriod(from?: string, to?: string): { period: Period; start: Date; end: Date } | null {
  const s = from ? parseKey(from) : null;
  const e = to ? parseKey(to) : null;
  if (!s || !e || s > e) return null;
  const end = addDays(e, 1); // конец дня «по» включительно
  if (end.getTime() - s.getTime() > 367 * 86400_000) return null;
  return { period: { from: from!, to: to! }, start: s, end };
}

/** Кого пользователь может выбрать в отчёте: те, чьи задачи он видит (админ — всех). */
export async function reportPeople(viewer: CurrentUser) {
  if (!canViewStats(viewer)) return [];
  const { people } = await getDicts();
  if (viewer.level >= 4) return people;
  // свои люди: он сам, подчинённые и те, чьи задачи он видит по должности (отдел по гранту)
  const staff = staffScopeWhere(viewer);
  const ids = staff ? await db.task.findMany({ where: staff, select: { assigneeId: true }, distinct: ["assigneeId"] }) : [];
  const set = new Set([viewer.id, ...viewer.subordinateIds, ...ids.map((i) => i.assigneeId)]);
  return people.filter((p) => set.has(p.id));
}

const taskSelect = {
  id: true,
  title: true,
  priority: true,
  deadline: true,
  completedAt: true,
  lateOk: true,
  createdAt: true,
  archivedAt: true,
  recurringId: true,
  recurringDay: true,
  business: true,
  project: { select: { name: true } },
  direction: { select: { name: true } },
  subtype: { select: { name: true } },
  column: { select: { name: true } },
} as const;

export async function buildReport(viewer: CurrentUser, personId: string, p: { period: Period; start: Date; end: Date }, now = new Date()) {
  const people = await reportPeople(viewer);
  const person = people.find((x) => x.id === personId);
  if (!person) return null; // чужой сотрудник — как будто его нет
  const scope = { AND: [taskScopeWhere(viewer), { assigneeId: personId }] };
  const inPeriod = { gte: p.start, lt: p.end };

  const [completed, assigned, open, recurring, comments, work] = await Promise.all([
    db.task.findMany({ where: { AND: [scope, { completedAt: inPeriod }] }, select: taskSelect, orderBy: { completedAt: "asc" } }),
    db.task.findMany({ where: { AND: [scope, { createdAt: inPeriod, recurringId: null }] }, select: { id: true } }),
    db.task.findMany({ where: { AND: [scope, { completedAt: null, archivedAt: null, recurringId: null }] }, select: taskSelect, orderBy: [{ deadline: "asc" }] }),
    db.task.findMany({
      where: { AND: [scope, { recurringId: { not: null }, recurringDay: { gte: p.period.from, lte: p.period.to } }] },
      select: taskSelect,
      orderBy: { recurringDay: "asc" },
    }),
    db.comment.count({ where: { authorId: personId, createdAt: inPeriod, task: scope } }),
    // отметки рабочего дня: место, начало, конец
    db.workDay.findMany({ where: { userId: personId, day: { gte: p.period.from, lte: p.period.to } }, orderBy: { day: "asc" } }),
  ]);
  const workMinutes = work.reduce((a, w) => a + (w.endedAt ? Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000) : 0), 0);

  const onTime = (t: { deadline: Date | null; completedAt: Date | null; lateOk: boolean }) => t.completedAt !== null && !isDoneLate(t);
  const done = completed.filter((t) => !t.recurringId);
  const recDone = recurring.filter((t) => t.completedAt);
  const lateNow = open.filter((t) => t.deadline && t.deadline < now);

  const count = (list: typeof done, key: (t: (typeof done)[number]) => string) => {
    const m = new Map<string, number>();
    for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  return {
    person: { id: person.id, name: person.name, roles: person.roles.map((r) => r.role.name) },
    period: p.period,
    generatedAt: now,
    generatedBy: viewer.name,
    // при неполном доступе (не админ) отчёт ограничен видимыми задачами — пишем это в шапке
    partial: viewer.level < 4,
    summary: {
      done: done.length,
      doneOnTime: done.filter(onTime).length,
      doneLate: done.filter((t) => !onTime(t)).length,
      assigned: assigned.length,
      openNow: open.length,
      lateNow: lateNow.length,
      recurringDays: recurring.length,
      recurringDone: recDone.length,
      recurringOnTime: recDone.filter(onTime).length,
      comments,
      workDays: work.length,
      workMinutes,
    },
    byProject: count(done, (t) => t.project.name),
    byDirection: count(done, (t) => t.direction.name),
    done,
    open,
    recurring,
    work,
  };
}

export type Report = NonNullable<Awaited<ReturnType<typeof buildReport>>>;

/**
 * Отчёт по всем сотрудникам, которых видит составитель: строка итогов на человека + общий список выполненного.
 */
export async function buildTeamReport(viewer: CurrentUser, p: { period: Period; start: Date; end: Date }, now = new Date()) {
  const people = await reportPeople(viewer);
  if (!people.length) return null;
  const rows: { id: string; name: string; roles: string[]; s: Report["summary"] }[] = [];
  for (const person of people) {
    const r = await buildReport(viewer, person.id, p, now);
    if (r) rows.push({ id: person.id, name: person.name, roles: r.person.roles, s: r.summary });
  }
  rows.sort((a, b) => b.s.done - a.s.done || b.s.lateNow - a.s.lateNow || a.name.localeCompare(b.name, "uk"));
  const totals = rows.reduce(
    (t, r) => {
      for (const k of Object.keys(t) as (keyof Report["summary"])[]) t[k] += r.s[k];
      return t;
    },
    { done: 0, doneOnTime: 0, doneLate: 0, assigned: 0, openNow: 0, lateNow: 0, recurringDays: 0, recurringDone: 0, recurringOnTime: 0, comments: 0, workDays: 0, workMinutes: 0 },
  );
  // строки отчёта: выполненные за период + все открытые сейчас + ежедневные за каждый день периода
  // (невыполненные ежедневные прошлых дней лежат в архиве — в отчёте они «не выполнена»)
  const ids = people.map((x) => x.id);
  const tasks = await db.task.findMany({
    where: {
      AND: [
        taskScopeWhere(viewer),
        { assigneeId: { in: ids } },
        {
          OR: [
            { archivedAt: null, recurringId: null, OR: [{ completedAt: { gte: p.start, lt: p.end } }, { completedAt: null, createdAt: { lt: p.end } }] },
            { recurringId: { not: null }, recurringDay: { gte: p.period.from, lte: p.period.to } },
          ],
        },
      ],
    },
    select: { ...taskSelect, assignee: { select: { name: true } } },
    take: 5000,
  });
  const far = 8.64e15;
  // внутри сотрудника: просроченные → открытые → выполненные → ежедневные по дням
  const rank = (t: (typeof tasks)[number]) => (t.recurringId ? 3 : t.completedAt ? 2 : t.deadline && t.deadline < now ? 0 : 1);
  tasks.sort(
    (a, b) =>
      a.assignee.name.localeCompare(b.assignee.name, "uk") ||
      rank(a) - rank(b) ||
      (a.recurringDay && b.recurringDay ? a.recurringDay.localeCompare(b.recurringDay) || a.title.localeCompare(b.title, "uk") : 0) ||
      (a.completedAt && b.completedAt ? a.completedAt.getTime() - b.completedAt.getTime() : (a.deadline?.getTime() ?? far) - (b.deadline?.getTime() ?? far)),
  );
  // отметки рабочего дня всех сотрудников отчёта: по человеку, по дням
  const work = (
    await db.workDay.findMany({
      where: { userId: { in: ids }, day: { gte: p.period.from, lte: p.period.to } },
      include: { user: { select: { name: true } } },
    })
  ).sort((a, b) => a.user.name.localeCompare(b.user.name, "uk") || a.day.localeCompare(b.day));
  return { period: p.period, generatedAt: now, generatedBy: viewer.name, partial: viewer.level < 4, rows, totals, tasks, work };
}

export type TeamReport = NonNullable<Awaited<ReturnType<typeof buildTeamReport>>>;
