"use client";

import { useEffect } from "react";

/**
 * Ошибка на странице. Чаще всего — вкладка открыта со старой версией сайта после обновления
 * (кнопки обращаются к серверу, которого уже нет). Вместо «мёртвой» кнопки — понятное действие.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /Server Action|deployment|Failed to fetch|ChunkLoadError|Loading chunk/i.test(error.message);
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center">
      <div className="card w-full p-8 text-center">
        <div className="text-4xl" aria-hidden="true">
          {stale ? "🔄" : "⚠️"}
        </div>
        <h1 className="mt-3 text-xl font-extrabold">{stale ? "Сайт оновився" : "Щось пішло не так"}</h1>
        <p className="mt-2 text-sm text-ink-3">
          {stale ? "Цю вкладку відкрито зі старою версією. Оновіть сторінку — усе запрацює." : "Спробуйте ще раз. Якщо повторюється — оновіть сторінку."}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            Оновити сторінку
          </button>
          {!stale && (
            <button onClick={() => reset()} className="btn btn-soft">
              Спробувати знову
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
