import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

interface ReportData {
  studentName: string;
  className: string;
  term: string;
  session: string;
  position: string;
  classCount: number;
  records: { subject: string; caScore: number; examScore: number; total: number }[];
  summary: { total: number; obtainable: number; avg: string };
  schoolName: string;
  motto: string;
  resumptionDate: string;
  comments: {
    teacher: string;
    principal: string;
    teacherSig: string;
    principalSig: string;
    daysOpen: string;
    daysPresent: string;
    daysAbsent: string;
  };
  attRate: number | null;
}

function getGradeInfo(s: number) {
  if (s >= 75) return { grade: "A1", remark: "Excellent" };
  if (s >= 70) return { grade: "B2", remark: "Very Good" };
  if (s >= 65) return { grade: "B3", remark: "Good" };
  if (s >= 60) return { grade: "C4", remark: "Credit" };
  if (s >= 55) return { grade: "C5", remark: "Credit" };
  if (s >= 50) return { grade: "C6", remark: "Credit" };
  if (s >= 45) return { grade: "D7", remark: "Pass" };
  if (s >= 40) return { grade: "E8", remark: "Pass" };
  return { grade: "F9", remark: "Fail" };
}

export function exportToPDF(data: ReportData) {
  const doc = new jsPDF("p", "mm", "a4");
  const w = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 3, "F");

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.schoolName.toUpperCase(), w / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(data.motto.toUpperCase(), w / 2, y, { align: "center" });
  y += 5;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("STUDENT REPORT SHEET", w / 2, y, { align: "center" });
  y += 3;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(15, y, w - 15, y);
  y += 7;

  // Student info
  const infoLeft = [
    ["Student:", data.studentName],
    ["Class:", data.className],
    ["Term:", data.term],
  ];
  const infoRight = [
    ["Session:", data.session],
    ["Position:", `${data.position} out of ${data.classCount}`],
    ["Average:", `${data.summary.avg}%`],
  ];

  doc.setFontSize(9);
  infoLeft.forEach(([label, val], i) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text(label, 15, y + i * 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(val, 45, y + i * 6);
  });
  infoRight.forEach(([label, val], i) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text(label, w / 2 + 10, y + i * 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(val, w / 2 + 40, y + i * 6);
  });
  y += 22;

  // Scores table
  const tableBody = data.records.map((r) => {
    const g = getGradeInfo(r.total);
    return [r.subject, String(r.caScore), String(r.examScore), String(r.total), g.grade, g.remark];
  });

  autoTable(doc, {
    startY: y,
    head: [["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"]],
    body: tableBody,
    foot: [["CUMULATIVE", "", "", `${data.summary.total}/${data.summary.obtainable}`, `${data.summary.avg}%`, "Average"]],
    styles: { fontSize: 8, cellPadding: 3, font: "helvetica" },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7 },
    footStyles: { fillColor: [15, 23, 42], textColor: [200, 200, 200], fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center", fontStyle: "bold" },
      4: { halign: "center", fontStyle: "bold" },
    },
    margin: { left: 15, right: 15 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Attendance
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(120);
  doc.text("ATTENDANCE", 15, y);
  y += 5;

  const attItems = [
    `Days Opened: ${data.comments.daysOpen || "—"}`,
    `Days Present: ${data.comments.daysPresent || "—"}`,
    `Days Absent: ${data.comments.daysAbsent || "—"}`,
    `Rate: ${data.attRate !== null ? `${data.attRate}%` : "—"}`,
  ];
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(attItems.join("    |    "), 15, y);
  y += 10;

  // Comments
  const addComment = (label: string, remark: string, sig: string) => {
    if (y > 260) { doc.addPage(); y = 15; }
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), 15, y);
    y += 5;
    doc.setFont("helvetica", "italic");
    doc.setTextColor(60);
    doc.text(remark || "No remark", 15, y, { maxWidth: w - 30 });
    y += remark ? Math.ceil(remark.length / 80) * 4 + 3 : 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Signature: ${sig || "_______________"}`, 15, y);
    y += 10;
  };

  addComment("Class Teacher's Remark", data.comments.teacher, data.comments.teacherSig);
  addComment("Principal's Remark", data.comments.principal, data.comments.principalSig);

  // Footer
  if (y > 270) { doc.addPage(); y = 15; }
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 287, w, 10, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(150);
  doc.text("NEXT TERM RESUMPTION", 15, 292);
  doc.setTextColor(255);
  doc.text(data.resumptionDate || "—", w - 15, 292, { align: "right" });

  const fileName = `${data.studentName.replace(/\s+/g, "_")}_Report_${data.term.replace(/\s+/g, "_")}.pdf`;
  doc.save(fileName);
  return fileName;
}

export async function exportToExcel(data: ReportData) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report Sheet");

  // Column widths
  ws.columns = [
    { width: 30 }, { width: 10 }, { width: 10 },
    { width: 12 }, { width: 8 },  { width: 15 },
  ];

  const addRow = (values: any[], bold = false, bgArgb?: string) => {
    const row = ws.addRow(values);
    if (bold) row.font = { bold: true };
    if (bgArgb) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    return row;
  };

  // Header section
  addRow([data.schoolName.toUpperCase()], true);
  addRow([data.motto]);
  addRow(["STUDENT REPORT SHEET"], true);
  addRow([]);
  addRow(["Student:", data.studentName, "", "Session:", data.session]);
  addRow(["Class:", data.className, "", "Position:", `${data.position} of ${data.classCount}`]);
  addRow(["Term:", data.term, "", "Average:", `${data.summary.avg}%`]);
  addRow([]);
  addRow(["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"], true, "FFE2E8F0");

  // Subject rows
  data.records.forEach((r) => {
    const g = getGradeInfo(r.total);
    addRow([r.subject, r.caScore, r.examScore, r.total, g.grade, g.remark]);
  });

  // Footer
  addRow([]);
  addRow(["CUMULATIVE TOTAL", "", "", `${data.summary.total}/${data.summary.obtainable}`, `${data.summary.avg}%`, "Average"], true);
  addRow([]);
  addRow(["ATTENDANCE"], true);
  addRow(["Days Opened", data.comments.daysOpen || "—", "Days Present", data.comments.daysPresent || "—", "Days Absent", data.comments.daysAbsent || "—"]);
  addRow(["Attendance Rate", data.attRate !== null ? `${data.attRate}%` : "—"]);
  addRow([]);
  addRow(["CLASS TEACHER'S REMARK", data.comments.teacher || "No remark"]);
  addRow(["Signature", data.comments.teacherSig || ""]);
  addRow(["PRINCIPAL'S REMARK", data.comments.principal || "No remark"]);
  addRow(["Signature", data.comments.principalSig || ""]);
  addRow([]);
  addRow(["Next Term Resumption:", data.resumptionDate || "—"]);

  const fileName = `${data.studentName.replace(/\s+/g, "_")}_Report_${data.term.replace(/\s+/g, "_")}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}
