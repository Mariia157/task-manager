import { NextResponse, type NextRequest } from "next/server";

const SESSION = "sid";
const REMEMBER = "sr";
const REMEMBER_DAYS = 7;

/**
 * Оптимистичная проверка: без cookie сессии — на страницу входа. Настоящая проверка в requireUser().
 * «Запомненное» устройство: раз в день продлеваем cookie ещё на неделю, пока человек заходит.
 */
export function proxy(req: NextRequest) {
  const sid = req.cookies.get(SESSION)?.value;
  const { pathname } = req.nextUrl;
  if (!sid && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const res = NextResponse.next();
  const remembered = req.cookies.get(REMEMBER)?.value;
  const today = new Date().toISOString().slice(0, 10);
  if (sid && remembered && remembered !== today) {
    const opts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(Date.now() + REMEMBER_DAYS * 86400_000),
    };
    res.cookies.set(SESSION, sid, opts);
    res.cookies.set(REMEMBER, today, opts);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"],
};
