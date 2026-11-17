import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { manageableRecurring, recurringFormProps } from "@/lib/recurringView";
import { saveRecurringAction } from "@/app/actions/recurring";
import { RecurringForm } from "@/components/RecurringForm";

export const metadata = { title: "Щоденні задачі · Taskflow" };

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = (await manageableRecurring(user)).find((x) => x.id === id);
  if (!r) notFound();
  const props = await recurringFormProps(user);
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="mb-6 text-[1.9rem] font-extrabold tracking-tight">Щоденна задача: {r.title}</h1>
      <RecurringForm
        action={saveRecurringAction.bind(null, r.id)}
        {...props}
        isEdit
        initial={{
          title: r.title,
          description: r.description,
          assigneeId: r.assigneeId,
          projectId: r.projectId,
          directionId: r.directionId,
          subtypeId: r.subtypeId ?? "",
          priority: r.priority,
          dueTime: r.dueTime,
          weekdays: r.weekdays,
          remindBefore: r.remindBefore,
          active: r.active,
        }}
      />
    </div>
  );
}
