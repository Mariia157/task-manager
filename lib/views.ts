import "server-only";
import { db } from "@/lib/db";
import { filterPeople, getDicts } from "@/lib/tasks";
import type { CurrentUser } from "@/lib/auth";
import { canViewBoard } from "@/lib/access";

/** Всё, что нужно панели фильтров: направления с подтипами, люди, сохранённые виды. */
export async function filterProps(user: CurrentUser) {
  const [{ directions, projects, business }, people, views] = await Promise.all([
    getDicts(),
    filterPeople(user),
    db.savedView.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return {
    directions: directions.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      subtypeLabel: d.subtypeLabel,
      subtypes: d.subtypes.map((s) => ({ id: s.id, name: s.name })),
    })),
    people: people.map((p) => ({ value: p.id, label: p.name, avatar: p.name })),
    projects: projects.filter((p) => canViewBoard(user, p)).map((p) => ({ value: p.id, label: p.name, color: p.color })),
    business: [...business.presets.map((b) => ({ value: b.name, label: b.name, color: b.color })), ...business.custom.map((c) => ({ value: c, label: c }))],
    views: views.map((v) => ({ id: v.id, name: v.name, query: v.query, mine: v.userId === user.id, shared: v.userId === null })),
    canShare: user.level >= 4,
  };
}
