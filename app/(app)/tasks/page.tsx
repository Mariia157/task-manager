import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listTasks, parseFilters } from "@/lib/tasks";
import { filterProps } from "@/lib/views";
import { plural } from "@/lib/format";
import { FilterBar } from "@/components/task/FilterBar";
import { TaskCard } from "@/components/task/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconArchive } from "@/components/icons";
import { ViewToggle } from "@/components/task/ViewToggle";
import { Kanban } from "@/components/task/Kanban";
import { statusColumns } from "@/lib/statusBoard";
import { addDays, startOfDay } from "@/lib/time";

export const metadata = { title: "Усі задачі · Taskflow" };

const PAGE = 60;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const view = sp.view === "board" && !f.archived ? "board" : "list";
  const now = new Date();
  const [all, fp] = await Promise.all([listTasks(user, f, now, 2000), filterProps(user)]);
  // показываем порциями: длинный список на телефоне иначе бесконечен
  const limit = Math.min(2000, Math.max(PAGE, Number(sp.limit) || PAGE));
  const tasks = all.slice(0, limit);
  const more = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  more.set("limit", String(limit + PAGE));
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">{f.archived ? "Архів" : "Усі задачі"}</h1>
          <p className="mt-1 text-ink-3">
            {all.length} {plural(all.length, "задача", "задачі", "задач")} по всіх доступних вам проєктах
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!f.archived && <ViewToggle path="/tasks" sp={sp} view={view} />}
          <Link href={f.archived ? "/tasks" : "/tasks?archived=1"} className="btn btn-soft btn-sm">
            <IconArchive size={15} />
            {f.archived ? "До задач" : "Архів"}
          </Link>
        </div>
      </div>
      <div className="mt-5">
        <FilterBar
          business={fp.business}
          projects={fp.projects}
          directions={fp.directions}
          people={fp.people}
          views={fp.views}
          canShare={fp.canShare}
          sorts={[
            { value: "deadline", label: "За дедлайном" },
            { value: "priority", label: "За пріоритетом" },
            { value: "created", label: "Спочатку нові" },
          ]}
        />
      </div>
      <div className="mt-5">
        {view === "board" && all.length > 0 ? (
          // на дошці виконані — за 14 днів (якщо явно не вибрано фільтр «виконані»)
          <Kanban
            byStatus
            newHref={null}
            now={now}
            columns={statusColumns(
              user,
              all.filter((t) => f.done === "done" || !t.completedAt || t.completedAt > addDays(startOfDay(now), -14)).slice(0, 400),
            )}
          />
        ) : tasks.length === 0 ? (
          <EmptyState title="Задач не знайдено" hint="Змініть фільтри або скиньте їх." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((t) => (
              <TaskCard key={t.id} t={t} now={now} />
            ))}
          </div>
        )}
        {view === "list" && all.length > tasks.length && (
          <div className="mt-6 flex justify-center">
            <Link href={`/tasks?${more.toString()}`} scroll={false} className="btn btn-soft">
              Показати ще · лишилося {all.length - tasks.length}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
