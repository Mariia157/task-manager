import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { disconnectTelegramAction, reassignOpenTasksAction, savePersonAction } from "@/app/actions/admin";
import { personFormProps } from "@/lib/personFormProps";
import { PersonForm } from "@/components/admin/PersonForm";
import { Select } from "@/components/ui/Select";
import { plural } from "@/lib/format";

export const metadata = { title: "Працівник · Taskflow" };

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const u = await db.user.findUnique({ where: { id }, include: { roles: true, grants: true, subordinates: true, boards: true } });
  if (!u) notFound();
  const props = await personFormProps(id);
  const openTasks = await db.task.findMany({
    where: { assigneeId: id, completedAt: null, archivedAt: null },
    select: { id: true, title: true, project: { select: { name: true } } },
    orderBy: { deadline: "asc" },
  });
  return (
    <div className="space-y-6">
      {!u.active && openTasks.length > 0 && (
        <section className="card p-5 sm:p-7" style={{ background: "#fff8ec" }}>
          <h2 className="text-lg font-extrabold">
            У вимкненого працівника {openTasks.length} {plural(openTasks.length, "відкрита задача", "відкриті задачі", "відкритих задач")}
          </h2>
          <p className="mt-1 text-sm text-ink-2">Передайте їх іншій людині — історія й коментарі збережуться.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {openTasks.slice(0, 8).map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="font-semibold hover:underline">
                  {t.title}
                </Link>{" "}
                <span className="text-ink-3">· {t.project.name}</span>
              </li>
            ))}
            {openTasks.length > 8 && <li className="text-ink-3">і ще {openTasks.length - 8}</li>}
          </ul>
          <form action={reassignOpenTasksAction.bind(null, id)} className="mt-4 flex flex-wrap gap-2.5">
            <Select
              name="toId"
              required
              placeholder="Кому передати"
              className="min-w-[240px]"
              options={props.people.map((p) => ({ value: p.id, label: p.name, avatar: p.name }))}
            />
            <button className="btn btn-primary">Передати всі</button>
          </form>
        </section>
      )}
      <div className="card flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="h-3 w-3 rounded-full" style={{ background: u.telegramChatId ? "#16a34a" : "#c9c4ba" }} />
        <span className="flex-1 font-semibold">
          {u.telegramChatId ? "Telegram-бот підключено" : "Telegram-бот не підключено — людина підключає його сама в «Профілі»"}
        </span>
        {u.telegramChatId && (
          <form action={disconnectTelegramAction.bind(null, id)}>
            <button className="btn btn-soft btn-sm">Відв’язати</button>
          </form>
        )}
      </div>
      <PersonForm
        action={savePersonAction.bind(null, id)}
        {...props}
        isNew={false}
        saved={saved === "1"}
        initial={{
          name: u.name,
          login: u.login,
          contacts: u.contacts,
          telegram: u.telegram,
          responsibility: u.responsibility,
          level: u.level,
          roleIds: u.roles.map((r) => r.roleId),
          grants: u.grants.map((g) => ({ directionId: g.directionId, subtypeId: g.subtypeId })),
          subordinateIds: u.subordinates.map((s) => s.subordinateId),
          active: u.active,
          boardIds: u.boards.map((b) => b.projectId),
        }}
      />
    </div>
  );
}
