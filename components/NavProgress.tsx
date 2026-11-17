"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Тонкая полоска загрузки сверху: клик по ссылке сразу даёт отклик, пока грузится следующая страница.
 * Иначе кажется, что кнопка «не нажалась», и человек кликает ещё раз.
 */
export function NavProgress() {
  const path = usePathname();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [seen, setSeen] = useState(`${path}?${sp}`);
  const key = `${path}?${sp}`;
  if (seen !== key) {
    setSeen(key);
    setLoading(false);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname + url.search === location.pathname + location.search) return;
      setLoading(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // страховка: если переход не случился (ошибка, отмена) — убираем полоску
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 10_000);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      {loading && <div className="nav-progress h-full bg-[#2563eb]" />}
    </div>
  );
}
