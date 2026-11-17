import "server-only";
import { assignMatrix, getDicts } from "@/lib/tasks";
import { dayKey } from "@/lib/time";
import type { CurrentUser } from "@/lib/auth";
import { canViewBoard } from "@/lib/access";

/** Справочники и матрица назначений для формы задачи. */
export async function taskFormProps(user: CurrentUser) {
  const [{ projects, directions, people, business }, matrix] = await Promise.all([getDicts(), assignMatrix(user)]);
  return {
    // доски-черновики — только админам, с пометкой
    projects: projects
      .filter((p) => canViewBoard(user, p))
      .map((p) => ({ value: p.id, label: p.isDraft ? `${p.name} · чернетка` : p.name, color: p.color })),
    canCreateBoard: user.level >= 4,
    directions: directions.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      subtypeLabel: d.subtypeLabel,
      roleName: d.role?.name ?? null,
      subtypes: d.subtypes.map((s) => ({ id: s.id, name: s.name })),
    })),
    // уровень 1 видит в списке только тех, кому может ставить задачи (себя) — остальных тоже, но через запрос
    people: people.map((p) => ({ id: p.id, name: p.name, roles: p.roles.map((r) => r.role.name).join(", ") })),
    matrix,
    business,
    today: dayKey(new Date()),
  };
}
