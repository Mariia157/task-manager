import { getCurrentUser } from "@/lib/auth";
import { canViewStats } from "@/lib/access";
import { buildReport, buildTeamReport, parsePeriod } from "@/lib/report";
import { renderReportPdf } from "@/lib/reportPdf";
import { renderTeamReportPdf } from "@/lib/teamReportPdf";
import { audit } from "@/lib/audit";

/** PDF-отчёт по сотруднику: /api/reports/pdf?user=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  if (!viewer || !canViewStats(viewer)) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const p = parsePeriod(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  if (!p) return new Response("Невірний період", { status: 400 });
  if (sp.get("user") === "all") {
    const team = await buildTeamReport(viewer, p);
    if (!team) return new Response("Not found", { status: 404 });
    const pdf = await renderTeamReportPdf(team);
    await audit(viewer.id, "report.pdf", "team", null, `усі працівники (${team.rows.length}): ${p.period.from} — ${p.period.to}`);
    const name = `Звіт по команді ${p.period.from}${p.period.to !== p.period.from ? `_${p.period.to}` : ""}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="team-report.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const report = await buildReport(viewer, sp.get("user") ?? "", p);
  if (!report) return new Response("Not found", { status: 404 });

  const pdf = await renderReportPdf(report);
  await audit(viewer.id, "report.pdf", "user", report.person.id, `${report.person.name}: ${p.period.from} — ${p.period.to}`);
  const name = `Звіт ${report.person.name} ${p.period.from}${p.period.to !== p.period.from ? `_${p.period.to}` : ""}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
