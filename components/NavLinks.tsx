"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBoard, IconChart, IconCheck, IconEdit, IconHome, IconInbox, IconList, IconLogout, IconRepeat, IconReport, IconSettings, IconUser, IconX } from "@/components/icons";

const ICONS = { home: IconHome, check: IconCheck, board: IconBoard, list: IconList, repeat: IconRepeat, inbox: IconInbox, chart: IconChart, report: IconReport, draft: IconEdit, settings: IconSettings, user: IconUser };

/** badge — красный (ждёт действия), count — серый (просто сколько) */
export type NavItem = { href: string; label: string; short?: string; icon: keyof typeof ICONS; badge?: number; count?: number };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Боковое меню на компьютере. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="hidden flex-col gap-1 lg:flex">
      {items.map((it) => {
        const active = isActive(path, it.href);
        const Icon = ICONS[it.icon];
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-[0.95rem] font-semibold transition-all ${
              active ? "bg-white text-ink shadow-[0_4px_14px_rgba(29,33,48,.10)]" : "text-ink-2 hover:bg-white/60 hover:text-ink"
            }`}
          >
            <Icon size={19} />
            <span>{it.label}</span>
            {it.badge ? <Badge n={it.badge} className="ml-auto" /> : it.count ? <Count n={it.count} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-[0.7rem] font-bold text-ink-3">{n}</span>;
}

function Badge({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e5283b] px-1.5 text-[0.7rem] font-extrabold text-white ${className}`}>{n}</span>
  );
}

/**
 * Нижняя панель на телефоне: 4 главных раздела + «Ещё» (лист с остальным).
 * Зона под пальцем — не меньше 56px, учитывается вырез снизу (safe-area).
 */
export function MobileNav({ main, more, logout }: { main: NavItem[]; more: NavItem[]; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const moreActive = more.some((m) => isActive(path, m.href));
  const moreBadge = more.reduce((s, m) => s + (m.badge ?? 0), 0);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex bg-white/95 px-1.5 pt-1.5 shadow-[0_-6px_24px_rgba(29,33,48,.10)] backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
        aria-label="Розділи"
      >
        {main.map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(path, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] text-[0.7rem] font-bold transition-colors ${
                active ? "bg-panel text-ink" : "text-ink-3"
              }`}
            >
              <Icon size={21} />
              {it.short ?? it.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[14px] text-[0.7rem] font-bold ${moreActive ? "bg-panel text-ink" : "text-ink-3"}`}
        >
          <span className="flex gap-[3px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-[5px] w-[5px] rounded-full bg-current" />
            ))}
          </span>
          <span className="mt-1.5">Ще</span>
          {moreBadge > 0 && <Badge n={moreBadge} className="absolute right-[18%] top-1" />}
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Ще розділи">
          <button className="absolute inset-0 bg-[#1d2130]/35" aria-label="Закрити" onClick={() => setOpen(false)} />
          <div
            className="pop absolute inset-x-2 bottom-2 rounded-[24px] p-2"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <span className="font-extrabold">Ще</span>
              <button onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-panel" aria-label="Закрити">
                <IconX size={16} />
              </button>
            </div>
            <ul>
              {more.map((it) => {
                const Icon = ICONS[it.icon];
                const active = isActive(path, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[52px] items-center gap-3.5 rounded-[14px] px-3.5 text-base font-semibold ${active ? "bg-panel" : "active:bg-panel"}`}
                    >
                      <Icon size={20} />
                      {it.label}
                      {it.badge ? <Badge n={it.badge} className="ml-auto" /> : it.count ? <Count n={it.count} /> : null}
                    </Link>
                  </li>
                );
              })}
              <li>
                <form action={logout}>
                  <button className="flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3.5 text-base font-semibold text-ink-3 active:bg-panel">
                    <IconLogout size={20} />
                    Вийти
                  </button>
                </form>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
