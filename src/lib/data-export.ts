import ExcelJS from "exceljs";
import { exportToPDF } from "./report-export";
import { getOrdinal } from "./school-helpers";

// ─── Shared helper: trigger browser file download from a buffer ──
async function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Attendance Export ────────────────────────────────────────
export function exportAttendanceCSV(attendance: any[], fileName = "attendance_export.csv") {
  if (!attendance.length) return;
  const rows = [["Student", "Class", "Date", "Status", "Note"]];
  attendance.forEach((a) => rows.push([a.studentName, a.studentClass, a.date, a.status, a.note || ""]));
  const csv = rows.map((r) => r.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(csv, fileName, "text/csv;charset=utf-8");
}

export async function exportAttendanceExcel(attendance: any[], fileName = "attendance_export.xlsx") {
  if (!attendance.length) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");

  ws.columns = [
    { header: "Student",  key: "Student",  width: 25 },
    { header: "Class",    key: "Class",    width: 15 },
    { header: "Date",     key: "Date",     width: 12 },
    { header: "Status",   key: "Status",   width: 10 },
    { header: "Note",     key: "Note",     width: 30 },
  ];

  // Bold header row
  ws.getRow(1).font = { bold: true };

  attendance.forEach((a) =>
    ws.addRow({ Student: a.studentName, Class: a.studentClass, Date: a.date, Status: a.status, Note: a.note || "" })
  );

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, fileName);
}

// ─── Bulk Class Results Export ────────────────────────────────
export async function exportClassResultsExcel(
  entries: any[], className: string, term: string, session: string, schoolName: string, fileName?: string
) {
  const classEntries = entries.filter((e) => e.studentClass === className && e.term === term && e.session === session);
  if (!classEntries.length) return null;

  const students = [...new Set(classEntries.map((e) => e.studentName))];
  const subjects = [...new Set(classEntries.map((e) => e.subject))];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(className.slice(0, 31)); // Excel tab name max 31 chars

  // Title rows
  ws.addRow([schoolName.toUpperCase()]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.addRow([`${className} — ${term} — ${session}`]);
  ws.addRow([]); // spacer

  // Header row
  const headerRow = ws.addRow([
    "S/N", "Student Name",
    ...subjects.flatMap((s) => [s + " (CA)", s + " (Exam)", s + " (Total)"]),
    "Grand Total", "Average", "Position",
  ]);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  const standings = students.map((name) => {
    const recs = classEntries.filter((e) => e.studentName === name);
    return { name, total: recs.reduce((s, e) => s + e.total, 0) };
  }).sort((a, b) => b.total - a.total);

  const rows = students.map((name) => {
    const recs = classEntries.filter((e) => e.studentName === name);
    const subjectCols = subjects.flatMap((subj) => {
      const r = recs.find((e) => e.subject === subj);
      return r ? [r.caScore ?? (r as any).ca1, r.examScore ?? r.exam, r.total] : ["", "", ""];
    });
    const grandTotal = recs.reduce((s, e) => s + e.total, 0);
    const avg = recs.length ? (grandTotal / recs.length).toFixed(1) : "0";
    const pos = standings.findIndex((s) => s.name === name) + 1;
    return [pos, name, ...subjectCols, grandTotal, avg, getOrdinal(pos)];
  }).sort((a, b) => (a[0] as number) - (b[0] as number));

  rows.forEach((row) => ws.addRow(row));

  // Column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 25;
  let col = 3;
  subjects.forEach(() => { ws.getColumn(col).width = 8; ws.getColumn(col+1).width = 8; ws.getColumn(col+2).width = 8; col += 3; });
  ws.getColumn(col).width = 10; ws.getColumn(col+1).width = 8; ws.getColumn(col+2).width = 8;

  const fn = fileName || `${className.replace(/\s+/g, "_")}_Results_${term.replace(/\s+/g, "_")}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, fn);
  return fn;
}

// ─── Bulk All Students PDF Export ─────────────────────────────
export function exportBulkPDFs(
  entries: any[], className: string, term: string, session: string,
  schoolSettings: any, comments: Record<string, any>, attendance: any[]
) {
  const classEntries = entries.filter((e) => e.studentClass === className && e.term === term && e.session === session);
  if (!classEntries.length) return 0;

  const studentNames = [...new Set(classEntries.map((e) => e.studentName))];
  const standings = studentNames.map((name) => {
    const recs = classEntries.filter((e) => e.studentName === name);
    return { name, total: recs.reduce((s, e) => s + e.total, 0) };
  }).sort((a, b) => b.total - a.total);

  let exported = 0;
  studentNames.forEach((name) => {
    const records = classEntries.filter((e) => e.studentName === name);
    const pos = standings.findIndex((s) => s.name === name) + 1;
    const total = records.reduce((s, e) => s + e.total, 0);
    const id = `${name}||${className}`;
    const curC = comments[id] || {};
    const daysOpen = parseInt(curC.daysOpen) || 0;
    const daysPresent = parseInt(curC.daysPresent) || 0;
    const attRate = daysOpen > 0 ? Math.round((daysPresent / daysOpen) * 100) : null;

    exportToPDF({
      studentName: name, className, term, session,
      position: getOrdinal(pos), classCount: studentNames.length,
      records: records.map((r) => ({ subject: r.subject, caScore: r.caScore ?? r.ca1, examScore: r.examScore ?? r.exam, total: r.total })),
      summary: { total, obtainable: records.length * 100, avg: records.length ? (total / records.length).toFixed(1) : "0" },
      schoolName: schoolSettings.name, motto: schoolSettings.motto, resumptionDate: schoolSettings.resumptionDate,
      comments: { teacher: curC.teacher || "", principal: curC.principal || "", teacherSig: curC.teacherSig || "", principalSig: curC.principalSig || "", daysOpen: curC.daysOpen || "", daysPresent: curC.daysPresent || "", daysAbsent: curC.daysAbsent || "" },
      attRate,
    });
    exported++;
  });
  return exported;
}

// ─── Full Backup Export ───────────────────────────────────────
export function exportBackup(state: any) {
  const data = {
    _type: "schoolapp_backup",
    _version: 1,
    _exportedAt: new Date().toISOString(),
    entries: state.entries,
    bin: state.bin,
    logs: state.logs,
    comments: state.comments,
    attendance: state.attendance,
    classRolls: state.classRolls,
    staffList: state.staffList,
    schoolSettings: state.schoolSettings,
    adminPin: state.adminPin,
  };
  const json = JSON.stringify(data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(json, `SchoolApp_Backup_${date}.json`, "application/json");
}

// ─── Helpers ──────────────────────────────────────────────────
function downloadBlob(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
