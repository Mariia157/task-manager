import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listTasks, parseFilters, toAccessTask } from "@/lib/tasks";
import { filterProps } from "@/lib/views";
import { FilterBar } from "@/components/task/FilterBar";
import { Kanban } from "@/components/task/Kanban";
import { DeleteBoardButton, EditBoardButton } from "@/components/admin/BoardControls";
import { publishBoardAction } from "@/app/actions/admin";
import { canEditBoard, canMoveTask, canViewBoard, isAdmin } from "@/lib/access";
import Link from "next/link";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const project = await db.project.findFirst({
    where: { id, archivedAt: null },
    include: { columns: { orderBy: { sortOrder: "asc" } }, members: { select: { userId: true } } },
  });
  if (!project || !canViewBoard(user, project)) notFound();
  const f = { ...parseFilters(await searchParams), project: id, sort: "position" as const };
  const now = new Date();
  const [tasks, fp] = await Promise.all([listTasks(user, f, now, 2000), filterProps(user)]);
  const columns = project.columns.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    isDone: c.isDone,
    tasks: tasks.filter((t) => t.columnId === c.id).map((t) => ({ ...t, canMove: canMoveTask(user, toAccessTask(t)) })),
  }));
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-[12px]" style={{ background: project.color, boxShadow: `0 6px 16px ${project.color}55` }} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">{project.name}</h1>
          {project.description && <p className="text-sm text-ink-3">{project.description}</p>}
        </div>
        {(isAdmin(user) || canEditBoard(user, project)) && (
          <div className="flex flex-wrap gap-2">
            <EditBoardButton
              board={{
                id: project.id,
                name: project.name,
                description: project.description,
                color: project.color,
                accessAll: project.accessAll,
                memberIds: project.members.map((m) => m.userId),
              }}
              people={await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } })}
            />
            {isAdmin(user) && (
              <>
                <Link href="/admin/projects" className="btn btn-soft btn-sm">
                  Колонки й налаштування
                </Link>
                <DeleteBoardButton id={project.id} name={project.name} tasks={await db.task.count({ where: { projectId: project.id } })} />
              </>
            )}
          </div>
        )}
      </div>
      {project.isDraft && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[16px] bg-[#fff8ec] px-4 py-3">
          <span className="flex-1 text-sm font-semibold text-[#b45f06]">
            Чернетка дошки — її і задачі на ній бачать лише адміни. Сповіщення виконавцям підуть під час публікації.
          </span>
          <form action={publishBoardAction.bind(null, project.id)}>
            <button className="btn btn-primary btn-sm">Опублікувати дошку</button>
          </form>
        </div>
      )}
      <div className="mb-5">
        <FilterBar business={fp.business} directions={fp.directions} people={fp.people} views={fp.views} canShare={fp.canShare} />
      </div>
      <Kanban columns={columns} now={now} newHref={`/tasks/new?project=${project.id}`} />
    </div>
  );
}
