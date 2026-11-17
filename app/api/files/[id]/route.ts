import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewTask } from "@/lib/access";
import { toAccessTask } from "@/lib/tasks";

/** Вложение отдаётся только тем, кто видит задачу. Чужим — 404, как и сама задача. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const a = await db.attachment.findUnique({
    where: { id },
    include: { task: { include: { watchers: { select: { userId: true } }, mentions: { select: { userId: true } }, project: { select: { isDraft: true, accessAll: true } } } } },
  });
  if (!a || !canViewTask(user, toAccessTask(a.task))) return new Response("Not found", { status: 404 });
  const buf = await readFile(path.join(process.cwd(), "data", "uploads", a.storedName)).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  const inline = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(a.mime) && !new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": inline ? a.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, max-age=0",
    },
  });
}
