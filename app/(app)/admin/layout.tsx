import { requireAdmin } from "@/lib/auth";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-[1180px]">
      <h1 className="text-[1.9rem] font-extrabold tracking-tight">Адмінка</h1>
      <div className="mb-6 mt-4">
        <AdminTabs />
      </div>
      {children}
    </div>
  );
}
