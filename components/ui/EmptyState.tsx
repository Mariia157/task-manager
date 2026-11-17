export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <svg width="64" height="52" viewBox="0 0 64 52" aria-hidden="true">
        <rect x="4" y="10" width="44" height="34" rx="9" fill="#e2ddd4" />
        <rect x="14" y="4" width="46" height="36" rx="9" fill="#fff" style={{ filter: "drop-shadow(0 6px 10px rgba(29,33,48,.12))" }} />
        <rect x="22" y="14" width="22" height="4" rx="2" fill="#d5d0c6" />
        <rect x="22" y="23" width="30" height="4" rx="2" fill="#e6e2da" />
      </svg>
      <div className="mt-2 text-lg font-bold">{title}</div>
      {hint && <div className="max-w-sm text-sm text-ink-3">{hint}</div>}
      {children}
    </div>
  );
}
