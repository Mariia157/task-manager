import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { IconChat, IconChecklist, IconClip, IconRepeat, IconTree } from "@/components/icons";
import { BusinessChip, ColumnBadge, Deadline, DirectionChip, PriorityBadge } from "./bits";
import { isOverdue } from "@/lib/format";

export type CardTask = {
  id: string;
  title: string;
  priority: string;
  deadline: Date | null;
  completedAt: Date | null;
  recurringId?: string | null;
  business?: string | null;
  project: { name: string; color: string };
  column: { name: string; color: string; isDone: boolean };
  direction: { name: string; color: string };
  subtype: { name: string } | null;
  assignee: { name: string };
  parent?: { id: string; title: string } | null;
  checklist: { done: boolean }[];
  children: { completedAt: Date | null; archivedAt: Date | null }[];
  _count: { comments: number; attachments: number };
};

/** Карточка задачи. variant="board" — компактная для колонок, "list" — со статусом и проектом. */
export function TaskCard({ t, now, variant = "list", href = true }: { t: CardTask; now: Date; variant?: "board" | "list"; href?: boolean }) {
  const late = isOverdue(t, now);
  const cl = { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length };
  const kids = t.children.filter((c) => !c.archivedAt);
  const sub = { done: kids.filter((c) => c.completedAt).length, total: kids.length };
  const body = (
    <>
      {late && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[#e5283b]" aria-hidden="true" />}
      <div className="flex flex-wrap items-center gap-1.5">
        {t.business && <BusinessChip name={t.business} />}
        <DirectionChip d={t.direction} subtype={t.subtype} />
        {t.priority !== "MEDIUM" && <PriorityBadge p={t.priority} />}
        {t.recurringId && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-panel px-2 text-[0.72rem] font-bold text-ink-2" title="Щоденна задача — повторюється за розкладом">
            <IconRepeat size={12} />
            щоденна
          </span>
        )}
      </div>
      <div className={`mt-2 font-bold leading-snug ${variant === "board" ? "text-[0.95rem]" : "text-[1.02rem]"} ${t.completedAt ? "text-ink-3 line-through decoration-2" : ""}`}>
        {t.title}
      </div>
      {t.parent && <div className="mt-1 truncate text-xs font-semibold text-ink-3">↳ {t.parent.title}</div>}
      {variant === "list" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-3">
          <ColumnBadge c={t.column} />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: t.project.color }} />
            {t.project.name}
          </span>
        </div>
      )}
      {sub.total > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-ink-2">
            <IconTree size={13} />
            Підзадачі {sub.done} з {sub.total}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-[#16a34a]" style={{ width: `${(sub.done / sub.total) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Deadline deadline={t.deadline} done={!!t.completedAt} now={now} compact={variant === "board"} />
        <span className="ml-auto flex items-center gap-2.5 text-xs font-bold text-ink-3">
          {cl.total > 0 && (
            <span className={`inline-flex items-center gap-1 ${cl.done === cl.total ? "text-[#15803d]" : ""}`}>
              <IconChecklist size={13} />
              {cl.done}/{cl.total}
            </span>
          )}
          {t._count.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <IconChat size={13} />
              {t._count.comments}
            </span>
          )}
          {t._count.attachments > 0 && (
            <span className="inline-flex items-center gap-1">
              <IconClip size={13} />
              {t._count.attachments}
            </span>
          )}
          <span title={t.assignee.name}>
            <Avatar name={t.assignee.name} size={26} />
          </span>
        </span>
      </div>
    </>
  );
  const cls = `card relative block overflow-hidden ${variant === "board" ? "p-3.5" : "p-4"}`;
  return href ? (
    <Link href={`/tasks/${t.id}`} className={`${cls} lift`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
