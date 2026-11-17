/** Столбики «закрыто по дням»: одна серия, без легенды; подсказка при наведении/фокусе. */
export function DayBars({
  data,
  label,
  onTimeLabel,
}: {
  data: { key: string; short: string; long: string; closed: number; onTime: number }[];
  label: string;
  onTimeLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.closed));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const dense = data.length > 14;

  return (
    <figure aria-label={label}>
      <div className="flex gap-3">
        <div className="relative w-6 shrink-0 text-right text-xs font-semibold text-ink-3" style={{ height: 220 }}>
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(v / top) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative flex items-end gap-[3px]" style={{ height: 220 }}>
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              {ticks.map((v) => (
                <span key={v} className="absolute inset-x-0 h-[2px] translate-y-1/2 rounded-full bg-sunken/70" style={{ bottom: `${(v / top) * 100}%` }} />
              ))}
            </div>
            {data.map((d) => (
              <div key={d.key} className="group relative z-[1] flex h-full min-w-0 flex-1 items-end justify-center" tabIndex={0} aria-label={`${d.long}: ${d.closed}`}>
                <div
                  className="w-full max-w-[34px] rounded-t-[4px] bg-[#16a34a] transition-[filter] group-hover:brightness-110 group-focus:brightness-110"
                  style={{ height: `${(d.closed / top) * 100}%`, minHeight: d.closed ? 4 : 0 }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus:block">
                  <div className="font-bold">{d.long}</div>
                  <div>
                    {label}: <b>{d.closed}</b>
                  </div>
                  <div className="text-white/75">
                    {onTimeLabel}: {d.onTime}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-[3px]">
            {data.map((d, i) => (
              <div
                key={d.key}
                className={`min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[0.7rem] font-semibold text-ink-3 ${
                  data.length > 7 && !dense && i % 2 !== (data.length - 1) % 2 ? "max-sm:invisible" : ""
                } ${dense && i % 6 !== (data.length - 1) % 6 ? "max-sm:invisible" : ""}`}
              >
                {!dense || i % 3 === (data.length - 1) % 3 ? d.short : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1; v += step) {
    out.push(v);
    if (v >= max) break;
  }
  return out;
}
