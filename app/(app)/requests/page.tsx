import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { fmtDate, priorityMeta } from "@/lib/format";
import type { TaskDraft } from "@/lib/taskWrite";
import { cancelRequestAction, decideRequestAction } from "@/app/actions/requests";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCheck, IconEdit, IconX } from "@/components/icons";

export const metadata = { title: "Запити · Taskflow" };

const STATUS = {
  PENDING: { label: "Чекає рішення", color: "#f08a0c" },
  APPROVED: { label: "Схвалено", color: "#16a34a" },
  REJECTED: { label: "Відхилено", color: "#e5283b" },
} as Record<string, { label: string; color: string }>;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { sent } = await searchParams;
  const where = admin ? {} : { requesterId: user.id };
  const [pending, done, people, projects, directions, subtypes] = await Promise.all([
    db.request.findMany({ where: { ...where, status: "PENDING" }, include: { requester: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.request.findMany({
      where: { ...where, status: { not: "PENDING" } },
      include: { requester: { select: { name: true } }, decidedBy: { select: { name: true } } },
      orderBy: { decidedAt: "desc" },
      take: 40,
    }),
    db.user.findMany({ select: { id: true, name: true, active: true } }),
    db.project.findMany({ select: { id: true, name: true, color: true } }),
    db.direction.findMany({ select: { id: true, name: true, color: true } }),
    db.subtype.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "—";

  function Draft({ d }: { d: TaskDraft }) {
    const dir = directions.find((x) => x.id === d.directionId);
    const proj = projects.find((x) => x.id === d.projectId);
    const sub = subtypes.find((x) => x.id === d.subtypeId);
    const pm = priorityMeta(d.priority);
    return (
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <span>
          <span className="text-ink-3">Виконавець: </span>
          <b>{nameOf(d.assigneeId)}</b>
        </span>
        {proj && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: proj.color }} />
            <b>{proj.name}</b>
          </span>
        )}
        {dir && (
          <span className="font-bold" style={{ color: dir.color }}>
            {dir.name}
            {sub && ` · ${sub.name}`}
          </span>
        )}
        <span className="font-bold" style={{ color: pm.text }}>
          {pm.label}
        </span>
        <span>
          <span className="text-ink-3">Строк: </span>
          <b>{d.deadline ? fmtDate(new Date(d.deadline), true) : "без строку"}</b>
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[980px]">
      <h1 className="text-[1.9rem] font-extrabold tracking-tight">Запити</h1>
      <p className="mt-1 text-ink-3">
        {admin
          ? "Запити на задачі й призначення від Креативу. Задача з’явиться лише після вашого схвалення."
          : "Задачі, які ви не можете поставити напряму, чекають тут рішення адміна."}
      </p>

      {sent && (
        <div role="status" className="mt-5 rounded-xl bg-[#e2f6e8] px-4 py-3 font-semibold text-[#15803d]">
          Запит надіслано адміну. Коли його розглянуть, надійде сповіщення.
        </div>
      )}

      <h2 className="mb-3 mt-7 text-lg font-extrabold">Чекають рішення · {pending.length}</h2>
      {pending.length === 0 ? (
        <EmptyState title="Черга порожня" />
      ) : (
        <div className="space-y-4">
          {pending.map((r) => {
            const d = JSON.parse(r.payload) as TaskDraft;
            return (
              <article key={r.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge" style={{ background: r.type === "ASSIGN" ? "#d946ef" : "#2563eb" }}>
                    {r.type === "ASSIGN" ? "Призначення від Креативу" : "Запит на задачу"}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-ink-3">
                    <Avatar name={r.requester.name} size={24} />
                    {r.requester.name} · {fmtDate(r.createdAt, true)}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-extrabold">{d.title}</h3>
                {d.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-ink-2">{d.description}</p>}
                <Draft d={d} />
                {r.note && <p className="mt-3 rounded-[12px] bg-panel px-3 py-2 text-sm">«{r.note}»</p>}
                {admin ? (
                  <form className="mt-4 flex flex-wrap gap-2.5">
                    <input name="decisionNote" maxLength={1000} placeholder="Коментар до рішення (необов’язково)" className="field min-w-[220px] flex-1" />
                    <button formAction={decideRequestAction.bind(null, r.id, true)} className="btn" style={{ background: "#16a34a", color: "#fff" }}>
                      <IconCheck size={16} />
                      Схвалити
                    </button>
                    <button formAction={decideRequestAction.bind(null, r.id, false)} className="btn btn-danger">
                      <IconX size={16} />
                      Відхилити
                    </button>
                    <Link href={`/requests/${r.id}/edit`} className="btn btn-soft">
                      <IconEdit size={16} />
                      Змінити й схвалити
                    </Link>
                  </form>
                ) : (
                  <form action={cancelRequestAction.bind(null, r.id)} className="mt-4">
                    <button className="btn btn-soft btn-sm">Відкликати</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="mb-3 mt-9 text-lg font-extrabold">Розглянуті</h2>
          <ul className="zebra card overflow-hidden">
            {done.map((r) => {
              const d = JSON.parse(r.payload) as TaskDraft;
              const s = STATUS[r.status];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="badge" style={{ background: s.color }}>
                    {s.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    {r.taskId ? (
                      <Link href={`/tasks/${r.taskId}`} className="font-bold hover:underline">
                        {d.title}
                      </Link>
                    ) : (
                      <span className="font-bold">{d.title}</span>
                    )}
                    <span className="block text-sm text-ink-3">
                      {r.requester.name} → {nameOf(d.assigneeId)} · вирішив(ла) {r.decidedBy?.name} {r.decidedAt && fmtDate(r.decidedAt, true)}
                      {r.decisionNote && ` · «${r.decisionNote}»`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
