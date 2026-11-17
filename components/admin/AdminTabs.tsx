"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/people", label: "Люди й доступи" },
  { href: "/admin/dictionaries", label: "Довідники" },
  { href: "/admin/projects", label: "Проєкти і колонки" },
  { href: "/admin/audit", label: "Журнал дій" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="scroll-x flex gap-1 rounded-[15px] bg-sunken p-1 sm:inline-flex">
      {TABS.map((t) => {
        const on = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-9 shrink-0 items-center rounded-[11px] px-3.5 text-sm font-bold transition-all ${
              on ? "bg-white text-ink shadow-[0_2px_8px_rgba(29,33,48,.12)]" : "text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
