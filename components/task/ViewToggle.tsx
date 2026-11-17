import Link from "next/link";
import { IconBoard, IconList } from "@/components/icons";

/** «Список / Доска»: вид сохраняется в адресе (?view=board), фильтры не сбрасываются. */
export function ViewToggle({ path, sp, view }: { path: string; sp: Record<string, string | string[] | undefined>; view: "list" | "board" }) {
  const href = (v: "list" | "board") => {
    const q = new URLSearchParams(Object.entries(sp).flatMap(([k, val]) => (typeof val === "string" && k !== "view" && k !== "limit" ? [[k, val]] : [])));
    if (v === "board") q.set("view", "board");
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <div className="flex gap-1 rounded-[13px] bg-sunken p-1" role="group" aria-label="Вид">
      {(["list", "board"] as const).map((v) => {
        const Icon = v === "list" ? IconList : IconBoard;
        return (
          <Link
            key={v}
            href={href(v)}
            scroll={false}
            aria-current={view === v ? "true" : undefined}
            className={`flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-bold transition-all ${
              view === v ? "bg-white text-ink shadow-[0_2px_8px_rgba(29,33,48,.12)]" : "text-ink-3 hover:text-ink"
            }`}
          >
            <Icon size={16} />
            {v === "list" ? "Список" : "Дошка"}
          </Link>
        );
      })}
    </div>
  );
}
