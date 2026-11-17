import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6">
          <Logo name="Taskflow" size={42} />
        </div>
        <div className="card p-8">
          <h1 className="text-2xl font-extrabold">Вхід у Taskflow</h1>
          <p className="mt-1 text-ink-3">Трекер задач для команди: дошки, строки, щоденні справи.</p>
          <LoginForm />
          <p className="mt-5 text-xs leading-relaxed text-ink-3">
            Реєстрації немає — облікові записи видає адміністратор команди. Якщо немає доступу або забули пароль, зверніться до нього.
          </p>
        </div>
      </div>
    </main>
  );
}
