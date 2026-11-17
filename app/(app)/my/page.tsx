import { requireUser } from "@/lib/auth";
import { listTasks, parseFilters } from "@/lib/tasks";
import { isOverdue, plural } from "@/lib/format";
import { addDays, startOfDay } from "@/lib/time";
import { TaskCard } from "@/components/task/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ViewToggle } from "@/components/task/ViewToggle";
import { Kanban } from "@/components/task/Kanban";
import { statusColumns } from "@/lib/statusBoard";

export const metadata = { title: "Мої задачі · Taskflow" };

/** Всё, что назначено на человека, по дедлайну. */
export default async function MyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "list";
  const now = new Date();
  const all = await listTasks(user, { ...parseFilters({}), assignee: user.id, sort: "deadline" }, now);
  const open = all.filter((t) => !t.completedAt);
  const tomorrow = addDays(startOfDay(now), 1);
  const weekAgo = addDays(startOfDay(now), -7);
  const groups = [
    { key: "late", title: "Прострочено", tone: "#e5283b", items: open.filter((t) => isOverdue(t, now)) },
    { key: "today", title: "Сьогодні", tone: "#f08a0c", items: open.filter((t) => t.deadline && !isOverdue(t, now) && t.deadline < tomorrow) },
    { key: "later", title: "Далі", tone: "#2563eb", items: open.filter((t) => t.deadline && t.deadline >= tomorrow) },
    { key: "none", title: "Без строку", tone: "#64748b", items: open.filter((t) => !t.deadline) },
    { key: "done", title: "Виконано за тиждень", tone: "#16a34a", items: all.filter((t) => t.completedAt && t.completedAt > weekAgo).slice(0, 12) },
  ];
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">Мої задачі</h1>
          <p className="mt-1 text-ink-3">
            {open.length} {plural(open.length, "відкрита", "відкриті", "відкритих")} · {view === "board" ? "за статусами, з усіх проєктів" : "за дедлайном"}
          </p>
        </div>
        <ViewToggle path="/my" sp={sp} view={view} />
      </div>
      {view === "board" && all.length > 0 ? (
        <div className="mt-6">
          {/* выполненные — только за неделю, чтобы колонка «Готово» не разрасталась */}
          <Kanban byStatus newHref={null} now={now} columns={statusColumns(user, all.filter((t) => !t.completedAt || t.completedAt > weekAgo))} />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Вам поки нічого не призначено" />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
                  <span className="h-3 w-3 rounded-full" style={{ background: g.tone, boxShadow: `0 0 0 4px ${g.tone}26` }} />
                  {g.title}
                  <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-bold text-ink-3">{g.items.length}</span>
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((t) => (
                    <TaskCard key={t.id} t={t} now={now} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
