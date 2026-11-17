import "server-only";
import { canMoveTask } from "@/lib/access";
import { toAccessTask, type TaskCardData } from "@/lib/tasks";
import { DEFAULT_COLUMNS } from "@/lib/defaults";
import type { CurrentUser } from "@/lib/auth";
import type { KanbanColumn } from "@/components/task/Kanban";

/**
 * Доска «по статусам» для задач из разных проектов: колонка = название колонки доски.
 * Стандартные статусы идут первыми и показываются, даже если пусты.
 */
export function statusColumns(user: CurrentUser, tasks: TaskCardData[]): KanbanColumn[] {
  const cols = new Map<string, KanbanColumn>();
  for (const c of DEFAULT_COLUMNS) cols.set(c.name, { id: c.name, name: c.name, color: c.color, isDone: c.isDone, tasks: [] });
  for (const t of tasks) {
    let col = cols.get(t.column.name);
    if (!col) {
      col = { id: t.column.name, name: t.column.name, color: t.column.color, isDone: t.column.isDone, tasks: [] };
      cols.set(t.column.name, col);
    }
    col.tasks.push({ ...t, canMove: canMoveTask(user, toAccessTask(t)) });
  }
  return [...cols.values()];
}
