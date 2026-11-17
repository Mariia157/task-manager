import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTaskForUser } from "@/lib/tasks";
import { taskFormProps } from "@/lib/formProps";
import { toInputValues } from "@/lib/time";
import { updateTaskAction } from "@/app/actions/tasks";
import { TaskForm } from "@/components/task/TaskForm";

export const metadata = { title: "Правка задачі · Taskflow" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const found = await getTaskForUser(user, id);
  if (!found || !found.canManage) notFound();
  const t = found.task;
  const props = await taskFormProps(user);
  const dl = t.deadline ? toInputValues(t.deadline) : null;
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="mb-6 text-[1.9rem] font-extrabold tracking-tight">Правка задачі</h1>
      <TaskForm
        action={updateTaskAction.bind(null, t.id)}
        {...props}
        // текущий проект мог уйти в архив — оставляем его в списке, чтобы форма не потеряла значение
        projects={props.projects.some((p) => p.value === t.projectId) ? props.projects : [{ value: t.project.id, label: t.project.name, color: t.project.color }, ...props.projects]}
        parent={t.parent}
        cancelHref={`/tasks/${t.id}`}
        submitLabel="Зберегти"
        allowRequest={false}
        initial={{
          title: t.title,
          description: t.description,
          projectId: t.projectId,
          directionId: t.directionId,
          subtypeId: t.subtypeId ?? "",
          business: t.business ?? "",
          assigneeId: t.assigneeId,
          priority: t.priority,
          date: dl?.date ?? "",
          time: dl?.time ?? "18:00",
          noDeadline: !t.deadline,
          links: t.links.map((l) => ({ label: l.label, url: l.url })),
          watcherIds: t.watchers.map((w) => w.userId),
          parentId: t.parentId ?? "",
        }}
      />
    </div>
  );
}
