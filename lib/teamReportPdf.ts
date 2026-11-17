import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { TeamReport } from "@/lib/report";
import { fmtDate, fmtDuration, isDoneLate, priorityMeta, workDayView } from "@/lib/format";
import { TZ } from "@/lib/time";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const LOGO = path.join(process.cwd(), "public", "brand", "logo-wide.png");
const INK = "#1d2130";
const INK2 = "#4a4f5f";
const INK3 = "#7c8090";
const PANEL = "#f4f2ee";
const GREEN = "#16a34a";
const RED = "#c01428";
const BLUE = "#2563eb";
const ORANGE = "#b45f06";

const ruDate = (k: string) => k.split("-").reverse().join(".");
const ruDateTime = (d: Date) =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

type Col = { title: string; width: number; align?: "left" | "right" | "center" };
type Cell = { text: string; color?: string; bold?: boolean; sub?: string };

/** Статус строки: «Готово 05.11», «В работе», «В работе · просрочено»; ежедневная прошлого дня — «Не выполнена». */
export function teamStatus(
  t: { completedAt: Date | null; deadline: Date | null; lateOk?: boolean; column: { name: string }; recurringId?: string | null; archivedAt?: Date | null },
  now: Date,
) {
  if (t.completedAt) return { text: `${t.column.name} · ${fmtDate(t.completedAt)}`, late: isDoneLate(t), done: true };
  if (t.recurringId && t.archivedAt) return { text: "Не виконана", late: true, done: false };
  const late = !!t.deadline && t.deadline < now;
  return { text: late ? `${t.column.name} · прострочено` : t.column.name, late, done: false };
}

/** Вид работы · доска · ежедневная · приоритет · отдел (подтип) — всё, что есть у задачи. */
export function teamTaskMeta(t: {
  business: string | null;
  project: { name: string };
  direction: { name: string };
  subtype: { name: string } | null;
  priority: string;
  recurringDay?: string | null;
}) {
  return [
    t.business ? `${t.business} · ${t.project.name}` : t.project.name,
    t.recurringDay ? `щоденна за ${ruDate(t.recurringDay).slice(0, 5)}` : null,
    `пріоритет: ${priorityMeta(t.priority).label.toLowerCase()}`,
    t.direction.name + (t.subtype ? ` · ${t.subtype.name}` : ""),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Отчёт по всем сотрудникам (A4 альбомный).
 * Итоги сверху, затем строки в формате: Сотрудник | Статус (с пометкой «просрочено») | Задача (с видом работы, доской, отделом) | Дедлайн.
 */
export function renderTeamReportPdf(r: TeamReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 36, bottom: 44, left: 40, right: 40 },
    bufferPages: true,
    info: { Title: `Звіт по команді, ${ruDate(r.period.from)}–${ruDate(r.period.to)}`, Author: "Taskflow", Creator: "Taskflow" },
  });
  doc.registerFont("R", path.join(FONT_DIR, "Onest-Regular.ttf"));
  doc.registerFont("S", path.join(FONT_DIR, "Onest-SemiBold.ttf"));
  doc.registerFont("B", path.join(FONT_DIR, "Onest-ExtraBold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  // ── шапка ──
  try {
    doc.image(LOGO, L, 32, { height: 26 });
  } catch {
    /* без логотипа */
  }
  doc.font("B").fontSize(11).fillColor(INK).text("Taskflow", L + 44, 39);
  doc.font("R").fontSize(8.5).fillColor(INK3).text(`Сформовано ${ruDateTime(r.generatedAt)} · ${r.generatedBy}`, L, 40, { width: W, align: "right" });
  doc.y = 76;
  doc.font("B").fontSize(19).fillColor(INK).text("Звіт про роботу команди", L, doc.y, { width: W });
  doc
    .font("R")
    .fontSize(10)
    .fillColor(INK2)
    .text(
      `${r.period.from === r.period.to ? `За ${ruDate(r.period.from)}` : `Період: ${ruDate(r.period.from)} — ${ruDate(r.period.to)}`}   ·   Працівників: ${r.rows.length}   ·   У таблиці: виконані за період, усі відкриті зараз і щоденні по днях`,
      { width: W },
    );
  if (r.partial) doc.font("R").fontSize(8.5).fillColor(INK3).text("До звіту ввійшли лише працівники й задачі, доступні укладачеві звіту.", { width: W });
  doc.moveDown(0.8);

  // ── итоги ──
  const t = r.totals;
  const tiles = [
    { label: "Виконано задач", value: String(t.done), sub: `вчасно ${pct(t.doneOnTime, t.done)}`, color: GREEN },
    { label: "Із запізненням", value: String(t.doneLate), color: t.doneLate ? ORANGE : INK3 },
    { label: "Нових задач за період", value: String(t.assigned), color: BLUE },
    { label: "Відкрито зараз", value: String(t.openNow), sub: t.lateNow ? `прострочено ${t.lateNow}` : "без прострочень", color: t.lateNow ? RED : INK },
    { label: "Щоденні: виконано днів", value: `${t.recurringDone} з ${t.recurringDays}`, color: t.recurringDone === t.recurringDays ? GREEN : ORANGE },
  ];
  const gap = 10;
  const tw = (W - gap * (tiles.length - 1)) / tiles.length;
  const top = doc.y;
  tiles.forEach((x, i) => {
    const xx = L + i * (tw + gap);
    doc.roundedRect(xx, top, tw, 56, 10).fill(PANEL);
    doc.rect(xx, top + 11, 3, 34).fill(x.color);
    doc.font("R").fontSize(8.5).fillColor(INK3).text(x.label, xx + 13, top + 9, { width: tw - 20 });
    doc.font("B").fontSize(17).fillColor(x.color).text(x.value, xx + 13, top + 21, { width: tw - 20 });
    if (x.sub) doc.font("R").fontSize(8).fillColor(INK2).text(x.sub, xx + 13, top + 41, { width: tw - 20 });
  });
  doc.y = top + 70;
  doc.x = L;

  // ── таблица ──
  const pad = 6;
  const cols: Col[] = [
    { title: "Працівник", width: 1.7 },
    { title: "Статус", width: 1.6 },
    { title: "Задача", width: 5 },
    { title: "Дедлайн", width: 1.2 },
  ];
  const total = cols.reduce((a, c) => a + c.width, 0);
  const ws = cols.map((c) => (c.width / total) * W);
  const header = () => {
    const y = doc.y;
    doc.roundedRect(L, y, W, 20, 5).fill(INK);
    let x = L;
    cols.forEach((c, i) => {
      doc.font("S").fontSize(8.5).fillColor("#ffffff").text(c.title, x + pad, y + 6, { width: ws[i] - pad * 2, align: c.align ?? "left", lineBreak: false });
      x += ws[i];
    });
    doc.y = y + 22;
  };
  doc.font("B").fontSize(12).fillColor(INK).text(`Задачі · ${r.tasks.length}`, L, doc.y, { width: W });
  doc.moveDown(0.35);
  if (!r.tasks.length) doc.font("R").fontSize(9.5).fillColor(INK3).text("Задач за цей період немає.", L, doc.y, { width: W });
  else {
    header();
    let prev = "";
    r.tasks.forEach((x, ri) => {
      const st = teamStatus(x, r.generatedAt);
      const meta = teamTaskMeta(x);
      const name = x.assignee.name !== prev ? x.assignee.name : "";
      const cells: Cell[] = [
        { text: name, bold: true },
        { text: st.text, color: st.done ? (st.late ? ORANGE : GREEN) : st.late ? RED : INK2, bold: st.late || st.done },
        { text: x.title, bold: true, sub: meta },
        { text: x.deadline ? fmtDate(x.deadline, true) : "без строку", color: st.late && !st.done ? RED : INK2, bold: st.late && !st.done },
      ];
      doc.font("R").fontSize(8.5);
      const h =
        Math.max(
          ...cells.map((c, i) => doc.heightOfString(c.text || " ", { width: ws[i] - pad * 2 }) + (c.sub ? doc.fontSize(7.5).heightOfString(c.sub, { width: ws[i] - pad * 2 }) + 1 : 0)),
        ) + 9;
      doc.fontSize(8.5);
      if (doc.y + h > bottom()) {
        doc.addPage();
        header();
        prev = "";
        cells[0].text = x.assignee.name; // на новой странице имя повторяем
      }
      const y = doc.y;
      // новая группа сотрудника — полоса сверху, внутри группы — зебра
      if (name && ri > 0) doc.rect(L, y, W, 1.5).fill("#e2ddd4");
      else if (ri % 2 === 1) doc.rect(L, y, W, h).fill(PANEL);
      let xx = L;
      cells.forEach((c, i) => {
        doc.font(c.bold ? "S" : "R").fontSize(8.5).fillColor(c.color ?? INK).text(c.text, xx + pad, y + 4.5, { width: ws[i] - pad * 2, align: cols[i].align ?? "left" });
        if (c.sub) doc.font("R").fontSize(7.5).fillColor(INK3).text(c.sub, xx + pad, doc.y + 1, { width: ws[i] - pad * 2 });
        xx += ws[i];
      });
      doc.y = y + h;
      prev = x.assignee.name;
    });
  }

  // ── рабочие дни: место, начало, конец ──
  if (r.work.length) {
    const wc: Col[] = [
      { title: "Працівник", width: 1.7 },
      { title: "Дата", width: 1 },
      { title: "Місце", width: 1.6 },
      { title: "Початок", width: 0.9 },
      { title: "Кінець", width: 1.1 },
      { title: "Години", width: 1.1 },
    ];
    const wt = wc.reduce((a, c) => a + c.width, 0);
    const wws = wc.map((c) => (c.width / wt) * W);
    const wHeader = () => {
      const y = doc.y;
      doc.roundedRect(L, y, W, 20, 5).fill(INK);
      let x = L;
      wc.forEach((c, i) => {
        doc.font("S").fontSize(8.5).fillColor("#ffffff").text(c.title, x + pad, y + 6, { width: wws[i] - pad * 2, lineBreak: false });
        x += wws[i];
      });
      doc.y = y + 22;
    };
    if (doc.y + 110 > bottom()) doc.addPage();
    else doc.moveDown(1);
    const total = t.workMinutes ? ` · усього ${fmtDuration(t.workMinutes * 60000)}` : "";
    doc.font("B").fontSize(12).fillColor(INK).text(`Робочі дні · ${r.work.length}${total}`, L, doc.y, { width: W });
    doc.moveDown(0.35);
    wHeader();
    let prevW = "";
    r.work.forEach((w, ri) => {
      const v = workDayView(w);
      const h = 18;
      if (doc.y + h > bottom()) {
        doc.addPage();
        wHeader();
        prevW = "";
      }
      const y = doc.y;
      const first = w.user.name !== prevW;
      if (first && ri > 0) doc.rect(L, y, W, 1.5).fill("#e2ddd4");
      else if (ri % 2 === 1) doc.rect(L, y, W, h).fill(PANEL);
      const cells: Cell[] = [
        { text: first ? w.user.name : "", bold: true },
        { text: ruDate(w.day), color: INK2 },
        { text: v.place, bold: true },
        { text: v.start },
        { text: v.end ?? "не позначено", color: v.end ? INK : ORANGE, bold: !v.end },
        { text: v.duration ?? "—", color: INK2 },
      ];
      let xx = L;
      cells.forEach((c, i) => {
        doc.font(c.bold ? "S" : "R").fontSize(8.5).fillColor(c.color ?? INK).text(c.text, xx + pad, y + 4.5, { width: wws[i] - pad * 2, lineBreak: false, ellipsis: true });
        xx += wws[i];
      });
      doc.y = y + h;
      prevW = w.user.name;
    });
  }

  // ── нумерация ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // иначе pdfkit добавит пустую страницу
    const y = doc.page.height - 28;
    doc.font("R").fontSize(8).fillColor(INK3);
    doc.text(`Команда · ${ruDate(r.period.from)}–${ruDate(r.period.to)}`, L, y, { width: W / 2, lineBreak: false });
    doc.text(`стор. ${i + 1} з ${range.count}`, L + W / 2, y, { width: W / 2, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

