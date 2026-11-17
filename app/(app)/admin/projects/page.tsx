import Link from "next/link";
import { db } from "@/lib/db";
import { archiveProjectAction, deleteColumnAction, moveColumnAction, saveColumnAction, saveProjectAction } from "@/app/actions/admin";
import { ColorPicker } from "@/components/admin/ColorPicker";
import { DeleteBoardButton } from "@/components/admin/BoardControls";
import { BoardAccessButton } from "@/components/admin/BoardAccess";
import { IconArchive, IconPlus, IconTrash } from "@/components/icons";

export const metadata = { title: "Проєкти · Taskflow" };

export default async function ProjectsAdminPage() {
  const projects = await db.project.findMany({
    orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }],
    include: {
      columns: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { tasks: true } } } },
      _count: { select: { tasks: true } },
      members: { select: { userId: true } },
    },
  });
  const people = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, level: true } });
  const live = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <div className="space-y-5">
      <p className="text-ink-3">
        Проєкт — це дошка. Колонки задають статуси; колонка з позначкою «готово» означає виконання: за нею рахується статистика.
      </p>

      {live.map((p) => (
        <article key={p.id} className="card p-5 sm:p-6">
          <form action={saveProjectAction.bind(null, p.id)} className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto]">
            <div>
              <label className="label">Назва</label>
              <input name="name" defaultValue={p.name} required maxLength={80} className="field text-lg font-bold" />
            </div>
            <div>
              <label className="label">Опис</label>
              <input name="description" defaultValue={p.description} maxLength={500} className="field" placeholder="Необов’язково" />
            </div>
            <div className="flex items-end gap-2">
              <button className="btn btn-soft btn-sm">Зберегти</button>
              <Link href={`/boards/${p.id}`} className="btn btn-soft btn-sm">
                Дошка
              </Link>
            </div>
            <div className="md:col-span-3">
              <ColorPicker name="color" defaultValue={p.color} />
            </div>
          </form>

          <div className="mt-5 rounded-[16px] bg-panel p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>Колонки</span>
              <span className="text-ink-3">{p._count.tasks} карток</span>
            </div>
            <div className="space-y-2">
              {p.columns.map((c, i) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-[14px] bg-white p-2 shadow-sm">
                  <div className="flex flex-col">
                    <form action={moveColumnAction.bind(null, c.id, -1)}>
                      <button disabled={i === 0} aria-label="Вище" className="h-5 w-7 rounded text-xs text-ink-3 hover:bg-panel disabled:opacity-30">
                        ▲
                      </button>
                    </form>
                    <form action={moveColumnAction.bind(null, c.id, 1)}>
                      <button disabled={i === p.columns.length - 1} aria-label="Нижче" className="h-5 w-7 rounded text-xs text-ink-3 hover:bg-panel disabled:opacity-30">
                        ▼
                      </button>
                    </form>
                  </div>
                  <form action={saveColumnAction.bind(null, p.id, c.id)} className="flex flex-1 flex-wrap items-center gap-3">
                    <input name="name" defaultValue={c.name} required maxLength={40} aria-label="Назва колонки" className="field !min-h-0 max-w-[200px] !py-2 font-bold" />
                    <ColorPicker name="color" defaultValue={c.color} />
                    <label className="flex items-center gap-1.5 text-sm font-semibold">
                      <input type="checkbox" name="isDone" value="1" defaultChecked={c.isDone} className="h-4 w-4 accent-[#16a34a]" />
                      готово
                    </label>
                    <span className="text-xs font-semibold text-ink-3">{c._count.tasks} карт.</span>
                    <button className="btn btn-soft btn-sm ml-auto">OK</button>
                  </form>
                  <form action={deleteColumnAction.bind(null, c.id)}>
                    <button
                      disabled={c._count.tasks > 0}
                      title={c._count.tasks ? "Спочатку перенесіть картки" : "Видалити колонку"}
                      aria-label="Видалити колонку"
                      className="btn btn-soft btn-sm disabled:opacity-30"
                    >
                      <IconTrash size={14} />
                    </button>
                  </form>
                </div>
              ))}
              <form action={saveColumnAction.bind(null, p.id, null)} className="flex flex-wrap items-center gap-2 pt-1">
                <input name="name" required maxLength={40} placeholder="Нова колонка" aria-label="Нова колонка" className="field !min-h-0 max-w-[200px] !py-2" />
                <input type="hidden" name="color" value="#64748b" />
                <button className="btn btn-primary btn-sm">
                  <IconPlus size={15} />
                  Колонка
                </button>
              </form>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={archiveProjectAction.bind(null, p.id, false)}>
              <button className="btn btn-soft btn-sm">
                <IconArchive size={15} />
                В архів
              </button>
            </form>
            <BoardAccessButton projectId={p.id} name={p.name} accessAll={p.accessAll} memberIds={p.members.map((m) => m.userId)} people={people} />
            <DeleteBoardButton id={p.id} name={p.name} tasks={p._count.tasks} />
          </div>
        </article>
      ))}

      <form action={saveProjectAction.bind(null, null)} className="card flex flex-wrap items-center gap-3 p-5">
        <input name="name" required maxLength={80} placeholder="Новий проєкт" aria-label="Новий проєкт" className="field max-w-[280px]" />
        <ColorPicker name="color" defaultValue="#2563eb" />
        <button className="btn btn-primary ml-auto">
          <IconPlus size={16} />
          Створити дошку
        </button>
      </form>

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-extrabold">Архів проєктів</h2>
          <ul className="zebra card overflow-hidden">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 font-bold">{p.name}</span>
                <span className="text-sm text-ink-3">{p._count.tasks} задач</span>
                <form action={archiveProjectAction.bind(null, p.id, true)}>
                  <button className="btn btn-soft btn-sm">Повернути</button>
                </form>
                <DeleteBoardButton id={p.id} name={p.name} tasks={p._count.tasks} archived compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
