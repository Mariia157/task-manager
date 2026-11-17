import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { taskScopeWhere } from "@/lib/access";
import { plural } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewBoardButton } from "@/components/admin/BoardControls";
import { boardScopeWhere, isAdmin } from "@/lib/access";

export const metadata = { title: "Дошки · Taskflow" };

export default async function BoardsPage() {
  const user = await requireUser();
  const now = new Date();
  const projects = await db.project.findMany({
    where: { archivedAt: null, ...boardScopeWhere(user) },
    include: { columns: { orderBy: { sortOrder: "asc" } }, _count: { select: { members: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const tasks = await db.task.findMany({
    where: { AND: [taskScopeWhere(user), { archivedAt: null }] },
    select: { projectId: true, columnId: true, completedAt: true, deadline: true },
  });
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] font-extrabold tracking-tight">Дошки</h1>
          <p className="mt-1 text-ink-3">Проєкт — це дошка. Картки на ній видно відповідно до вашого рівня доступу.</p>
        </div>
        {isAdmin(user) && <NewBoardButton people={await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } })} />}
      </div>
      {projects.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Дошок поки немає" hint={isAdmin(user) ? "Натисніть «Нова дошка»." : "Дошки створює адмін."} />
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const mine = tasks.filter((t) => t.projectId === p.id);
            const open = mine.filter((t) => !t.completedAt);
            const late = open.filter((t) => t.deadline && t.deadline < now).length;
            return (
              <Link key={p.id} href={`/boards/${p.id}`} className="card lift block p-5">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-[13px]" style={{ background: p.color, boxShadow: `0 6px 16px ${p.color}55` }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-lg font-extrabold">{p.name}</span>
                      {p.isDraft && <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[0.7rem] font-bold text-ink-2">чернетка</span>}
                      {isAdmin(user) && !p.accessAll && (
                        <span className="shrink-0 rounded-full bg-[#e7efff] px-2 py-0.5 text-[0.7rem] font-bold text-[#1d4ed8]" title="Доступ лише у вибраних">
                          🔒 {p._count.members}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-ink-3">
                      {open.length} {plural(open.length, "відкрита задача", "відкриті задачі", "відкритих задач")}
                      {late > 0 && <span className="font-bold text-[#c01428]"> · {late} прострочено</span>}
                    </div>
                  </div>
                </div>
                {p.description && <p className="mt-3 line-clamp-2 text-sm text-ink-2">{p.description}</p>}
                <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full bg-panel">
                  {p.columns.map((c) => {
                    const n = mine.filter((t) => t.columnId === c.id).length;
                    return n ? <span key={c.id} title={`${c.name}: ${n}`} style={{ flex: n, background: c.color }} /> : null;
                  })}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-ink-3">
                  {p.columns.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                      {c.name} {mine.filter((t) => t.columnId === c.id).length}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
