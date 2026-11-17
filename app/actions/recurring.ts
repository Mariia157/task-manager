"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { loadAccessUser, requireUser, type CurrentUser } from "@/lib/auth";
import { assignDecision, canManageRecurring, isPriority } from "@/lib/access";
import { audit } from "@/lib/audit";
import { ensureRecurringTasks } from "@/lib/recurring";
import { resolveSubtype } from "@/lib/subtypeInput";
import { dayKey, fromZoned, zonedParts } from "@/lib/time";

export type RecState = { error?: string };
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

/** Ежедневную задачу на человека заводит тот, кто может ставить ему такие задачи напрямую. */
async function mayManage(user: CurrentUser, assigneeId: string, directionId: string, subtypeId: string | null) {
  if (!canManageRecurring(user)) return false;
  const [a, d] = await Promise.all([loadAccessUser(assigneeId), db.direction.findUnique({ where: { id: directionId } })]);
  return !!a && !!d && assignDecision(user, a, d, subtypeId) === "direct";
}

export async function saveRecurringAction(id: string | null, _p: RecState, form: FormData): Promise<RecState> {
  const user = await requireUser();
  const title = str(form, "title", 200);
  const assigneeId = str(form, "assigneeId");
  const projectId = str(form, "projectId");
  const directionId = str(form, "directionId");
  const priority = str(form, "priority");
  const dueTime = str(form, "dueTime", 5);
  const weekdays = form.getAll("weekdays").map(String).filter((d) => /^[1-7]$/.test(d)).sort().join("");
  const remindBefore = Math.max(0, Math.min(720, Number(form.get("remindBefore")) || 0));
  if (!title) return { error: "Введіть назву" };
  if (!assigneeId || !projectId || !directionId) return { error: "Заповніть виконавця, проєкт і відділ" };
  if (!isPriority(priority)) return { error: "Виберіть пріоритет" };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return { error: "Строк — час у форматі ГГ:ХХ" };
  if (!weekdays) return { error: "Позначте хоча б один день" };
  if (!(await db.direction.findFirst({ where: { id: directionId, active: true } }))) return { error: "Виберіть відділ" };
  const st = await resolveSubtype(form, directionId);
  if (st.error) return { error: st.error };
  const subtypeId = st.subtypeId;
  if (!(await mayManage(user, assigneeId, directionId, subtypeId))) return { error: "Ви не можете ставити такі задачі цьому працівнику" };
  if (id) {
    const cur = await db.recurringTask.findUnique({ where: { id } });
    if (!cur || !(await mayManage(user, cur.assigneeId, cur.directionId, cur.subtypeId))) return { error: "Немає прав" };
  }
  const data = {
    title,
    description: str(form, "description", 5000),
    assigneeId,
    projectId,
    directionId,
    subtypeId,
    priority,
    dueTime,
    weekdays,
    remindBefore,
    active: id ? form.get("active") === "1" : true,
  };
  const rec = id ? await db.recurringTask.update({ where: { id }, data }) : await db.recurringTask.create({ data });
  if (id) {
    // сегодняшняя карточка (если ещё не закрыта) сразу получает новый приоритет, название, отдел и срок
    const z = zonedParts(new Date());
    const [h, mi] = dueTime.split(":").map(Number);
    await db.task.updateMany({
      where: { recurringId: id, recurringDay: dayKey(new Date()), completedAt: null, archivedAt: null },
      data: { title, description: data.description, priority, directionId, subtypeId, deadline: fromZoned(z.y, z.m, z.d, h, mi) },
    });
  }
  await audit(user.id, id ? "recurring.update" : "recurring.create", "recurring", rec.id, title);
  await ensureRecurringTasks(new Date(), true);
  redirect("/recurring");
}

export async function deleteRecurringAction(id: string) {
  const user = await requireUser();
  const cur = await db.recurringTask.findUnique({ where: { id } });
  if (!cur || !(await mayManage(user, cur.assigneeId, cur.directionId, cur.subtypeId))) throw new Error("Немає прав");
  // карточки прошлых дней остаются в истории, связь просто обнуляется
  await db.recurringTask.delete({ where: { id } });
  await audit(user.id, "recurring.delete", "recurring", id, cur.title);
  revalidatePath("/recurring");
}
