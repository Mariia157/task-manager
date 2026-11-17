"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { createTaskFromDraft, type TaskDraft } from "@/lib/taskWrite";

/** Решение по запросу: только админ. При одобрении задача создаётся от имени автора запроса. */
export async function decideRequestAction(id: string, approve: boolean, form: FormData) {
  const user = await requireUser();
  if (user.level < 4) throw new Error("Рішення ухвалює адмін");
  const req = await db.request.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;
  const note = String(form.get("decisionNote") ?? "").trim().slice(0, 1000);
  const draft = JSON.parse(req.payload) as TaskDraft;
  let taskId: string | null = null;
  if (approve) {
    const assignee = await db.user.findUnique({ where: { id: draft.assigneeId } });
    const project = await db.project.findFirst({ where: { id: draft.projectId, archivedAt: null } });
    if (!assignee?.active || !project) throw new Error("Виконавця вимкнено або проєкт в архіві — відхиліть запит");
    const task = await createTaskFromDraft(draft, req.requesterId, true);
    taskId = task.id;
  }
  await db.request.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note, taskId },
  });
  await audit(user.id, approve ? "request.approve" : "request.reject", "request", id, draft.title);
  await notify(
    [req.requesterId],
    "request",
    `${approve ? "Схвалено" : "Відхилено"}: ${draft.title}${note ? ` — ${note}` : ""}`,
    taskId ?? undefined,
    user.id,
  );
  revalidatePath("/requests");
}

/** Автор может отозвать свой запрос, пока его не рассмотрели. */
export async function cancelRequestAction(id: string) {
  const user = await requireUser();
  const req = await db.request.findUnique({ where: { id } });
  if (!req || req.requesterId !== user.id || req.status !== "PENDING") return;
  await db.request.delete({ where: { id } });
  revalidatePath("/requests");
}
