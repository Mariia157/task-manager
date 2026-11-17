import "server-only";
import { db } from "@/lib/db";

/** Журнал действий (админка, доступы, запросы). */
export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, detail = "") {
  await db.auditLog.create({ data: { actorId, action, entity, entityId, detail: detail.slice(0, 2000) } });
}

/** Запись в историю карточки. */
export async function taskEvent(
  taskId: string,
  actorId: string,
  type: string,
  field?: string | null,
  fromValue?: string | null,
  toValue?: string | null,
) {
  await db.taskEvent.create({ data: { taskId, actorId, type, field: field ?? null, fromValue: fromValue ?? null, toValue: toValue ?? null } });
}

/** Поставить уведомление в очередь Telegram (отправка — этап 5). */
export async function notify(userIds: string[], type: string, text: string, taskId?: string, exceptId?: string) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptId);
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, type, text, taskId: taskId ?? null })) });
}
