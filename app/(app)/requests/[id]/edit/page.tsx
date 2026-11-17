import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { taskFormProps } from "@/lib/formProps";
import { toInputValues } from "@/lib/time";
import { fmtDate } from "@/lib/format";
import type { TaskDraft } from "@/lib/taskWrite";
import { approveEditedRequestAction } from "@/app/actions/tasks";
import { TaskForm } from "@/components/task/TaskForm";

export const metadata = { title: "Правка запиту · Taskflow" };

/** Запрос на согласовании: админ правит задачу и одобряет исправленный вариант. */
export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const req = await db.request.findUnique({ where: { id }, include: { requester: { select: { name: true } } } });
  if (!req || req.status !== "PENDING") notFound();
  const d = JSON.parse(req.payload) as TaskDraft;
  const props = await taskFormProps(admin);
  const dl = d.deadline ? toInputValues(new Date(d.deadline)) : null;
  const parent = d.parentId ? await db.task.findUnique({ where: { id: d.parentId }, select: { id: true, title: true } }) : null;
  return (
    <div className="mx-auto max-w-[860px]">
      <Link href="/requests" className="mb-4 inline-flex text-sm font-semibold text-ink-3 hover:text-ink">
        ← Запити
      </Link>
      <h1 className="text-[1.9rem] font-extrabold tracking-tight">Правка запиту</h1>
      <p className="mb-6 mt-1 text-ink-3">
        {req.type === "ASSIGN" ? "Призначення" : "Запит"} от {req.requester.name} · {fmtDate(req.createdAt, true)}. Виправте що потрібно і схваліть — задача створиться з вашими правками.
      </p>
      {req.note && <div className="panel mb-5 px-4 py-3 text-sm">Коментар автора: «{req.note}»</div>}
      <TaskForm
        action={approveEditedRequestAction.bind(null, req.id)}
        {...props}
        parent={parent}
        cancelHref="/requests"
        submitLabel="Схвалити з правками"
        allowRequest={false}
        extra={
          <div className="card p-5 sm:p-7">
            <label className="label" htmlFor="decisionNote">
              Коментар до рішення (побачить автор запиту)
            </label>
            <input id="decisionNote" name="decisionNote" maxLength={1000} placeholder="Наприклад: змінив строк і виконавця" className="field" />
          </div>
        }
        initial={{
          title: d.title,
          description: d.description,
          projectId: d.projectId,
          directionId: d.directionId,
          subtypeId: d.subtypeId ?? "",
          business: d.business ?? "",
          assigneeId: d.assigneeId,
          priority: d.priority,
          date: dl?.date ?? "",
          time: dl?.time ?? "18:00",
          noDeadline: !d.deadline,
          links: d.links ?? [],
          watcherIds: d.watcherIds ?? [],
          parentId: d.parentId ?? "",
          asIdea: d.asIdea,
        }}
      />
    </div>
  );
}
