import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/actions/auth";
import { deviceLabel } from "@/lib/device";
import { fmtDate } from "@/lib/format";

type S = { id: string; userAgent: string; lastSeenAt: Date; createdAt: Date; persistent: boolean; current: boolean };

/** Где выполнен вход: свои устройства, выход с отдельного или со всех остальных. */
export function SessionsCard({ sessions }: { sessions: S[] }) {
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="card p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-lg font-extrabold">Пристрої</h2>
        {others > 0 && (
          <form action={revokeOtherSessionsAction}>
            <button className="btn btn-soft btn-sm">Вийти на інших пристроях</button>
          </form>
        )}
      </div>
      <ul className="zebra overflow-hidden rounded-[14px]">
        {sessions.map((s) => {
          const d = deviceLabel(s.userAgent);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="text-xl" aria-hidden="true">
                {d.mobile ? "📱" : "💻"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {d.name}
                  {s.current && <span className="ml-2 rounded-full bg-[#e2f6e8] px-2 py-0.5 text-xs font-bold text-[#15803d]">цей пристрій</span>}
                </span>
                <span className="block text-xs text-ink-3">
                  {s.persistent ? "запам'ятовано" : "до закриття браузера"} · вхід {fmtDate(s.createdAt, true)} · був(ла) {fmtDate(s.lastSeenAt, true)}
                </span>
              </span>
              {!s.current && (
                <form action={revokeSessionAction.bind(null, s.id)}>
                  <button className="btn btn-soft btn-sm">Вийти</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
