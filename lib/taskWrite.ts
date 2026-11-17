import "server-only";
import { db } from "@/lib/db";
import { notify, taskEvent } from "@/lib/audit";

/** Черновик задачи — то, что приходит из формы или лежит в запросе на подтверждение. */
export type TaskDraft = {
  title: string;
  description: string;
  projectId: string;
  directionId: string;
  subtypeId: string | null;
  /** вид работы: HR, Продажа, … (из списка или вписанный вручную); бизнес — это доска */
  business?: string | null;
  assigneeId: string;
  priority: string;
  deadline: string | null; // ISO
  parentId: string | null;
  links?: { label: string; url: string }[];
  watcherIds?: string[];
  /** «Пока идея» — положить в первую колонку, а не сразу «В работе» */
  asIdea?: boolean;
};

/** Колонка для новой задачи: первая не «готовая». */
/** Колонка «В работе» по названию, иначе — вторая не «готовая» (первая обычно «Идея»). */
export function inWorkOf<C extends { name: string; isDone: boolean }>(cols: C[]): C | undefined {
  const open = cols.filter((c) => !c.isDone);
  return open.find((c) => c.name.trim().toLowerCase() === "в роботі") ?? open[1] ?? open[0];
}

/** Колонка для новой задачи: сразу «В работе»; «Идея» — только если отмечено «пока идея». */
export async function startColumn(projectId: string, asIdea = false) {
  const cols = await db.boardColumn.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  if (asIdea) return cols.find((c) => !c.isDone) ?? cols[0] ?? null;
  return inWorkOf(cols) ?? cols[0] ?? null;
}

export async function topPosition(columnId: string) {
  const first = await db.task.findFirst({ where: { columnId }, orderBy: { position: "asc" }, select: { position: true } });
  return (first?.position ?? 1) - 1;
}

export async function createTaskFromDraft(d: TaskDraft, creatorId: string, viaRequest = false) {
  const col = await startColumn(d.projectId, d.asIdea);
  if (!col) throw new Error("У проєкту немає колонок");
  const task = await db.task.create({
    data: {
      title: d.title,
      description: d.description,
      projectId: d.projectId,
      columnId: col.id,
      position: await topPosition(col.id),
      directionId: d.directionId,
      subtypeId: d.subtypeId,
      business: d.business ?? null,
      assigneeId: d.assigneeId,
      creatorId,
      priority: d.priority,
      deadline: d.deadline ? new Date(d.deadline) : null,
      parentId: d.parentId,
      links: d.links?.length ? { create: d.links.map((l, i) => ({ ...l, sortOrder: i })) } : undefined,
      watchers: d.watcherIds?.length ? { create: [...new Set(d.watcherIds)].map((userId) => ({ userId })) } : undefined,
    },
  });
  await taskEvent(task.id, creatorId, "created", null, null, viaRequest ? "за запитом" : null);
  // доска-черновик: исполнитель узнает о задаче при публикации доски
  const draftBoard = (await db.project.findUnique({ where: { id: d.projectId }, select: { isDraft: true } }))?.isDraft;
  if (draftBoard) return task;
  if (d.parentId) await taskEvent(d.parentId, creatorId, "subtask", null, null, d.title);
  await notify([d.assigneeId], "assigned", `Нова задача: ${d.title}`, task.id, creatorId);
  if (d.watcherIds?.length) await notify(d.watcherIds, "status", `Ви спостерігач: ${d.title}`, task.id, creatorId);
  return task;
}

/** Валидация ссылок с подписями: только http(s). */
export function cleanLinks(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; url: string }[] = [];
  for (const r of raw.slice(0, 30)) {
    const label = String((r as { label?: unknown })?.label ?? "").trim().slice(0, 60);
    let url = String((r as { url?: unknown })?.url ?? "").trim().slice(0, 1000);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    } catch {
      continue;
    }
    out.push({ label: label || "Посилання", url });
  }
  return out;
}
