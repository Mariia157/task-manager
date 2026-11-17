import "server-only";
import { db } from "@/lib/db";

export async function personFormProps(exceptId?: string) {
  const [roles, directions, people, closedBoards] = await Promise.all([
    db.role.findMany({ orderBy: { sortOrder: "asc" } }),
    db.direction.findMany({ orderBy: { sortOrder: "asc" }, include: { subtypes: { orderBy: { sortOrder: "asc" } } } }),
    db.user.findMany({ where: { active: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { accessAll: false, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  return {
    roles: roles.map((r) => ({ id: r.id, name: r.name, parentId: r.parentId, active: r.active })),
    directions: directions.map((d) => ({ id: d.id, name: d.name, color: d.color, subtypes: d.subtypes.map((s) => ({ id: s.id, name: s.name })) })),
    people,
    closedBoards,
  };
}
