import { addDays, dayKey, startOfDay, startOfMonth, startOfWeek } from "@/lib/time";

/** Выполнена = лежит в колонке «готово» (completedAt). Срок может отсутствовать. */
export type StatTask = { assigneeId: string; deadline: Date | null; completedAt: Date | null; lateOk?: boolean };

export type PersonStats = {
  id: string;
  name: string;
  today: number;
  week: number;
  month: number;
  monthOnTime: number;
  open: number;
  overdue: number;
};

export function periodStarts(now: Date) {
  return { day: startOfDay(now), week: startOfWeek(now), month: startOfMonth(now) };
}

/** Закрытая задача считается по completedAt текущему исполнителю. */
function closedSince(t: StatTask, from: Date, now: Date) {
  return t.completedAt !== null && t.completedAt >= from && t.completedAt <= now;
}

/** В срок: без срока — всегда в срок; «засчитано в срок» — тоже. */
const onTime = (t: StatTask) => !t.deadline || t.completedAt! <= t.deadline || !!t.lateOk;

export function personStats(people: { id: string; name: string }[], tasks: StatTask[], now: Date): PersonStats[] {
  const p = periodStarts(now);
  const byUser = new Map<string, StatTask[]>();
  for (const t of tasks) {
    const arr = byUser.get(t.assigneeId);
    if (arr) arr.push(t);
    else byUser.set(t.assigneeId, [t]);
  }
  return people.map((person) => {
    const list = byUser.get(person.id) ?? [];
    const monthClosed = list.filter((t) => closedSince(t, p.month, now));
    return {
      id: person.id,
      name: person.name,
      today: list.filter((t) => closedSince(t, p.day, now)).length,
      week: list.filter((t) => closedSince(t, p.week, now)).length,
      month: monthClosed.length,
      monthOnTime: monthClosed.filter(onTime).length,
      open: list.filter((t) => !t.completedAt).length,
      overdue: list.filter((t) => !t.completedAt && t.deadline !== null && t.deadline < now).length,
    };
  });
}

/** Закрыто по дням за последние `days` дней (включая сегодня), по Киеву. */
export function dailySeries(tasks: StatTask[], now: Date, days: number) {
  const today = startOfDay(now);
  const first = addDays(today, -(days - 1));
  const buckets = new Map<string, { key: string; date: Date; closed: number; onTime: number }>();
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i);
    buckets.set(dayKey(d), { key: dayKey(d), date: d, closed: 0, onTime: 0 });
  }
  for (const t of tasks) {
    if (!closedSince(t, first, now)) continue;
    const b = buckets.get(dayKey(t.completedAt!));
    if (!b) continue;
    b.closed++;
    if (onTime(t)) b.onTime++;
  }
  return [...buckets.values()];
}
