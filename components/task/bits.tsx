import { IconClock, IconFire, IconFlag } from "@/components/icons";
import { OVERDUE, deadlineHint, fmtDate, priorityMeta } from "@/lib/format";

/** Отдел (Разработка, Реклама, …): цветная точка + название (+ подтип). */
export function DirectionChip({ d, subtype, size = "sm" }: { d: { name: string; color: string }; subtype?: { name: string } | null; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "md" ? "h-8 px-3 text-sm" : "h-6 px-2.5 text-[0.75rem]"}`}
      style={{ background: d.color + "1a", color: d.color }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
      {d.name}
      {subtype && <span className="font-semibold opacity-80">· {subtype.name}</span>}
    </span>
  );
}

/** Вид работы (HR, Продажа, …): тёмная плашка — первое, что видно на карточке. */
export function BusinessChip({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-ink font-extrabold tracking-wide text-white ${size === "md" ? "h-8 px-3.5 text-sm" : "h-6 px-2.5 text-[0.72rem]"}`}
    >
      {name}
    </span>
  );
}

/** Приоритет. Высокий — насыщенная плашка, остальные — мягкие. */
export function PriorityBadge({ p, size = "sm" }: { p: string; size?: "sm" | "md" }) {
  const m = priorityMeta(p);
  const high = p === "HIGH";
  return (
    <span
      title={m.hint}
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "md" ? "h-8 px-3 text-sm" : "h-6 px-2.5 text-[0.75rem]"}`}
      style={high ? { background: m.color, color: "#fff", boxShadow: `0 3px 10px ${m.color}55` } : { background: m.soft, color: m.text }}
    >
      <IconFlag size={size === "md" ? 14 : 12} />
      {m.label}
    </span>
  );
}

/** Колонка доски = статус: насыщенная плашка цвета колонки. */
export function ColumnBadge({ c, size = "md" }: { c: { name: string; color: string }; size?: "md" | "lg" }) {
  return (
    <span className={`badge ${size === "lg" ? "badge-lg" : ""}`} style={{ background: c.color, boxShadow: `0 3px 10px ${c.color}55` }}>
      {c.name}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="badge" style={{ background: OVERDUE.bg, boxShadow: `0 3px 10px ${OVERDUE.bg}55` }}>
      <IconFire size={14} />
      Прострочена
    </span>
  );
}

export function Deadline({ deadline, done, now, compact }: { deadline: Date | null; done: boolean; now: Date; compact?: boolean }) {
  const h = deadlineHint(deadline, done, now);
  const tone = { late: "text-[#c01428]", soon: "text-[#b45f06]", ok: "text-ink-2", done: "text-ink-3", none: "text-ink-3" }[h.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[0.8rem] font-semibold ${tone}`}>
      <IconClock size={14} />
      {deadline ? fmtDate(deadline, true) : "без строку"}
      {!compact && h.text && deadline && <span className="font-medium opacity-80">· {h.text}</span>}
    </span>
  );
}
