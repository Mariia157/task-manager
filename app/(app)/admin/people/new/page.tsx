import { savePersonAction } from "@/app/actions/admin";
import { personFormProps } from "@/lib/personFormProps";
import { PersonForm } from "@/components/admin/PersonForm";

export const metadata = { title: "Новий працівник · Taskflow" };

export default async function NewPersonPage() {
  const props = await personFormProps();
  return (
    <PersonForm
      action={savePersonAction.bind(null, null)}
      {...props}
      isNew
      initial={{ name: "", login: "", contacts: "", telegram: "", responsibility: "", level: 1, roleIds: [], grants: [], subordinateIds: [], active: true }}
    />
  );
}
