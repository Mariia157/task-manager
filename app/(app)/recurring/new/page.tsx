import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageRecurring } from "@/lib/access";
import { recurringFormProps } from "@/lib/recurringView";
import { saveRecurringAction } from "@/app/actions/recurring";
import { RecurringForm } from "@/components/RecurringForm";

export const metadata = { title: "Нова щоденна задача · Taskflow" };

export default async function NewRecurringPage() {
  const user = await requireUser();
  if (!canManageRecurring(user)) redirect("/");
  const props = await recurringFormProps(user);
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="mb-6 text-[1.9rem] font-extrabold tracking-tight">Нова щоденна задача</h1>
      <RecurringForm
        action={saveRecurringAction.bind(null, null)}
        {...props}
        isEdit={false}
        initial={{
          title: "",
          description: "",
          assigneeId: "",
          projectId: "",
          directionId: props.directions[0]?.id ?? "",
          subtypeId: "",
          priority: "MEDIUM",
          dueTime: "09:00",
          weekdays: "12345",
          remindBefore: 60,
          active: true,
        }}
      />
    </div>
  );
}
