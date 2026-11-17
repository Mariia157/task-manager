import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTaskForUser } from "@/lib/tasks";
import { taskFormProps } from "@/lib/formProps";
import { createTaskAction } from "@/app/actions/tasks";
import { TaskForm } from "@/components/task/TaskForm";

export const metadata = { title: "Нова задача · Taskflow" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const props = await taskFormProps(user);
  // подзадача: родитель должен быть виден; проект и направление берём у него
  const parent = sp.parent ? await getTaskForUser(user, sp.parent) : null;
  const p = parent?.task;
  // черновик — только свой
  const draft = sp.draft ? await db.draft.findFirst({ where: { id: sp.draft, userId: user.id } }) : null;
  const d = draft ? (JSON.parse(draft.payload) as Record<string, string | string[]>) : null;
  const ds = (k: string) => (typeof d?.[k] === "string" ? (d[k] as string) : "");
  let draftLinks: { label: string; url: string }[] = [];
  try {
    draftLinks = d ? JSON.parse(ds("links") || "[]") : [];
  } catch {}
  const projectId = (d && props.projects.some((x) => x.value === ds("projectId")) ? ds("projectId") : "") || p?.projectId || (props.projects.some((x) => x.value === sp.project) ? sp.project! : "");
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="mb-1 text-[1.9rem] font-extrabold tracking-tight">{draft ? "Чернетка задачі" : p ? "Нова підзадача" : "Нова задача"}</h1>
      <p className="mb-6 text-ink-3">
        {user.level === 1
          ? "Собі — одразу. Іншому працівнику — через підтвердження адміна."
          : "Якщо призначення поза вашими правами, задача піде адміну на підтвердження."}
      </p>
      <TaskForm
        action={createTaskAction}
        {...props}
        parent={p ? { id: p.id, title: p.title } : null}
        cancelHref={p ? `/tasks/${p.id}` : projectId ? `/boards/${projectId}` : "/tasks"}
        submitLabel="Створити задачу"
        draftId={draft?.id}
        initial={
          d
            ? {
                title: ds("title"),
                description: ds("description"),
                projectId,
                directionId: props.directions.some((x) => x.id === ds("directionId")) ? ds("directionId") : (props.directions[0]?.id ?? ""),
                subtypeId: ds("subtypeId"),
                subtypeNew: ds("subtypeNew"),
                business: ds("business"),
                assigneeId: ds("assigneeId"),
                priority: ds("priority") || "MEDIUM",
                date: ds("deadlineDate"),
                time: ds("deadlineTime") || "18:00",
                noDeadline: ds("noDeadline") === "1",
                links: draftLinks,
                watcherIds: Array.isArray(d.watchers) ? d.watchers : [],
                parentId: ds("parentId"),
                asIdea: ds("asIdea") === "1",
              }
            : {
                title: "",
                description: "",
                projectId,
                directionId: sp.direction && props.directions.some((x) => x.id === sp.direction) ? sp.direction : (props.directions[0]?.id ?? ""),
                subtypeId: "",
                // подзадача наследует направление родителя
                business: p?.business ?? "",
                assigneeId: user.level === 1 ? user.id : "",
                priority: p?.priority ?? "MEDIUM",
                date: "",
                time: "18:00",
                noDeadline: false,
                links: [],
                watcherIds: [],
                parentId: p?.id ?? "",
              }
        }
      />
    </div>
  );
}
