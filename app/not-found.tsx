import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="card max-w-md p-10 text-center">
        <div className="text-6xl font-extrabold text-ink-3">404</div>
        <h1 className="mt-3 text-2xl font-extrabold">Не знайдено</h1>
        <p className="mt-2 text-ink-3">Такої сторінки немає, або у вас немає до неї доступу.</p>
        <Link href="/" className="btn btn-primary mt-6">
          На головну
        </Link>
      </div>
    </main>
  );
}
