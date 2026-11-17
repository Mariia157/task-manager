"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Switch } from "@/components/ui/Switch";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-7 space-y-4">
      <div>
        <label className="label" htmlFor="login">Логін</label>
        <input id="login" name="login" className="field" autoComplete="username" autoCapitalize="none" required defaultValue={state.login} autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Пароль</label>
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" required />
      </div>
      <Switch name="remember" defaultChecked label="Запам’ятати цей пристрій" hint="Не питати пароль тиждень. На чужому комп’ютері вимкніть" />
      {state.error && (
        <div role="alert" className="rounded-xl bg-[#ffe6e8] px-4 py-3 text-sm font-semibold text-[#c01428]">
          {state.error}
        </div>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        Увійти
      </button>
    </form>
  );
}
