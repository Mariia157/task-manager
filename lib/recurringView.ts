import "server-only";
import { db } from "@/lib/db";
import { loadAccessUser, type CurrentUser } from "@/lib/auth";
import { assignDecision, canViewBoard } from "@/lib/access";
import { getDicts } from "@/lib/tasks";

/** Ежедневные задачи, которыми пользователь может управлять (ставить такие задачи напрямую). */
export async function manageableRecurring(user: CurrentUser) {
  const all = await db.recurringTask.findMany({
    include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, color: true } }, direction: true, subtype: true },
    orderBy: [{ active: "desc" }, { dueTime: "asc" }],
  });
  const out: typeof all = [];
  for (const r of all) {
    if (user.level >= 4) {
      out.push(r);
      continue;
    }
    const a = await loadAccessUser(r.assigneeId);
    if (a && assignDecision(user, a, r.direction, r.subtypeId) === "direct") out.push(r);
  }
  return out;
}

export async function recurringFormProps(user: CurrentUser) {
  const { projects, directions, people } = await getDicts();
  return {
    // ежедневные задачи на досках-черновиках не создаются — такие доски в список не попадают
    projects: projects.filter((p) => !p.isDraft && canViewBoard(user, p)).map((p) => ({ value: p.id, label: p.name, color: p.color })),
    directions: directions.map((d) => ({ id: d.id, name: d.name, color: d.color, subtypeLabel: d.subtypeLabel, subtypes: d.subtypes.map((s) => ({ id: s.id, name: s.name })) })),
    people: people.map((p) => ({ value: p.id, label: p.name, avatar: p.name })),
  };
}
