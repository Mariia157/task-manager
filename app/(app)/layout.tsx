import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { LEVEL_NAME, canAdmin, canManageRecurring, canViewStats } from "@/lib/access";
import { db } from "@/lib/db";
import { ensureRecurringTasks } from "@/lib/recurring";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { MobileNav, NavLinks, type NavItem } from "@/components/NavLinks";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";
import { IconLogout, IconPlus } from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureRecurringTasks();
  const drafts = await db.draft.count({ where: { userId: user.id } });
  const pending = canAdmin(user)
    ? await db.request.count({ where: { status: "PENDING" } })
    : await db.request.count({ where: { status: "PENDING", requesterId: user.id } });
  const main: NavItem[] = [
    { href: "/", label: "Головна", icon: "home" },
    { href: "/my", label: "Мої задачі", short: "Мої", icon: "check" },
    { href: "/boards", label: "Дошки", icon: "board" },
    { href: "/tasks", label: "Усі задачі", short: "Задачі", icon: "list" },
  ];
  const more: NavItem[] = [
    ...(canManageRecurring(user) ? [{ href: "/recurring", label: "Щоденні задачі", icon: "repeat" as const }] : []),
    { href: "/requests", label: "Запити", icon: "inbox", badge: pending || undefined },
    { href: "/drafts", label: "Чернетки", icon: "draft", count: drafts || undefined },
    ...(canViewStats(user)
      ? [
          { href: "/stats", label: "Статистика", icon: "chart" as const },
          { href: "/reports", label: "Звіти", icon: "report" as const },
        ]
      : []),
    ...(canAdmin(user) ? [{ href: "/admin", label: "Адмінка", icon: "settings" as const }] : []),
  ];

  return (
    <div className="min-h-screen lg:flex">
      <Suspense>
        <NavProgress />
      </Suspense>
      <aside className="z-20 bg-panel shadow-[4px_0_24px_rgba(29,33,48,.06)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[250px] lg:shrink-0 lg:flex-col lg:p-5">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:mb-7 lg:p-0">
          <Link href="/"><Logo name="Taskflow" /></Link>
          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/profile" aria-label="Профіль" className="rounded-full">
              <Avatar name={user.name} size={38} />
            </Link>
            <Link href="/tasks/new" className="btn btn-primary btn-sm h-10 w-10 !p-0" aria-label="Нова задача">
              <IconPlus size={18} />
            </Link>
          </div>
        </div>
        <Link href="/tasks/new" className="btn btn-primary mb-5 hidden w-full lg:flex">
          <IconPlus size={17} />
          Нова задача
        </Link>
        <NavLinks items={[...main, ...more]} />
        <div className="mt-auto hidden pt-4 lg:block">
          <Link href="/profile" className="card lift flex items-center gap-3 p-3">
            <Avatar name={user.name} size={38} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{user.name}</span>
              <span className="block truncate text-xs text-ink-3">{LEVEL_NAME[user.level]}</span>
            </span>
          </Link>
          <form action={logoutAction} className="mt-2">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-3 hover:bg-sunken hover:text-ink">
              <IconLogout size={16} />
              Вийти
            </button>
          </form>
        </div>
      </aside>
      <MobileNav main={main} more={[...more, { href: "/profile", label: "Профіль", icon: "user" }]} logout={logoutAction} />
      {/* снизу на телефоне — место под нижнюю панель */}
      <main className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-9 lg:pb-16 lg:pt-8">{children}</main>
    </div>
  );
}
