import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { deleteDraftAction } from "@/app/actions/tasks";
import { publishBoardAction } from "@/app/actions/admin";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";

export const metadata = { title: "Чернетки · Taskflow" };

/** Черновики задач (видны только автору) и доски-черновики (только админам). */
export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const [drafts, boards, projects] = await Promise.all([
    db.draft.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }),
    isAdmin(user)
      ? db.project.findMany({ where: { isDraft: true, archivedAt: null }, include: { _count: { select: { tasks: true } } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    db.project.findMany({ select: { id: true, name: true } }),
  ]);
  const projectName = (id: unknown) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="mx-auto max-w-[980px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">Чернетки</h1>
          <p className="mt-1 text-ink-3">Незавершені задачі бачите лише ви. Виконавець дізнається про задачу, коли ви її створите.</p>
        </div>
        <Link href="/tasks/new" className="btn btn-primary">
          <IconPlus size={17} />
          Нова задача
        </Link>
      </div>

      {saved && (
        <div role="status" className="rounded-xl bg-[#e2f6e8] px-4 py-3 font-semibold text-[#15803d]">
          Чернетку збережено.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold">Задачі · {drafts.length}</h2>
        {drafts.length === 0 ? (
          <EmptyState title="Чернеток немає" hint="У формі нової задачі натисніть «Зберегти чернетку», щоб повернутися до неї пізніше." />
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => {
              const data = JSON.parse(d.payload) as Record<string, unknown>;
              const proj = projectName(data.projectId);
              return (
                <li key={d.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <Link href={`/tasks/new?draft=${d.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-bold hover:underline">{d.title || "Без назви"}</span>
                    <span className="block text-sm text-ink-3">
                      {[proj, typeof data.business === "string" && data.business ? data.business : null, `змінено ${fmtDate(d.updatedAt, true)}`].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                  <Link href={`/tasks/new?draft=${d.id}`} className="btn btn-soft btn-sm">
                    <IconEdit size={15} />
                    Продовжити
                  </Link>
                  <form action={deleteDraftAction.bind(null, d.id)}>
                    <button className="btn btn-soft btn-sm" aria-label="Видалити чернетку">
                      <IconTrash size={15} />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin(user) && (
        <section>
          <h2 className="mb-1 text-lg font-extrabold">Дошки-чернетки · {boards.length}</h2>
          <p className="mb-3 text-sm text-ink-3">Бачать лише адміни. Задачі на них можна готувати заздалегідь — виконавці отримають сповіщення під час публікації.</p>
          {boards.length === 0 ? (
            <EmptyState title="Дошок-чернеток немає" hint="Під час створення дошки позначте «Чернетка»." />
          ) : (
            <ul className="space-y-3">
              {boards.map((b) => (
                <li key={b.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <span className="h-8 w-8 shrink-0 rounded-[10px]" style={{ background: b.color }} />
                  <Link href={`/boards/${b.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-bold hover:underline">{b.name}</span>
                    <span className="block text-sm text-ink-3">задач: {b._count.tasks}</span>
                  </Link>
                  <form action={publishBoardAction.bind(null, b.id)}>
                    <button className="btn btn-primary btn-sm">Опублікувати</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
