/** Всё календарное считается по Киеву. */
export const TZ = "Europe/Kyiv";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type ZonedParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

export function zonedParts(date: Date): ZonedParts {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Смещение зоны (мс) в момент date: локальное время Киева минус UTC. */
function offsetAt(date: Date): number {
  const z = zonedParts(date);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Киевское «стеночное» время → момент. Месяц 1..12, переполнение дней допускается. */
export function fromZoned(y: number, m: number, d: number, h = 0, mi = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - offsetAt(new Date(guess));
  // второй проход на случай, если между guess и ts сменилось летнее время
  ts = guess - offsetAt(new Date(ts));
  return new Date(ts);
}

export function startOfDay(date: Date): Date {
  const z = zonedParts(date);
  return fromZoned(z.y, z.m, z.d);
}

export function addDays(dayStart: Date, n: number): Date {
  const z = zonedParts(dayStart);
  return fromZoned(z.y, z.m, z.d + n);
}

/** Понедельник 00:00 по Киеву. */
export function startOfWeek(date: Date): Date {
  const z = zonedParts(date);
  const dow = new Date(Date.UTC(z.y, z.m - 1, z.d)).getUTCDay(); // 0 = вс
  const back = (dow + 6) % 7;
  return fromZoned(z.y, z.m, z.d - back);
}

export function startOfMonth(date: Date): Date {
  const z = zonedParts(date);
  return fromZoned(z.y, z.m, 1);
}

/** Ключ дня «YYYY-MM-DD» по Киеву. */
export function dayKey(date: Date): string {
  const z = zonedParts(date);
  return `${z.y}-${String(z.m).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

/** Значения для <input type="date"> і <input type="time"> по Киеву. */
export function toInputValues(date: Date): { date: string; time: string } {
  const z = zonedParts(date);
  return { date: dayKey(date), time: `${String(z.h).padStart(2, "0")}:${String(z.mi).padStart(2, "0")}` };
}

/** Разбор полей формы (дата + время по Киеву). null — если некорректно. */
export function parseDeadline(dateStr: string, timeStr: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec((timeStr || "18:00").trim());
  if (!tm) return null;
  const [y, m, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const res = fromZoned(y, m, d, h, mi);
  if (zonedParts(res).d !== d) return null; // 31 февраля и т.п.
  return res;
}
