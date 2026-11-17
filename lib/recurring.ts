import "server-only";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/time";
import { ensureRecurringCore } from "@/lib/recurringCore";

export { kyivWeekday } from "@/lib/recurringCore";

let lastRun = "";

/**
 * Карточки ежедневных задач на сегодня. Сайт вызывает при открытии страниц (не чаще раза в минуту на процесс),
 * бот — по своему таймеру; повторный вызов ничего не дублирует.
 */
export async function ensureRecurringTasks(now = new Date(), force = false) {
  const key = dayKey(now) + ":" + Math.floor(now.getTime() / 60_000);
  if (!force && key === lastRun) return 0;
  lastRun = key;
  return ensureRecurringCore(db, now);
}
