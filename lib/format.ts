import { TZ, addDays, startOfDay } from "@/lib/time";

export function fmtDate(d: Date, withTime = false): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
    .format(d)
    .replace(".", "");
}

export function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

export function fmtDayShort(d: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "numeric", month: "numeric" }).format(d);
}

export function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** 1 задача, 2 задачи, 5 задач */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export const PRIORITY_META = {
  HIGH: { label: "Високий", hint: "Невідкладна, першочергова. Перенесення неможливе", color: "#e5283b", soft: "#ffe6e8", text: "#c01428" },
  MEDIUM: { label: "Середній", hint: "Виконання за день. Переносити небажано", color: "#f08a0c", soft: "#fff1dc", text: "#b45f06" },
  LOW: { label: "Низький", hint: "Без жорсткого строку. Перенесення можливе", color: "#64748b", soft: "#eef1f5", text: "#475569" },
} as const;

export function priorityMeta(p: string) {
  return PRIORITY_META[p as keyof typeof PRIORITY_META] ?? PRIORITY_META.MEDIUM;
}

export const OVERDUE = { bg: "#e5283b", soft: "#ffe6e8", text: "#c01428" };

type DoneT = { deadline: Date | null; completedAt: Date | null; lateOk?: boolean };
/** Закрыта позже срока (по факту, без учёта «засчитано в срок»). */
export const closedAfterDeadline = (t: DoneT) => !!t.completedAt && !!t.deadline && t.completedAt > t.deadline;
/** Опоздание для отчётов и статистики: закрыта позже срока и не «засчитано в срок». */
export const isDoneLate = (t: DoneT) => closedAfterDeadline(t) && !t.lateOk;

export function isOverdue(t: { deadline: Date | null; completedAt: Date | null }, now = new Date()): boolean {
  return !t.completedAt && !!t.deadline && t.deadline.getTime() < now.getTime();
}

/** «осталось 3 дн.» / «сегодня» / «просрочена на 2 дн.» */
export function deadlineHint(deadline: Date | null, done: boolean, now: Date): { text: string; tone: "late" | "soon" | "ok" | "done" | "none" } {
  if (done) return { text: "", tone: "done" };
  if (!deadline) return { text: "без строку", tone: "none" };
  const diff = deadline.getTime() - now.getTime();
  if (diff < 0) {
    const h = Math.floor(-diff / 3600_000);
    if (h < 24) return { text: `прострочена на ${Math.max(h, 1)} год`, tone: "late" };
    return { text: `прострочена на ${Math.floor(h / 24)} дн.`, tone: "late" };
  }
  if (deadline < addDays(startOfDay(now), 1)) return { text: "сьогодні", tone: "soon" };
  const h = Math.ceil(diff / 3600_000);
  if (h < 48) return { text: `залишилося ${h} год`, tone: "soon" };
  return { text: `залишилося ${Math.round(h / 24)} дн.`, tone: "ok" };
}

/** «8 ч 53 мин», «45 мин» */
export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} год${m % 60 ? ` ${m % 60} мин` : ""}` : `${m} хв`;
}

/** Отметка рабочего дня для показа: время по Киеву, длительность. */
export function workDayView(w: { place: string; startedAt: Date; endedAt: Date | null }) {
  return {
    place: w.place,
    start: fmtTime(w.startedAt),
    end: w.endedAt ? fmtTime(w.endedAt) : null,
    duration: w.endedAt ? fmtDuration(w.endedAt.getTime() - w.startedAt.getTime()) : null,
  };
}
