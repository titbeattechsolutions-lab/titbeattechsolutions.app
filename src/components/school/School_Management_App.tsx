import { useState, useMemo, useRef, useCallback, memo, useReducer, createContext, useContext, useEffect } from "react";
import {
  GraduationCap, Database, FileText, Printer, PlusCircle,
  Check, X, Settings, Save, LogOut, LayoutDashboard,
  Trash2, Search, PenTool, Upload, RotateCcw,
  AlertTriangle, Clock, ShieldAlert, Users, UserPlus,
  UserX, UserCheck, Eye, EyeOff, KeyRound, Shield,
  Menu, BookOpen, MoreVertical, ChevronRight, ChevronLeft,
  CalendarDays, ClipboardList, BookMarked, Edit2, ArrowLeft
} from "lucide-react";

// ─── Upgrade Imports (CDN-based, no bundler needed) ──────────────────────────
// Firebase, jsPDF and SheetJS are loaded dynamically at runtime to keep this
// file self-contained. We declare the globals here for TypeScript.
declare const jspdf: any;
declare const XLSX: any;
declare const firebase: any;

// ─── Static Data ──────────────────────────────────────────────────────────────
const CURRICULUM: Record<string, { classes: string[]; subjects: string[] }> = {
  "Early Years":      { classes:["Creche","Pre-Nursery","Nursery 1","Nursery 2"], subjects:["Numeracy","Literacy","Health Habits","Social Norms","Basic Science","CRS","IRS","Rhymes & Poem","Phonics","Creative Arts","Physical Development"] },
  "Lower Primary":    { classes:["Primary 1","Primary 2","Primary 3"],           subjects:["Mathematics","English Studies","Basic Science & Tech","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","Yoruba/Igbo/Hausa"] },
  "Upper Primary":    { classes:["Primary 4","Primary 5","Primary 6"],           subjects:["Mathematics","English Studies","Basic Science","ICT","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","French","Yoruba/Igbo/Hausa"] },
  "Junior Secondary": { classes:["JSS 1","JSS 2","JSS 3"],                       subjects:["Mathematics","English Language","Basic Science","Basic Technology","Social Studies","Civic Education","Agricultural Science","Home Economics","Business Studies","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","French","Nigerian Language"] },
  "Senior Secondary": { classes:["SS 1","SS 2","SS 3"],                          subjects:["Mathematics","English Language","Civic Education","Biology","Economics","Physics","Chemistry","Further Mathematics","Agricultural Science","Geography","Government","Literature-in-English","CRS","IRS","Financial Accounting","Commerce","Data Processing","Marketing","Technical Drawing"] },
};
const ALL_CLASSES: string[] = Object.values(CURRICULUM).flatMap(c => c.classes);
const TERMS = ["First Term","Second Term","Third Term"];
const ROLES = ["Teacher","Class Teacher","Subject Teacher","Head of Dept","Vice Principal","Principal"];
const DEFAULT_PIN = "1234";
const PERMS_META = [
  { key:"scoreEntry",    label:"Score Entry",    desc:"Enter CA & exam scores" },
  { key:"viewReports",   label:"View Reports",   desc:"Access student reports" },
  { key:"printReports",  label:"Print Reports",  desc:"Print or export reports" },
  { key:"manageRecords", label:"Manage Records", desc:"Delete or edit grades" },
];
const ATT_STATUSES = [
  { key:"present", label:"Present", icon:"✓", color:"emerald" },
  { key:"absent",  label:"Absent",  icon:"✗", color:"red" },
  { key:"late",    label:"Late",    icon:"⏱", color:"amber" },
  { key:"excused", label:"Excused", icon:"📋", color:"indigo" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RollStudent {
  id: string;
  name: string;
  admNo: string;
  suggested?: boolean;
}
interface Entry {
  id: string;
  studentName: string;
  studentClass: string;
  subject: string;
  caScore: number;
  examScore: number;
  total: number;
  createdAt: string;
  restoredAt?: string;
  term?: string;
  session?: string;
  enteredBy?: string;
}
interface BinEntry extends Entry {
  deletedAt: string;
}
interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin: string;
  status: "active" | "restricted" | "revoked";
  assignedClasses: string[];
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}
interface AttendanceRecord {
  id: string;
  studentName: string;
  studentClass: string;
  date: string;
  status: string;
  note: string;
  createdAt: string;
}
interface ReportTemplateConfig {
  uploadedFile: string | null;       // base64 data URL of uploaded PDF/DOCX
  uploadedFileName: string | null;
  headerColor: string;               // hex color for header/footer
  accentColor: string;               // hex color for accent bar
  fontFamily: string;                // "Georgia" | "Helvetica" | "Times"
  showLogo: boolean;
  showMotto: boolean;
  showAttendance: boolean;
  showTeacherRemark: boolean;
  showPrincipalRemark: boolean;
  showResumptionDate: boolean;
  showPosition: boolean;
  showGrade: boolean;
  showStamp: boolean;
  tableStyle: "grid" | "striped" | "minimal";
}
interface SchoolSettings {
  name: string;
  motto: string;
  session: string;
  term: string;
  resumptionDate: string;
  reportTemplate?: ReportTemplateConfig;
}
interface AppState {
  entries: Entry[];
  bin: BinEntry[];
  logs: any[];
  comments: Record<string, Record<string, string>>;
  attendance: AttendanceRecord[];
  classRolls: Record<string, RollStudent[]>;
  staffList: StaffMember[];
  schoolSettings: SchoolSettings;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);
const timeGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
};

// ─── UPGRADE 1: PIN Security (SHA-256 via Web Crypto API) ────────────────────
// Strategy: Store SHA-256 hashes. Always accept plain-text PINs during login
// and hash them on first successful match (transparent migration). This means
// the app works immediately on fresh install AND after upgrade from any previous
// version — no manual reset ever needed.

async function hashPIN(pin: string): Promise<string> {
  if (!pin) return "";
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode("gm_v1_" + pin));
    return "h:" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // SubtleCrypto unavailable (HTTP context, old WebView, etc.) — use plain prefix
    return "p:" + pin;
  }
}

// Returns true if `attempt` matches `stored`.
// `stored` can be:
//   "h:<64 hex chars>"  — SHA-256 hash (new format)
//   "p:<pin>"           — plain with prefix (fallback format)
//   "<pin>"             — raw plain text (old format / fresh install)
async function verifyPIN(attempt: string, stored: string): Promise<boolean> {
  if (!attempt || !stored) return false;

  // 1. Raw plain-text match (covers DEFAULT_PIN "1234", old localStorage data)
  if (!stored.startsWith("h:") && !stored.startsWith("p:")) {
    return attempt === stored;
  }

  // 2. Plain-prefixed match (SubtleCrypto unavailable environment)
  if (stored.startsWith("p:")) {
    return attempt === stored.slice(2);
  }

  // 3. Hash match
  const hashed = await hashPIN(attempt);
  return hashed === stored;
}

// Hash only if not already hashed
async function ensureHashed(pin: string): Promise<string> {
  if (pin.startsWith("h:") || pin.startsWith("p:")) return pin;
  return hashPIN(pin);
}

// ─── UPGRADE 2: Firebase Cloud Integration ───────────────────────────────────
// Config is stored in one place. To activate, replace the placeholder values
// with your real Firebase project credentials from the Firebase Console.
// The app works fully offline (localStorage fallback) when Firebase is not
// configured or when the device is offline.

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const FIREBASE_ENABLED = !FIREBASE_CONFIG.apiKey.startsWith("YOUR_");
const FIREBASE_PATH    = "/greatmind_school/v1";

// Dynamically load Firebase SDK
async function loadFirebase(): Promise<boolean> {
  if (!FIREBASE_ENABLED) return false;
  if (typeof firebase !== "undefined" && firebase.database) return true;
  try {
    await Promise.all([
      loadScript("https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"),
      loadScript("https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js"),
    ]);
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return true;
  } catch { return false; }
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function pushToFirebase(state: AppState): Promise<void> {
  const ok = await loadFirebase();
  if (!ok) return;
  try {
    await firebase.database().ref(FIREBASE_PATH).set({
      ...state,
      _updatedAt: new Date().toISOString(),
      _deviceId: getDeviceId(),
    });
  } catch (e) {
    console.warn("[Firebase] Push failed:", e);
  }
}

async function fetchFromFirebase(): Promise<Partial<AppState> | null> {
  const ok = await loadFirebase();
  if (!ok) return null;
  try {
    const snap = await firebase.database().ref(FIREBASE_PATH).once("value");
    return snap.val() as Partial<AppState> | null;
  } catch { return null; }
}

function subscribeFirebase(cb: (data: Partial<AppState>) => void): (() => void) {
  if (!FIREBASE_ENABLED) return () => {};
  let unsub = () => {};
  loadFirebase().then(ok => {
    if (!ok) return;
    const ref = firebase.database().ref(FIREBASE_PATH);
    const handler = (snap: any) => { if (snap.val()) cb(snap.val()); };
    ref.on("value", handler);
    unsub = () => ref.off("value", handler);
  });
  return () => unsub();
}

// Device fingerprint so we can show which device last synced
function getDeviceId(): string {
  let id = localStorage.getItem("gm_device_id");
  if (!id) { id = "dev_" + uid(); localStorage.setItem("gm_device_id", id); }
  return id;
}

// ─── Persistent Database (localStorage) ──────────────────────────────────────
const DB_KEY = "greatmind_school_db_v2";

function loadDB(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AppState>;
  } catch { return {}; }
}

function saveDB(state: AppState) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveDB(state: AppState, pushCloud = true) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveDB(state);
    if (pushCloud) pushToFirebase(state).catch(() => {});
  }, 600);
}

// ─── UPGRADE 3a: Export to PDF ───────────────────────────────────────────────
// Uses jsPDF (autoTable plugin) loaded from CDN. Falls back to browser print.

async function loadJsPDF(): Promise<boolean> {
  if (typeof jspdf !== "undefined") return true;
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    return true;
  } catch { return false; }
}

async function exportReportToPDF(report: any, curC: any, attRate: number | null, schoolSettings: any, logoDataUrl: string | null): Promise<void> {
  const ok = await loadJsPDF();
  if (!ok) { window.print(); return; }

  const tpl: ReportTemplateConfig = schoolSettings.reportTemplate || {
    headerColor: "#0f172a", accentColor: "#2563eb", fontFamily: "Helvetica",
    showLogo: true, showMotto: true, showAttendance: true, showTeacherRemark: true,
    showPrincipalRemark: true, showResumptionDate: true, showPosition: true,
    showGrade: true, showStamp: true, tableStyle: "striped",
    uploadedFile: null, uploadedFileName: null,
  };

  const hexToRGB = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] as [number,number,number];
  };
  const hdrRGB = hexToRGB(tpl.headerColor);
  const accRGB = hexToRGB(tpl.accentColor);

  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 14;

  // ── Header ──
  doc.setFillColor(...hdrRGB); doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(schoolSettings.name.toUpperCase(), margin, 12);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  if (tpl.showMotto) doc.text(schoolSettings.motto, margin, 18);
  doc.setFontSize(7);
  doc.text(`${schoolSettings.session} · ${schoolSettings.term}`, W - margin, 12, { align: "right" });
  doc.text("ACADEMIC REPORT SHEET", W - margin, 18, { align: "right" });

  // ── Accent bar ──
  doc.setFillColor(...accRGB); doc.rect(0, 28, W, 2, "F");

  // ── Student info band ──
  doc.setFillColor(248, 250, 252); doc.rect(0, 30, W, 14, "F");
  doc.setTextColor(71, 85, 105); doc.setFontSize(7); doc.setFont("helvetica", "bold");
  const infoY = 36;
  const infoLabels = ["STUDENT", "CLASS"];
  const infoVals = [report.name, report.class];
  if (tpl.showPosition) { infoLabels.push("POSITION", "IN CLASS"); infoVals.push(report.position, String(report.classCount)); }
  const colW = (W - margin * 2) / infoLabels.length;
  infoLabels.forEach((h, i) => doc.text(h, margin + i * colW, infoY - 2));
  doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  infoVals.forEach((v, i) => doc.text(v, margin + i * colW, infoY + 4));

  // ── Scores table ──
  const tableHead = tpl.showGrade
    ? [["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"]]
    : [["Subject", "CA /40", "Exam /60", "Total /100"]];
  const tableData = report.records.map((r: any) => {
    const g = getGrade(r.total);
    return tpl.showGrade
      ? [r.subject.toUpperCase(), r.caScore, r.examScore, r.total, g.grade, g.remark]
      : [r.subject.toUpperCase(), r.caScore, r.examScore, r.total];
  });
  const footRow = tpl.showGrade
    ? ["CUMULATIVE TOTAL", "", "", report.summary.total, `${report.summary.avg}%`, "Average"]
    : ["CUMULATIVE TOTAL", "", "", report.summary.total];
  tableData.push(footRow);

  (doc as any).autoTable({
    startY: 47,
    head: tableHead,
    body: tableData,
    theme: tpl.tableStyle === "grid" ? "grid" : tpl.tableStyle === "minimal" ? "plain" : "grid",
    headStyles: { fillColor: hdrRGB, textColor: 255, fontSize: 7, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", fontSize: 8 },
      1: { halign: "center", fontSize: 8 },
      2: { halign: "center", fontSize: 8 },
      3: { halign: "center", fontStyle: "bold", fontSize: 9 },
      ...(tpl.showGrade ? { 4: { halign: "center", fontStyle: "bold", fontSize: 8 }, 5: { halign: "left", fontStyle: "italic", fontSize: 7, textColor: [100, 116, 139] } } : {}),
    },
    alternateRowStyles: tpl.tableStyle === "striped" ? { fillColor: [248, 250, 252] } : {},
    margin: { left: margin, right: margin },
    foot: [],
    didParseCell: (data: any) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = hdrRGB;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 8;

  // ── Attendance ──
  if (tpl.showAttendance) {
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 116, 139);
    doc.text("ATTENDANCE", margin, y); y += 4;
    const attCols = [
      ["Days Opened",  curC.daysOpen  || "—"],
      ["Days Present", curC.daysPresent || "—"],
      ["Days Absent",  curC.daysAbsent  || "—"],
      ["Rate",         attRate !== null ? `${attRate}%` : "—"],
    ];
    const attW = (W - margin * 2) / 4;
    attCols.forEach(([label, val], i) => {
      const x = margin + i * attW;
      doc.setFillColor(241, 245, 249);
      doc.rect(x, y, attW - 1, 12, "F");
      doc.setTextColor(100, 116, 139); doc.setFontSize(6); doc.setFont("helvetica", "bold");
      doc.text(label.toUpperCase(), x + 2, y + 4);
      doc.setTextColor(15, 23, 42); doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(String(val), x + 2, y + 10);
    });
    y += 16;
  }

  // ── Remarks ──
  const remarks: [string, string, string][] = [];
  if (tpl.showTeacherRemark) remarks.push(["Class Teacher's Remark", curC.teacher, curC.teacherSig]);
  if (tpl.showPrincipalRemark) remarks.push(["Principal's Remark", curC.principal, curC.principalSig]);
  if (remarks.length > 0) {
    const remW = remarks.length === 2 ? (W - margin * 2 - 4) / 2 : W - margin * 2;
    remarks.forEach(([title, remark, sig], i) => {
      const x = margin + i * (remW + 4);
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
      doc.rect(x, y, remW, 28);
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(148, 163, 184);
      doc.text(title.toUpperCase(), x + 3, y + 5);
      doc.setFontSize(8); doc.setFont("helvetica", "normalitalic"); doc.setTextColor(71, 85, 105);
      const wrapped = doc.splitTextToSize(remark || "No remark entered.", remW - 6);
      doc.text(wrapped.slice(0, 2), x + 3, y + 11);
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...accRGB);
      doc.text(sig || "_______________________", x + 3, y + 24);
    });
    y += 32;
  }

  // ── Footer ──
  if (tpl.showResumptionDate) {
    doc.setFillColor(...hdrRGB); doc.rect(0, y, W, 10, "F");
    doc.setTextColor(148, 163, 184); doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("NEXT TERM RESUMPTION", margin, y + 6);
    doc.setTextColor(255, 255, 255); doc.setFontSize(8);
    doc.text(schoolSettings.resumptionDate.toUpperCase(), W - margin, y + 6, { align: "right" });
    doc.setFillColor(...accRGB); doc.rect(0, y + 10, W, 1.5, "F");
  }

  doc.save(`${report.name.replace(/\s+/g, "_")}_Report_${schoolSettings.term.replace(/\s+/g, "_")}.pdf`);
}
// ─── UPGRADE 3b: Export to Excel ─────────────────────────────────────────────
// Generates a full end-of-term Excel workbook with per-student sheets + summary.

async function loadSheetJS(): Promise<boolean> {
  if (typeof XLSX !== "undefined") return true;
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    return true;
  } catch { return false; }
}

async function exportClassToExcel(
  className: string,
  session: string,
  term: string,
  entries: Entry[],
  attendance: AttendanceRecord[],
): Promise<void> {
  const ok = await loadSheetJS();
  if (!ok) return;

  const wb = XLSX.utils.book_new();

  // Gather all students in this class
  const students = [...new Set(entries.filter(e => e.studentClass === className).map(e => e.studentName))].sort();
  const subjects = [...new Set(entries.filter(e => e.studentClass === className).map(e => e.subject))].sort();

  // ── Summary sheet ──
  const summaryData: any[][] = [
    [`${className} — ${session} ${term}`],
    [""],
    ["Student", ...subjects, "Total", "Average", "Grade"],
  ];

  const studentTotals: { name: string; total: number; avg: number }[] = [];
  students.forEach(student => {
    const sEntries = entries.filter(e => e.studentClass === className && e.studentName === student);
    const row: any[] = [student];
    let totalScore = 0;
    subjects.forEach(subj => {
      const e = sEntries.find(x => x.subject === subj);
      row.push(e ? e.total : "—");
      if (e) totalScore += e.total;
    });
    const avg = sEntries.length ? totalScore / sEntries.length : 0;
    row.push(totalScore, avg.toFixed(1), getGrade(avg).grade);
    summaryData.push(row);
    studentTotals.push({ name: student, total: totalScore, avg });
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 28 }, ...subjects.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 10 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Class Summary");

  // ── Per-student detailed sheets (max 20 to keep Excel manageable) ──
  students.slice(0, 20).forEach(student => {
    const sEntries = entries.filter(e => e.studentClass === className && e.studentName === student);
    const sAtt = attendance.filter(a => a.studentClass === className && a.studentName === student);
    const sheetData: any[][] = [
      [`Report — ${student}`],
      [`Class: ${className}   Session: ${session}   Term: ${term}`],
      [""],
      ["Subject", "CA Score", "Exam Score", "Total", "Grade", "Remark"],
      ...sEntries.map(e => {
        const g = getGrade(e.total);
        return [e.subject, e.caScore, e.examScore, e.total, g.grade, g.remark];
      }),
      [""],
      ["Attendance Summary"],
      ["Present", sAtt.filter(a => a.status === "present").length],
      ["Absent",  sAtt.filter(a => a.status === "absent").length],
      ["Late",    sAtt.filter(a => a.status === "late").length],
      ["Excused", sAtt.filter(a => a.status === "excused").length],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
    // Safe sheet name: max 31 chars, no special chars
    const sheetName = student.slice(0, 28).replace(/[:\\/?*[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ── Attendance log sheet ──
  const attData: any[][] = [
    ["Attendance Log — " + className],
    ["Student", "Date", "Status", "Note"],
    ...attendance
      .filter(a => a.studentClass === className)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(a => [a.studentName, a.date, a.status, a.note || ""]),
  ];
  const attSheet = XLSX.utils.aoa_to_sheet(attData);
  attSheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, attSheet, "Attendance Log");

  XLSX.writeFile(wb, `${className.replace(/\s+/g, "_")}_${term.replace(/\s+/g, "_")}_Report.xlsx`);
}

// Single student PDF helper (called from report page)
async function exportSingleStudentExcel(report: any, curC: any, attRate: number | null, schoolSettings: any): Promise<void> {
  const ok = await loadSheetJS();
  if (!ok) return;
  const wb = XLSX.utils.book_new();
  const g = getGrade(parseFloat(report.summary.avg));
  const sheetData: any[][] = [
    [schoolSettings.name],
    [`${schoolSettings.session} — ${schoolSettings.term}`],
    [""],
    [`Student: ${report.name}`, `Class: ${report.class}`, `Position: ${report.position}`],
    [""],
    ["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"],
    ...report.records.map((r: any) => {
      const gr = getGrade(r.total);
      return [r.subject, r.caScore, r.examScore, r.total, gr.grade, gr.remark];
    }),
    [""],
    ["CUMULATIVE TOTAL", "", "", report.summary.total, `${report.summary.avg}%`, g.remark],
    [""],
    ["Attendance"],
    ["Days Opened",  curC.daysOpen  || "—"],
    ["Days Present", curC.daysPresent || "—"],
    ["Days Absent",  curC.daysAbsent  || "—"],
    ["Attendance Rate", attRate !== null ? `${attRate}%` : "—"],
    [""],
    ["Class Teacher's Remark", curC.teacher || ""],
    ["Principal's Remark",     curC.principal || ""],
    ["Next Resumption",        schoolSettings.resumptionDate],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${report.name.replace(/\s+/g, "_")}_${schoolSettings.term.replace(/\s+/g, "_")}.xlsx`);
}

// ─── UPGRADE 4: CSV Import for Class Rolls ────────────────────────────────────
// Accepts CSV files with flexible column detection.
// Supported formats:
//   - Single column:  Name
//   - Two columns:    Name, AdmNo  (or AdmNo, Name — auto-detected)
//   - With header row (auto-skipped if first cell looks like a header keyword)

function parseCSVRoll(csvText: string): { name: string; admNo: string }[] {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  // Detect and skip header row
  const headerKeywords = /^(name|student|full.?name|pupil|admno|admission|sn|s\/n|#|no\.?|sl\.?)/i;
  const dataLines = headerKeywords.test(lines[0]) ? lines.slice(1) : lines;

  return dataLines
    .map(line => {
      // Handle comma and tab delimiters
      const parts = line.includes("\t")
        ? line.split("\t").map(p => p.trim().replace(/^["']|["']$/g, ""))
        : line.split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));

      if (parts.length === 1) {
        return { name: parts[0], admNo: "" };
      }

      // Determine which column is the name vs admission number
      // Admission numbers typically contain digits; names are mostly alphabetic
      const looksLikeAdmNo = (s: string) => /^\d/.test(s) || /^[A-Z]{1,4}\/\d+/i.test(s) || /^\d{2,}/.test(s);

      if (looksLikeAdmNo(parts[0]) && !looksLikeAdmNo(parts[1])) {
        return { name: parts[1], admNo: parts[0] };
      }
      return { name: parts[0], admNo: parts[1] || "" };
    })
    .filter(s => s.name.length >= 2); // Skip empty/garbage rows
}

const getGrade = (s: number) => {
  if (s >= 75) return { grade:"A1", remark:"Excellent",  color:"#059669", bg:"#d1fae5" };
  if (s >= 70) return { grade:"B2", remark:"Very Good",  color:"#10b981", bg:"#d1fae5" };
  if (s >= 65) return { grade:"B3", remark:"Good",       color:"#2563eb", bg:"#dbeafe" };
  if (s >= 60) return { grade:"C4", remark:"Credit",     color:"#3b82f6", bg:"#dbeafe" };
  if (s >= 55) return { grade:"C5", remark:"Credit",     color:"#6366f1", bg:"#e0e7ff" };
  if (s >= 50) return { grade:"C6", remark:"Credit",     color:"#8b5cf6", bg:"#ede9fe" };
  if (s >= 45) return { grade:"D7", remark:"Pass",       color:"#d97706", bg:"#fef3c7" };
  if (s >= 40) return { grade:"E8", remark:"Pass",       color:"#f59e0b", bg:"#fef3c7" };
  return           { grade:"F9", remark:"Fail",       color:"#dc2626", bg:"#fee2e2" };
};

const getOrdinal = (n: number) => {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const fmtTs = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }),
  };
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });

// ─── State / Reducer ──────────────────────────────────────────────────────────
const _saved = loadDB();

// Default staff — plain PINs, automatically migrated to hashed on first login
const _defaultStaff: StaffMember[] = [
  { id:"s1", name:"Mrs. Amaka Obi",  role:"Class Teacher",   pin:"5678", status:"active", assignedClasses:["Primary 3","Primary 4"], permissions:{scoreEntry:true,viewReports:true,printReports:true,manageRecords:false},  createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  { id:"s2", name:"Mr. Chidi Eze",   role:"Subject Teacher", pin:"9012", status:"active", assignedClasses:["JSS 1","JSS 2","JSS 3"],  permissions:{scoreEntry:true,viewReports:true,printReports:false,manageRecords:false}, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
];

const initialState: AppState = {
  entries:        _saved.entries        ?? [],
  bin:            _saved.bin            ?? [],
  logs:           _saved.logs           ?? [],
  comments:       _saved.comments       ?? {},
  attendance:     _saved.attendance     ?? [],
  classRolls:     _saved.classRolls     ?? {},
  staffList:      _saved.staffList      ?? _defaultStaff,
  schoolSettings: _saved.schoolSettings ?? { name:"Greatmind Academy", motto:"Excellence in every child", session:"2024/2025", term:"First Term", resumptionDate:"January 8th, 2025" },
};

function mkLog(action: string, student: string, subject: string, detail = "", actor = "") {
  return { id:uid(), action, student, subject, detail, ts:new Date().toISOString(), actor };
}

function appReducer(state: AppState, action: any): AppState {
  switch (action.type) {
    case "ADD_ENTRY":
      return {
        ...state,
        entries: [...state.entries, action.payload],
        logs: [mkLog("Added", action.payload.studentName, action.payload.subject, `Total: ${action.payload.total}`, action.payload.enteredBy || ""), ...state.logs].slice(0, 200),
      };
    case "DELETE_ENTRY": {
      const e = state.entries.find(x => x.id === action.id);
      if (!e) return state;
      return {
        ...state,
        entries: state.entries.filter(x => x.id !== action.id),
        bin: [{ ...e, deletedAt: new Date().toISOString() }, ...state.bin],
        logs: [mkLog("Deleted", e.studentName, e.subject, `Score: ${e.total}`), ...state.logs].slice(0, 100),
      };
    }
    case "RESTORE_ENTRY": {
      const e = state.bin.find(x => x.id === action.id);
      if (!e) return state;
      const { deletedAt, ...r } = e;
      return {
        ...state,
        bin: state.bin.filter(x => x.id !== action.id),
        entries: [...state.entries, { ...r, restoredAt: new Date().toISOString() }],
        logs: [mkLog("Restored", e.studentName, e.subject), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_STAFF": {
      const exists = state.staffList.find(s => s.id === action.payload.id);
      return {
        ...state,
        staffList: exists
          ? state.staffList.map(s => s.id === action.payload.id ? action.payload : s)
          : [...state.staffList, action.payload],
        logs: [mkLog(exists ? "Updated" : "Staff Added", action.payload.name, action.payload.role), ...state.logs].slice(0, 100),
      };
    }
    case "SET_STAFF_STATUS": {
      const s = state.staffList.find(x => x.id === action.id);
      if (!s) return state;
      return {
        ...state,
        staffList: state.staffList.map(x => x.id === action.id ? { ...x, status: action.status, updatedAt: new Date().toISOString() } : x),
        logs: [mkLog(action.status === "revoked" ? "Revoked" : "Restored", s.name, s.role), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_ATTENDANCE": {
      const idx = state.attendance.findIndex(a => a.id === action.payload.id);
      return {
        ...state,
        attendance: idx >= 0
          ? state.attendance.map((a, i) => i === idx ? action.payload : a)
          : [...state.attendance, action.payload],
      };
    }
    case "BULK_SAVE_ATTENDANCE": {
      const cls = action.payload[0]?.studentClass || "";
      const date = action.payload[0]?.date || "";
      return {
        ...state,
        attendance: [
          ...state.attendance.filter(a => !action.payload.find((p: AttendanceRecord) =>
            p.studentName === a.studentName && p.studentClass === a.studentClass && p.date === a.date
          )),
          ...action.payload,
        ],
        logs: [mkLog("Attendance Saved", `${action.payload.length} student(s)`, cls, `Date: ${date}`, action.actor || ""), ...state.logs].slice(0, 200),
      };
    }
    case "DELETE_ATTENDANCE": {
      const a = state.attendance.find(x => x.id === action.id);
      return {
        ...state,
        attendance: state.attendance.filter(x => x.id !== action.id),
        logs: a ? [mkLog("Attendance Deleted", a.studentName, a.studentClass, `Date: ${a.date}`, action.actor || ""), ...state.logs].slice(0, 200) : state.logs,
      };
    }
    case "SAVE_CLASS_ROLL":
      // Strip 'suggested' flag when saving permanently
      return {
        ...state,
        classRolls: {
          ...state.classRolls,
          [action.className]: (action.students as RollStudent[]).map(({ suggested: _s, ...rest }) => rest),
        },
        logs: [mkLog("Class Roll Saved", `${action.students.length} student(s)`, action.className, "", action.actor || ""), ...state.logs].slice(0, 200),
      };
    case "DELETE_ROLL_STUDENT": {
      const roll = state.classRolls[action.className] || [];
      return {
        ...state,
        classRolls: {
          ...state.classRolls,
          [action.className]: roll.filter(s => s.id !== action.studentId),
        },
      };
    }
    case "SET_COMMENT":
      return {
        ...state,
        comments: {
          ...state.comments,
          [action.studentId]: {
            ...(state.comments[action.studentId] || {}),
            [action.field]: action.value,
          },
        },
      };
    case "SET_SCHOOL_SETTINGS":
      return { ...state, schoolSettings: { ...state.schoolSettings, ...action.payload } };
    case "__HYDRATE__":
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AppCtxType {
  state: AppState;
  dispatch: React.Dispatch<any>;
  showToast: (msg: string, type?: string) => void;
  currentActor: string;
}
const AppCtx = createContext<AppCtxType | null>(null);
const useApp = () => useContext(AppCtx)!;

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: string; id: string } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, type = "success") => {
    if (t.current) clearTimeout(t.current);
    setToast({ msg, type, id: uid() });
    t.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return { toast, showToast: show };
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const colorMap: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  blue:  "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red:   "bg-red-100 text-red-700",
  indigo:"bg-indigo-100 text-indigo-700",
  emerald:"bg-emerald-100 text-emerald-700",
};

const Pill = ({ children, color = "slate" }: { children: React.ReactNode; color?: string }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-black uppercase ${colorMap[color] || colorMap.slate}`}>
    {children}
  </span>
);

const StatusPill = ({ status }: { status: string }) => {
  const m: Record<string, { l: string; c: string }> = {
    active:     { l:"Active",     c:"green" },
    restricted: { l:"Restricted", c:"amber" },
    revoked:    { l:"Revoked",    c:"red" },
  };
  const s = m[status] || m.active;
  return <Pill color={s.c}>{s.l}</Pill>;
};

const SchoolLogo = ({ logoUrl, size = "md", className = "" }: { logoUrl: string | null; size?: string; className?: string }) => {
  const sz: Record<string, string> = { lg:"w-16 h-16", sm:"w-8 h-8", xs:"w-6 h-6", md:"w-10 h-10" };
  const ic: Record<string, number> = { lg:32, sm:18, xs:14, md:22 };
  if (logoUrl) return (
    <img src={logoUrl} alt="Logo" className={`${sz[size] || sz.md} rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0 ${className}`} />
  );
  return (
    <div className={`${sz[size] || sz.md} bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${className}`}>
      <GraduationCap size={ic[size] || 22} />
    </div>
  );
};

const Field = ({ label, error, children }: { label?: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label>}
    {children}
    {error && <p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={11} />{error}</p>}
  </div>
);

const Inp = ({ label, error, className = "", ...p }: any) => (
  <Field label={label} error={error}>
    <input
      {...p}
      className={`w-full px-4 py-3 bg-slate-50 border-2 ${error ? "border-red-300" : "border-slate-100"} rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300 ${className}`}
    />
  </Field>
);

const Sel = ({ label, children, className = "", ...p }: any) => (
  <Field label={label}>
    <select
      {...p}
      className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all ${className}`}
    >
      {children}
    </select>
  </Field>
);

// FIX: Destructure loading separately so it's not passed to DOM <button>
const Btn = ({ children, variant = "primary", size = "md", className = "", loading = false, ...p }: any) => {
  const base = "inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed";
  const sz: Record<string, string> = { sm:"text-xs px-3 py-2", md:"text-xs px-4 py-3", lg:"text-sm px-6 py-4" };
  const v: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost:   "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300",
  };
  return (
    <button
      className={`${base} ${sz[size] || sz.md} ${v[variant] || v.primary} ${className}`}
      disabled={loading || p.disabled}
      {...p}
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : children}
    </button>
  );
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
);

const EmptyState = ({ icon: Icon, title, subtitle, action }: { icon: any; title: string; subtitle?: string; action?: React.ReactNode }) => (
  <Card className="p-12 text-center">
    <Icon size={40} className="mx-auto text-slate-200 mb-3" />
    <p className="font-bold text-slate-400">{title}</p>
    {subtitle && <p className="text-xs text-slate-300 mt-1">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </Card>
);

const Modal = ({ children, maxW = "max-w-md", onBgClick }: { children: React.ReactNode; maxW?: string; onBgClick?: () => void }) => (
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    style={{ background: "rgba(15,23,42,0.65)" }}
    onClick={e => { if (e.target === e.currentTarget) onBgClick?.(); }}
  >
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} overflow-hidden max-h-[92vh] flex flex-col`}>
      {children}
    </div>
  </div>
);

const MHead = ({ icon: Icon, title, subtitle, color = "bg-blue-600", onClose }: any) => (
  <div className={`${color} px-6 py-5 flex items-center justify-between flex-shrink-0`}>
    <div className="flex items-center gap-3">
      {Icon && <div className="bg-white/20 p-2 rounded-xl"><Icon size={20} className="text-white" /></div>}
      <div>
        <p className="text-white font-black uppercase tracking-widest text-xs">{title}</p>
        {subtitle && <p className="text-white/60 text-xs mt-0.5 max-w-xs truncate">{subtitle}</p>}
      </div>
    </div>
    {onClose && (
      <button onClick={onClose} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
        <X size={18} />
      </button>
    )}
  </div>
);

// ─── Pin Auth ─────────────────────────────────────────────────────────────────
const PinAuth = ({ title, subtitle, headerColor = "bg-blue-600", icon: Icon, children, confirmLabel, confirmVariant = "danger", correctPin, onConfirm, onCancel }: any) => {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const verify = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const ok = await verifyPIN(pin, correctPin);
      if (ok) {
        onConfirm();
      } else {
        setErr("Incorrect PIN — access denied.");
        setPin("");
        ref.current?.focus();
      }
    } finally {
      setChecking(false);
    }
  }, [pin, correctPin, onConfirm, checking]);

  return (
    <Modal onBgClick={onCancel}>
      <MHead icon={Icon} title={title} subtitle={subtitle} color={headerColor} onClose={onCancel} />
      <div className="p-6 space-y-4 overflow-y-auto">
        {children}
        <Field label="Admin PIN" error={err}>
          <div className="relative">
            <input
              ref={ref}
              type={show ? "text" : "password"}
              value={pin}
              maxLength={8}
              placeholder="••••••"
              onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && verify()}
              className={`w-full px-4 py-3 bg-slate-50 border-2 ${err ? "border-red-300" : "border-slate-100"} rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none transition-all`}
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <p className="text-xs text-slate-400 text-center">Default PIN: <span className="font-black text-slate-600">1234</span></p>
      </div>
      <div className="px-6 pb-6 grid grid-cols-2 gap-3 flex-shrink-0">
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant={confirmVariant} onClick={verify} loading={checking}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = memo(({ toast }: { toast: { msg: string; type: string; id: string } }) => {
  const s: Record<string, string> = { success:"bg-slate-900 text-white", error:"bg-red-600 text-white", warning:"bg-amber-500 text-white" };
  const ic: Record<string, React.ReactNode> = { success:<Check size={12}/>, error:<X size={12}/>, warning:<AlertTriangle size={12}/> };
  const ib: Record<string, string> = { success:"bg-emerald-500", error:"bg-white/20", warning:"bg-white/20" };
  return (
    <div key={toast.id} className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[300] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest ${s[toast.type] || s.success}`}>
      <div className={`p-1.5 rounded-full ${ib[toast.type] || ib.success}`}>{ic[toast.type] || ic.success}</div>
      <span>{toast.msg}</span>
    </div>
  );
});

// ─── Staff Card ───────────────────────────────────────────────────────────────
const StaffCard = memo(({ s, onEdit, onRevoke, onRestore }: { s: StaffMember; onEdit: (s: StaffMember) => void; onRevoke: (s: StaffMember) => void; onRestore: (s: StaffMember) => void }) => {
  const { date } = fmtTs(s.updatedAt);
  const ab = s.status === "active" ? "bg-indigo-500" : s.status === "restricted" ? "bg-amber-500" : "bg-slate-400";
  const initials = s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Card className={`p-5 flex items-start gap-4 ${s.status === "revoked" ? "opacity-55" : ""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${ab}`}>
        <span className="text-white font-black text-sm">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="font-black text-slate-900 uppercase text-sm">{s.name}</p>
          <StatusPill status={s.status} />
        </div>
        <p className="text-xs text-slate-500 font-bold mb-2">{s.role}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {PERMS_META.filter(p => s.permissions[p.key]).map(p => (
            <Pill key={p.key} color="blue">{p.label.split(" ")[0]}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {s.assignedClasses.slice(0, 5).map(c => <Pill key={c} color="slate">{c}</Pill>)}
          {s.assignedClasses.length > 5 && <Pill color="slate">+{s.assignedClasses.length - 5}</Pill>}
          {s.assignedClasses.length === 0 && <span className="text-xs text-slate-400 italic">All classes</span>}
        </div>
        <p className="text-xs text-slate-300 mt-2">Updated: {date}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button onClick={() => onEdit(s)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
          <KeyRound size={15} />
        </button>
        {s.status !== "revoked"
          ? <button onClick={() => onRevoke(s)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-all"><UserX size={15} /></button>
          : <button onClick={() => onRestore(s)} className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"><UserCheck size={15} /></button>
        }
      </div>
    </Card>
  );
});

// ─── Staff Dialog ─────────────────────────────────────────────────────────────
const STEPS = [
  { id:"identity",    label:"Identity",    icon:"👤", desc:"Name, role & PIN" },
  { id:"status",      label:"Status",      icon:"🔑", desc:"Account access level" },
  { id:"permissions", label:"Permissions", icon:"🛡️", desc:"Feature access" },
  { id:"classes",     label:"Classes",     icon:"📚", desc:"Assigned classes" },
];

const blankStaff = (): Omit<StaffMember, "id" | "createdAt" | "updatedAt"> => ({
  name: "", role: "Teacher", pin: "", status: "active",
  assignedClasses: [],
  permissions: { scoreEntry:true, viewReports:true, printReports:false, manageRecords:false },
});

const StaffDialog = memo(({ staff, mode, onSave, onClose }: { staff?: StaffMember; mode: "add" | "edit"; onSave: (s: StaffMember) => void; onClose: () => void }) => {
  const originalRef = useRef<any>(staff ? { ...staff, pin: "" } : blankStaff());
  const [form, setForm] = useState<any>(() => staff ? { ...staff, pin: "" } : blankStaff());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPin, setShowPin] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // FIX: Use step-based navigation (one section at a time) instead of continuous scroll
  // This eliminates the lag entirely — only renders ONE section at a time
  const [step, setStep] = useState(0);

  // FIX: Use a Set for O(1) class lookups instead of Array.includes() on every render
  const [classSet, setClassSet] = useState<Set<string>>(() => new Set(form.assignedClasses));

  // Keep classSet and form.assignedClasses in sync
  const syncClasses = useCallback((newSet: Set<string>) => {
    setClassSet(newSet);
    setForm((f: any) => ({ ...f, assignedClasses: Array.from(newSet) }));
  }, []);

  const isDirty = useMemo(() => {
    const orig = originalRef.current;
    // Compare only the fields that matter, not full JSON (faster)
    return form.name !== orig.name ||
      form.role !== orig.role ||
      form.pin !== orig.pin ||
      form.status !== orig.status ||
      JSON.stringify(form.permissions) !== JSON.stringify(orig.permissions) ||
      JSON.stringify(Array.from(classSet).sort()) !== JSON.stringify([...(orig.assignedClasses || [])].sort());
  }, [form.name, form.role, form.pin, form.status, form.permissions, classSet]);

  const setF = useCallback((key: string, val: any) => {
    setForm((f: any) => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: "" }));
  }, []);

  const toggleClass = useCallback((cls: string) => {
    setClassSet(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      setForm((f: any) => ({ ...f, assignedClasses: Array.from(next) }));
      return next;
    });
  }, []);

  const toggleAllClasses = useCallback(() => {
    if (classSet.size === ALL_CLASSES.length) {
      syncClasses(new Set());
    } else {
      syncClasses(new Set(ALL_CLASSES));
    }
  }, [classSet.size, syncClasses]);

  const toggleCategoryClasses = useCallback((classes: string[]) => {
    const allSelected = classes.every(c => classSet.has(c));
    setClassSet(prev => {
      const next = new Set(prev);
      if (allSelected) { classes.forEach(c => next.delete(c)); }
      else { classes.forEach(c => next.add(c)); }
      setForm((f: any) => ({ ...f, assignedClasses: Array.from(next) }));
      return next;
    });
  }, [classSet]);

  const togglePerm = useCallback((k: string) => {
    setF("permissions", { ...form.permissions, [k]: !form.permissions[k] });
  }, [form.permissions, setF]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) { e.name = "Full name is required"; }
    if (mode === "add" && form.pin.length < 4) e.pin = "PIN must be at least 4 digits";
    if (mode === "edit" && form.pin.length > 0 && form.pin.length < 4) e.pin = "PIN must be at least 4 digits";
    setErrors(e);
    // If error is in identity section, jump there
    if (e.name || e.pin) setStep(0);
    return !Object.keys(e).length;
  };

  const handleSave = () => {
    if (!validate()) return;
    const finalPin = (mode === "edit" && form.pin === "") ? (staff?.pin || "") : form.pin;
    onSave({
      ...form,
      assignedClasses: Array.from(classSet),
      pin: finalPin,
      id: staff?.id || uid(),
      createdAt: staff?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleClose = () => { if (isDirty) setConfirmClose(true); else onClose(); };
  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goPrev = () => setStep(s => Math.max(s - 1, 0));

  const avatarBg = form.status === "active" ? "bg-indigo-500" : form.status === "restricted" ? "bg-amber-500" : "bg-slate-400";
  const initials = form.name.trim() ? form.name.trim().split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  // Step content renderer
  const renderStep = () => {
    switch (STEPS[step].id) {
      case "identity": return (
        <div className="space-y-5">
          <Inp label="Full Name" value={form.name} onChange={(e: any) => setF("name", e.target.value)} placeholder="e.g. Mrs. Amaka Obi" error={errors.name} />
          <Sel label="Role" value={form.role} onChange={(e: any) => setF("role", e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </Sel>
          <Field label={mode === "add" ? "Access PIN *" : "New PIN (optional)"} error={errors.pin}>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={form.pin}
                maxLength={8}
                placeholder={mode === "add" ? "4–8 digits" : "Leave blank to keep current"}
                onChange={e => setF("pin", e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={`w-full px-4 py-3 bg-slate-50 border-2 ${errors.pin ? "border-red-300" : "border-slate-100"} rounded-xl font-black text-center tracking-widest text-lg focus:border-blue-500 outline-none transition-all pr-10`}
              />
              <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {form.pin.length >= 4 && <p className="text-xs text-emerald-600 font-bold mt-1">✓ PIN set — {form.pin.length} digits</p>}
            {mode === "edit" && form.pin === "" && <p className="text-xs text-slate-400 mt-1">Current PIN will be kept unchanged</p>}
          </Field>
          {/* Live preview card */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className={`w-12 h-12 rounded-xl ${avatarBg} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-black text-base">{initials}</span>
            </div>
            <div>
              <p className="font-black text-slate-900 text-sm uppercase">{form.name || <span className="text-slate-300">No name yet</span>}</p>
              <p className="text-xs text-slate-500 mt-0.5">{form.role}</p>
              <div className="mt-1"><StatusPill status={form.status} /></div>
            </div>
          </div>
        </div>
      );

      case "status": return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {([
              ["active",     "✓ Active",      "Full access to all permitted features.", "border-emerald-400 bg-emerald-50 text-emerald-700", "bg-emerald-500"],
              ["restricted", "⚠ Restricted",  "Can log in but with limited feature access.", "border-amber-400 bg-amber-50 text-amber-700", "bg-amber-500"],
              ["revoked",    "✗ Revoked",     "Account disabled — staff cannot log in.", "border-red-400 bg-red-50 text-red-700", "bg-red-400"],
            ] as const).map(([v, l, desc, ac, dot]) => (
              <button key={v} type="button" onClick={() => setF("status", v)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${form.status === v ? ac : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center ${form.status === v ? "border-current" : "border-slate-300"}`}>
                  {form.status === v && <div className="w-2 h-2 rounded-full bg-current" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-black uppercase ${form.status === v ? "" : "text-slate-500"}`}>{l}</p>
                  <p className={`text-xs mt-0.5 ${form.status === v ? "opacity-80" : "text-slate-400"}`}>{desc}</p>
                </div>
                {form.status === v && <Check size={16} className="flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      );

      case "permissions": return (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-bold">Toggle which features this staff member can access.</p>
          {PERMS_META.map(({ key, label, desc }) => (
            <button key={key} type="button" onClick={() => togglePerm(key)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${form.permissions[key] ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.permissions[key] ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"}`}>
                {form.permissions[key] && <Check size={12} className="text-white" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-black uppercase ${form.permissions[key] ? "text-blue-800" : "text-slate-600"}`}>{label}</p>
                <p className={`text-xs mt-0.5 ${form.permissions[key] ? "text-blue-600" : "text-slate-400"}`}>{desc}</p>
              </div>
              <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-lg ${form.permissions[key] ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {form.permissions[key] ? "ON" : "OFF"}
              </span>
            </button>
          ))}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mt-2">
            <p className="text-xs text-slate-500 font-medium">
              <span className="font-black text-slate-700">{Object.values(form.permissions).filter(Boolean).length}</span> of {PERMS_META.length} permissions enabled
            </p>
          </div>
        </div>
      );

      case "classes": return (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{classSet.size} selected</span>
              {classSet.size === 0 && <span className="text-xs font-bold text-amber-600">→ sees all classes</span>}
            </div>
            <button type="button" onClick={toggleAllClasses}
              className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg transition-all ${classSet.size === ALL_CLASSES.length ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {classSet.size === ALL_CLASSES.length ? "× Clear All" : "✓ Select All"}
            </button>
          </div>

          {/* Per-category class selectors */}
          {Object.entries(CURRICULUM).map(([cat, data]) => {
            const allInCat = data.classes.every(c => classSet.has(c));
            const someInCat = data.classes.some(c => classSet.has(c));
            return (
              <div key={cat} className="border border-slate-100 rounded-xl overflow-hidden">
                {/* Category header — click to toggle whole category */}
                <button type="button" onClick={() => toggleCategoryClasses(data.classes)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all ${allInCat ? "bg-blue-600" : someInCat ? "bg-blue-50" : "bg-slate-50 hover:bg-slate-100"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${allInCat ? "bg-white border-white" : someInCat ? "border-blue-400 bg-blue-400" : "border-slate-300 bg-white"}`}>
                      {(allInCat || someInCat) && <Check size={10} className={allInCat ? "text-blue-600" : "text-white"} />}
                    </div>
                    <span className={`text-xs font-black uppercase tracking-wide ${allInCat ? "text-white" : someInCat ? "text-blue-700" : "text-slate-600"}`}>{cat}</span>
                  </div>
                  <span className={`text-xs font-bold ${allInCat ? "text-white/70" : "text-slate-400"}`}>
                    {data.classes.filter(c => classSet.has(c)).length}/{data.classes.length}
                  </span>
                </button>
                {/* Individual class buttons */}
                <div className="p-3 flex flex-wrap gap-2">
                  {data.classes.map(cls => {
                    const selected = classSet.has(cls);
                    return (
                      <button key={cls} type="button" onClick={() => toggleClass(cls)}
                        className={`px-3 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${selected ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}>
                        {selected && <Check size={10} />}
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {classSet.size === 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-bold">No classes selected — this staff member will see all classes by default</p>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <>
      {/* FIX: Full-screen modal on mobile, large modal on desktop — proper flex layout */}
      <div className="fixed inset-0 z-[200] flex items-stretch md:items-center justify-center md:p-4" style={{ background: "rgba(15,23,42,0.72)" }}>
        <div className="bg-white w-full md:max-w-lg md:rounded-2xl md:shadow-2xl flex flex-col overflow-hidden md:max-h-[92vh]" style={{ maxHeight: "100dvh" }}>

          {/* ── Top nav bar ─────────────────────────────────────────────── */}
          <div className={`flex-shrink-0 ${mode === "add" ? "bg-blue-600" : "bg-indigo-600"}`}>
            <div className="flex items-center justify-between px-4 py-4">
              <button onClick={handleClose} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors">
                <ArrowLeft size={18} />
                <span className="text-xs font-black uppercase tracking-wide">
                  {mode === "add" ? "Cancel" : "Back"}
                </span>
              </button>
              <div className="text-center flex-1 mx-4">
                <p className="text-white font-black uppercase tracking-widest text-xs leading-tight">
                  {mode === "add" ? "New Staff" : "Edit Staff"}
                </p>
                {form.name.trim() && (
                  <p className="text-white/60 text-xs mt-0.5 truncate">{form.name}</p>
                )}
              </div>
              <Btn
                variant="ghost"
                size="sm"
                className="bg-white/20 text-white hover:bg-white/30 border-0"
                onClick={handleSave}
                disabled={!isDirty && mode === "edit"}
              >
                <Save size={13} />
                {mode === "add" ? "Create" : "Save"}
              </Btn>
            </div>

            {/* ── Step progress bar ───────────────────────────────────── */}
            <div className="flex border-t border-white/20">
              {STEPS.map((s, i) => (
                <button key={s.id} type="button" onClick={() => setStep(i)}
                  className={`flex-1 flex flex-col items-center py-2.5 px-1 transition-all relative ${step === i ? "bg-white/20" : "hover:bg-white/10"}`}>
                  <span className="text-sm">{s.icon}</span>
                  <span className={`text-xs font-black uppercase tracking-tight mt-0.5 hidden sm:block ${step === i ? "text-white" : "text-white/50"}`}>{s.label}</span>
                  {/* Active indicator */}
                  {step === i && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
                  {/* Completion dot */}
                  {i < step && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* ── Dirty banner ─────────────────────────────────────────────── */}
          {isDirty && (
            <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <p className="text-xs font-black uppercase text-amber-700 tracking-wide">Unsaved changes</p>
            </div>
          )}

          {/* ── Section title ─────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-slate-100 flex items-center gap-3">
            <span className="text-2xl">{STEPS[step].icon}</span>
            <div>
              <p className="font-black uppercase text-slate-900 text-sm">{STEPS[step].label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{STEPS[step].desc}</p>
            </div>
            <div className="ml-auto text-xs font-black text-slate-400">
              {step + 1} / {STEPS.length}
            </div>
          </div>

          {/* ── Scrollable step content ───────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-5">
              {renderStep()}
            </div>
          </div>

          {/* ── Bottom navigation bar ─────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
            <Btn variant="ghost" onClick={goPrev} disabled={step === 0} className="flex-1">
              <ChevronLeft size={15} />Prev
            </Btn>
            <div className="flex gap-1.5 flex-shrink-0">
              {STEPS.map((_, i) => (
                <button key={i} type="button" onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${step === i ? "w-6 h-2 bg-blue-600" : "w-2 h-2 bg-slate-200 hover:bg-slate-300"}`} />
              ))}
            </div>
            {step < STEPS.length - 1 ? (
              <Btn variant="primary" onClick={goNext} className="flex-1">
                Next<ChevronRight size={15} />
              </Btn>
            ) : (
              <Btn variant="primary" onClick={handleSave} disabled={!isDirty && mode === "edit"} className="flex-1">
                <Save size={14} />{mode === "add" ? "Create Account" : "Save Changes"}
              </Btn>
            )}
          </div>
        </div>
      </div>

      {confirmClose && (
        <Modal maxW="max-w-sm" onBgClick={() => setConfirmClose(false)}>
          <MHead icon={AlertTriangle} title="Discard Changes?" subtitle="Your unsaved changes will be lost" color="bg-amber-500" onClose={() => setConfirmClose(false)} />
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 font-medium">Are you sure you want to close without saving?</p>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" onClick={() => setConfirmClose(false)}>Keep Editing</Btn>
              <Btn variant="danger" onClick={() => { setConfirmClose(false); onClose(); }}>Discard</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
});

// ─── Export Dialog (Print / PDF / Excel / Email / Share) ─────────────────────
const EXPORT_OPTS = [
  { id:"pdf",       icon:"📄", label:"Export PDF",       desc:"Formatted A4 report (jsPDF)" },
  { id:"excel",     icon:"📊", label:"Export Excel",     desc:"Full spreadsheet with all subjects" },
  { id:"browser",   icon:"🖨️", label:"Browser Print",    desc:"Print via browser / USB printer" },
  { id:"download",  icon:"💾", label:"Download HTML",    desc:"Save as HTML file" },
  { id:"email",     icon:"📧", label:"Email",            desc:"Send to parent / guardian" },
  { id:"share",     icon:"📤", label:"Share",            desc:"WhatsApp / native share" },
];

const PrintDialog = memo(({ student, schoolName, schoolLogo, curC, attRate, schoolSettings, onClose }: {
  student: any; schoolName: string; schoolLogo: string | null;
  curC: any; attRate: number | null; schoolSettings: any; onClose: () => void;
}) => {
  const [sel, setSel] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState("");

  const go = async () => {
    if (!sel) return;
    setStatus("loading");
    setProgress("Preparing…");
    try {
      if (sel === "pdf") {
        setProgress("Loading PDF engine…");
        await exportReportToPDF(student, curC, attRate, schoolSettings, schoolLogo);
        setStatus("done");
        return;
      }
      if (sel === "excel") {
        setProgress("Building spreadsheet…");
        await exportSingleStudentExcel(student, curC, attRate, schoolSettings);
        setStatus("done");
        return;
      }
      if (sel === "browser") {
        onClose();
        setTimeout(() => window.print(), 300);
        return;
      }
      if (sel === "download") {
        const reportEl = document.getElementById("printable-report");
        const content = reportEl ? reportEl.innerHTML : `<h1>${student.name}</h1>`;
        const blob = new Blob([
          `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${student.name}</title>` +
          `<style>body{font-family:serif;padding:20px;max-width:800px;margin:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}thead{background:#1e293b;color:white}h1{color:#0f172a}</style>` +
          `</head><body>${content}</body></html>`
        ], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: `${student.name.replace(/\s+/g, "_")}_Report.html` });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus("done");
        return;
      }
      if (sel === "email") {
        if (!email.includes("@")) throw new Error("bad-email");
        const s = encodeURIComponent(`${student.name} Report — ${schoolName}`);
        const b = encodeURIComponent(`Please find the academic report for ${student.name}.\n\nSession: ${schoolSettings.session}\nTerm: ${schoolSettings.term}\n\n— ${schoolName}`);
        window.location.href = `mailto:${email}?subject=${s}&body=${b}`;
        setStatus("done");
        return;
      }
      if (sel === "share") {
        const t = `Academic Report for ${student.name} — ${schoolName} (${schoolSettings.term}, ${schoolSettings.session})`;
        if (navigator.share) await navigator.share({ title: `${student.name} Report`, text: t });
        else await navigator.clipboard?.writeText(t);
        setStatus("done");
      }
    } catch (e: any) {
      if (e.message === "bad-email") setStatus("bad-email");
      else { console.error(e); setStatus("error"); }
      setProgress("");
    }
  };

  return (
    <Modal onBgClick={onClose}>
      <MHead icon={Printer} title="Export Report" subtitle={student.name} color="bg-blue-600" onClose={onClose} />
      <div className="p-5 space-y-3 overflow-y-auto">
        {status === "done" ? (
          <div className="text-center py-10 space-y-4">
            <div className="inline-flex p-4 bg-emerald-100 rounded-full"><Check size={32} className="text-emerald-600" /></div>
            <p className="font-black uppercase text-slate-900">Export Complete!</p>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        ) : (
          <>
            {/* Group: Export formats */}
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Export Format</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_OPTS.slice(0, 2).map(o => (
                <button key={o.id} type="button" onClick={() => { setSel(o.id); setStatus("idle"); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${sel === o.id ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                  <span className="text-2xl">{o.icon}</span>
                  <div>
                    <p className={`text-xs font-black ${sel === o.id ? "text-blue-700" : "text-slate-800"}`}>{o.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{o.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            {/* Group: Other options */}
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide pt-1">Other Options</p>
            {EXPORT_OPTS.slice(2).map(o => (
              <button key={o.id} type="button" onClick={() => { setSel(o.id); setStatus("idle"); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${sel === o.id ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                <span className="text-lg flex-shrink-0">{o.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-black ${sel === o.id ? "text-blue-700" : "text-slate-800"}`}>{o.label}</p>
                  <p className="text-xs text-slate-400">{o.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel === o.id ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                  {sel === o.id && <Check size={9} className="text-white" />}
                </div>
              </button>
            ))}
            {sel === "email" && (
              <Inp label="Recipient Email" type="email" placeholder="parent@example.com" value={email}
                onChange={(e: any) => { setEmail(e.target.value); setStatus("idle"); }}
                error={status === "bad-email" ? "Enter a valid email address" : ""} />
            )}
            {status === "error" && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertTriangle size={13} className="text-red-500" />
                <p className="text-xs text-red-600 font-bold">Export failed. Try another method or check console.</p>
              </div>
            )}
            {status === "loading" && progress && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-xs text-blue-600 font-bold">{progress}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={go} loading={status === "loading"} disabled={!sel}>
                <Printer size={14} />Export
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
});

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const DEFAULT_REPORT_TEMPLATE: ReportTemplateConfig = {
  uploadedFile: null,
  uploadedFileName: null,
  headerColor: "#0f172a",
  accentColor: "#2563eb",
  fontFamily: "Georgia",
  showLogo: true,
  showMotto: true,
  showAttendance: true,
  showTeacherRemark: true,
  showPrincipalRemark: true,
  showResumptionDate: true,
  showPosition: true,
  showGrade: true,
  showStamp: true,
  tableStyle: "striped",
};

const SETTINGS_SECTIONS = [
  { id:"logo",     label:"School Logo",    icon:"🖼️" },
  { id:"info",     label:"School Info",    icon:"🏫" },
  { id:"session",  label:"Session & Term", icon:"📅" },
  { id:"template", label:"Report Template",icon:"📋" },
  { id:"security", label:"Security & PIN", icon:"🔒" },
  { id:"database", label:"Database",       icon:"🗄️" },
];

const SettingsTab = memo(({ logoUrl, setSchoolLogo, logoRef, showToast, adminPinRef }: {
  logoUrl: string | null;
  setSchoolLogo: (url: string | null) => void;
  logoRef: React.RefObject<HTMLInputElement>;
  showToast: (msg: string, type?: string) => void;
  adminPinRef: React.MutableRefObject<string>;
}) => {
  const { state, dispatch } = useApp();
  const { schoolSettings } = state;
  const [sec, setSec] = useState("logo");
  const [draft, setDraft] = useState({ ...schoolSettings });
  const [pinF, setPinF] = useState({ cur: "", nxt: "", cnf: "" });
  const [pinErr, setPinErr] = useState("");
  const [pinSh, setPinSh] = useState({ cur: false, nxt: false, cnf: false });
  const [saved, setSaved] = useState(false);
  const [dbStats, setDbStats] = useState<{ size: string; keys: string[] }>({ size: "—", keys: [] });
  const [clearPin, setClearPin] = useState("");
  const [clearPinErr, setClearPinErr] = useState("");

  useEffect(() => { setDraft({ ...schoolSettings }); }, [schoolSettings]);

  // Compute DB stats
  useEffect(() => {
    if (sec !== "database") return;
    try {
      const raw = localStorage.getItem(DB_KEY) || "";
      const bytes = new Blob([raw]).size;
      const size = bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(2)} MB`;
      const keys = Object.keys(localStorage).filter(k => k.startsWith("greatmind"));
      setDbStats({ size, keys });
    } catch { setDbStats({ size: "N/A", keys: [] }); }
  }, [sec]);

  const saveInfo = () => {
    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: draft });
    setSaved(true);
    showToast("Settings saved");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return showToast("Invalid image", "error");
    if (f.size > 2097152) return showToast("Image must be under 2MB", "error");
    const r = new FileReader();
    r.onload = ev => { setSchoolLogo(ev.target?.result as string); showToast("Logo uploaded"); };
    r.readAsDataURL(f);
  };

  const changePin = async () => {
    setPinErr("");
    const curOk = await verifyPIN(pinF.cur, adminPinRef.current);
    if (!curOk) return setPinErr("Current PIN is incorrect.");
    if (pinF.nxt.length < 4) return setPinErr("New PIN must be ≥ 4 digits.");
    if (pinF.nxt !== pinF.cnf) return setPinErr("New PINs do not match.");
    adminPinRef.current = await ensureHashed(pinF.nxt);
    setPinF({ cur: "", nxt: "", cnf: "" });
    showToast("Admin PIN updated & encrypted");
  };

  const handleClearDB = async () => {
    setClearPinErr("");
    const ok = await verifyPIN(clearPin, adminPinRef.current);
    if (!ok) return setClearPinErr("Incorrect PIN.");
    try { localStorage.removeItem(DB_KEY); } catch {}
    showToast("Database cleared — reloading…", "warning");
    setClearPin("");
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 uppercase">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage school identity, session info and security</p>
      </div>
      <div className="flex flex-col md:flex-row gap-5">
        <Card className="p-2 md:w-48 h-fit flex-shrink-0">
          {SETTINGS_SECTIONS.map(s => (
            <button key={s.id} type="button" onClick={() => setSec(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-sm font-bold ${sec === s.id ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
              <span>{s.icon}</span>{s.label}
              {sec === s.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </Card>
        <div className="flex-1 space-y-4">
          {sec === "logo" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">School Logo</p>
                <p className="text-xs text-slate-400 mt-0.5">Appears on login, sidebar and printed reports.</p>
              </div>
              <div className="flex items-center gap-5">
                <SchoolLogo logoUrl={logoUrl} size="lg" />
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-slate-500 font-medium">PNG, JPG or SVG · max 2MB</p>
                  <div className="flex gap-2 flex-wrap">
                    <Btn variant="primary" size="sm" onClick={() => logoRef.current?.click()}>
                      <Upload size={13} />{logoUrl ? "Replace" : "Upload"}
                    </Btn>
                    {logoUrl && (
                      <Btn variant="ghost" size="sm" onClick={() => { setSchoolLogo(null); if (logoRef.current) logoRef.current.value = ""; showToast("Logo removed"); }}>
                        <X size={13} />Remove
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <div onClick={() => logoRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group">
                <Upload size={22} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-2" />
                <p className="text-xs font-black uppercase text-slate-400 group-hover:text-blue-500">Click or drop image here</p>
              </div>
              {logoUrl && (
                <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
                  <img src={logoUrl} alt="preview" className="w-12 h-12 rounded-lg object-contain border border-slate-200" />
                  <div>
                    <p className="text-xs font-black text-slate-700 uppercase">Current Preview</p>
                    <p className="text-xs text-slate-400">This appears on all reports.</p>
                  </div>
                </div>
              )}
            </Card>
          )}
          {sec === "info" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">School Information</p>
                <p className="text-xs text-slate-400 mt-0.5">Shown on reports and login screen.</p>
              </div>
              <Inp label="School Name" value={draft.name} onChange={(e: any) => setDraft(d => ({ ...d, name: e.target.value }))} />
              <Inp label="School Motto" value={draft.motto} onChange={(e: any) => setDraft(d => ({ ...d, motto: e.target.value }))} />
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>
                  {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Information</>}
                </Btn>
              </div>
            </Card>
          )}
          {sec === "session" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Session & Term</p>
                <p className="text-xs text-slate-400 mt-0.5">Controls the academic period shown on reports.</p>
              </div>
              <Inp label="Academic Session" value={draft.session} onChange={(e: any) => setDraft(d => ({ ...d, session: e.target.value }))} placeholder="e.g. 2024/2025" />
              <Sel label="Current Term" value={draft.term} onChange={(e: any) => setDraft(d => ({ ...d, term: e.target.value }))}>
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </Sel>
              <Inp label="Next Resumption Date" value={draft.resumptionDate} onChange={(e: any) => setDraft(d => ({ ...d, resumptionDate: e.target.value }))} placeholder="e.g. January 8th, 2025" />
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <p className="text-xs font-black uppercase text-slate-400">Report Preview</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-slate-900 text-white text-xs font-black rounded-full">{draft.session}</span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black rounded-full">{draft.term}</span>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full">Resumes: {draft.resumptionDate}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>
                  {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Session</>}
                </Btn>
              </div>
            </Card>
          )}
          {sec === "template" && (() => {
            const tpl = schoolSettings.reportTemplate || DEFAULT_REPORT_TEMPLATE;
            const updateTpl = (patch: Partial<ReportTemplateConfig>) => {
              dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { reportTemplate: { ...tpl, ...patch } } });
              showToast("Template updated");
            };
            const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const validTypes = [
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
              ];
              if (!validTypes.includes(f.type)) return showToast("Please upload a PDF or DOCX file", "error");
              if (f.size > 5242880) return showToast("File must be under 5MB", "error");
              const r = new FileReader();
              r.onload = ev => {
                updateTpl({ uploadedFile: ev.target?.result as string, uploadedFileName: f.name });
                showToast(`Template "${f.name}" uploaded`);
              };
              r.readAsDataURL(f);
              e.target.value = "";
            };
            const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
              <label className="flex items-center justify-between py-2.5 px-1 cursor-pointer group">
                <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{label}</span>
                <div className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-slate-200"}`}
                  onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
                </div>
              </label>
            );
            return (
              <div className="space-y-4">
                {/* Upload Template */}
                <Card className="p-6 space-y-5">
                  <div>
                    <p className="text-sm font-black uppercase text-slate-700">Upload Report Template</p>
                    <p className="text-xs text-slate-400 mt-0.5">Upload a custom PDF or DOCX file to use as the base for generated reports.</p>
                  </div>
                  {tpl.uploadedFile ? (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg">📄</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-700 truncate">{tpl.uploadedFileName || "Custom Template"}</p>
                        <p className="text-xs text-slate-400">Uploaded template active</p>
                      </div>
                      <Btn variant="ghost" size="sm" onClick={() => updateTpl({ uploadedFile: null, uploadedFileName: null })}>
                        <X size={13} />Remove
                      </Btn>
                    </div>
                  ) : (
                    <label className="w-full flex flex-col items-center gap-2 px-6 py-8 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group">
                      <Upload size={24} className="text-slate-300 group-hover:text-blue-400" />
                      <p className="text-xs font-black uppercase text-slate-400 group-hover:text-blue-500">Click to upload PDF or DOCX</p>
                      <p className="text-xs text-slate-300">Max 5MB</p>
                      <input type="file" accept=".pdf,.docx,.doc" className="hidden" onChange={handleTemplateUpload} />
                    </label>
                  )}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700 font-bold leading-relaxed">
                      💡 Uploaded templates serve as a reference design. The system will match the layout style when generating student reports.
                    </p>
                  </div>
                </Card>

                {/* Customize Layout */}
                <Card className="p-6 space-y-5">
                  <div>
                    <p className="text-sm font-black uppercase text-slate-700">Report Layout</p>
                    <p className="text-xs text-slate-400 mt-0.5">Choose which sections appear on generated reports.</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <Toggle label="Show School Logo" checked={tpl.showLogo} onChange={v => updateTpl({ showLogo: v })} />
                    <Toggle label="Show School Motto" checked={tpl.showMotto} onChange={v => updateTpl({ showMotto: v })} />
                    <Toggle label="Show Student Position" checked={tpl.showPosition} onChange={v => updateTpl({ showPosition: v })} />
                    <Toggle label="Show Grade Column" checked={tpl.showGrade} onChange={v => updateTpl({ showGrade: v })} />
                    <Toggle label="Show Attendance Section" checked={tpl.showAttendance} onChange={v => updateTpl({ showAttendance: v })} />
                    <Toggle label="Show Teacher's Remark" checked={tpl.showTeacherRemark} onChange={v => updateTpl({ showTeacherRemark: v })} />
                    <Toggle label="Show Principal's Remark" checked={tpl.showPrincipalRemark} onChange={v => updateTpl({ showPrincipalRemark: v })} />
                    <Toggle label="Show Stamp Box" checked={tpl.showStamp} onChange={v => updateTpl({ showStamp: v })} />
                    <Toggle label="Show Resumption Date" checked={tpl.showResumptionDate} onChange={v => updateTpl({ showResumptionDate: v })} />
                  </div>
                </Card>

                {/* Style Settings */}
                <Card className="p-6 space-y-5">
                  <div>
                    <p className="text-sm font-black uppercase text-slate-700">Report Styling</p>
                    <p className="text-xs text-slate-400 mt-0.5">Customize colors, fonts and table appearance.</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Header Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={tpl.headerColor} onChange={e => updateTpl({ headerColor: e.target.value })}
                          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                        <span className="text-sm font-bold text-slate-600 uppercase">{tpl.headerColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Accent Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={tpl.accentColor} onChange={e => updateTpl({ accentColor: e.target.value })}
                          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                        <span className="text-sm font-bold text-slate-600 uppercase">{tpl.accentColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Font Family</label>
                      <select value={tpl.fontFamily} onChange={e => updateTpl({ fontFamily: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                        <option value="Georgia">Georgia (Serif)</option>
                        <option value="Helvetica">Helvetica (Sans-serif)</option>
                        <option value="Times">Times New Roman (Classic)</option>
                        <option value="Courier">Courier (Monospace)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 mb-2 block">Table Style</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(["grid", "striped", "minimal"] as const).map(style => (
                          <button key={style} onClick={() => updateTpl({ tableStyle: style })}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${tpl.tableStyle === style ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Reset */}
                <div className="text-center">
                  <Btn variant="ghost" size="sm" onClick={() => {
                    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { reportTemplate: { ...DEFAULT_REPORT_TEMPLATE } } });
                    showToast("Template reset to defaults");
                  }}>
                    🔄 Reset to Default Template
                  </Btn>
                </div>
              </div>
            );
          })()}
          {sec === "database" && (
            <div className="space-y-4">
              {/* Firebase Cloud Sync Card */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${FIREBASE_ENABLED ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                  <div>
                    <p className="text-sm font-black uppercase text-slate-700">Cloud Sync — Firebase</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {FIREBASE_ENABLED ? "Firebase is configured. Data syncs across all devices automatically." : "Firebase not configured — running on local storage only."}
                    </p>
                  </div>
                </div>
                {FIREBASE_ENABLED ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Btn variant="primary" size="sm" onClick={async () => {
                      try {
                        await pushToFirebase(state as any);
                        showToast("Pushed to Firebase ✓");
                      } catch { showToast("Push failed","error"); }
                    }}>
                      ☁️ Push to Cloud
                    </Btn>
                    <Btn variant="outline" size="sm" onClick={async () => {
                      try {
                        const remote = await fetchFromFirebase();
                        if (remote) {
                          showToast("Cloud data fetched — reload to apply", "warning");
                          saveDB(remote as any);
                          setTimeout(() => window.location.reload(), 1500);
                        } else { showToast("No cloud data found","warning"); }
                      } catch { showToast("Fetch failed","error"); }
                    }}>
                      🔄 Pull from Cloud
                    </Btn>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-black uppercase text-slate-500">How to enable Firebase sync:</p>
                    <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside font-medium">
                      <li>Create a project at <span className="font-black text-blue-600">console.firebase.google.com</span></li>
                      <li>Enable Realtime Database with public read/write rules</li>
                      <li>Copy the config values into <code className="bg-white px-1 rounded border">FIREBASE_CONFIG</code> at the top of this file</li>
                      <li>Redeploy — all devices with the same config will share data</li>
                    </ol>
                  </div>
                )}
              </Card>

              {/* Local DB Stats */}
              <Card className="p-5 space-y-4">
                <p className="text-sm font-black uppercase text-slate-700">Local Database</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["Storage Used", dbStats.size,                    "bg-blue-50 text-blue-800"],
                    ["DB Keys",      String(dbStats.keys.length),      "bg-slate-50 text-slate-700"],
                  ] as const).map(([l, v, c]) => (
                    <div key={l} className={`${c} rounded-xl p-4 text-center border border-slate-100`}>
                      <p className="text-2xl font-black">{v}</p>
                      <p className="text-xs font-black uppercase opacity-60 mt-1">{l}</p>
                    </div>
                  ))}
                </div>

                {/* Data breakdown */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400 mb-3">Data Breakdown</p>
                  {([
                    ["Score Records",  state.entries.length],
                    ["Bin (deleted)",  state.bin.length],
                    ["Attendance",     state.attendance.length],
                    ["Staff Accounts", state.staffList.length],
                    ["Class Rolls",    Object.values(state.classRolls).reduce((a, b) => a + b.length, 0)],
                    ["Activity Logs",  state.logs.length],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">{l}</span>
                      <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-md">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Export options */}
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400">Bulk Export</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn variant="outline" size="sm" onClick={() => {
                      const data = localStorage.getItem(DB_KEY) || "{}";
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([data], { type:"application/json" }));
                      a.download = `greatmind_backup_${today()}.json`;
                      a.click(); showToast("JSON backup downloaded");
                    }}>
                      <Database size={13} />Backup JSON
                    </Btn>
                    <Btn variant="outline" size="sm" onClick={async () => {
                      if (!state.entries.length) return showToast("No data to export","warning");
                      const classes = [...new Set(state.entries.map(e => e.studentClass))];
                      showToast(`Exporting ${classes.length} class${classes.length!==1?"es":""}…`);
                      for (const cls of classes) {
                        await exportClassToExcel(cls, state.schoolSettings.session, state.schoolSettings.term, state.entries, state.attendance);
                      }
                      showToast("All classes exported!");
                    }}>
                      📊 Export All Excel
                    </Btn>
                  </div>
                </div>

                {/* Restore from JSON */}
                <div>
                  <p className="text-xs font-black uppercase text-slate-400 mb-2">Restore from Backup</p>
                  <label className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black uppercase text-slate-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer">
                    <Upload size={13} />Upload JSON Backup
                    <input type="file" accept=".json" className="hidden" onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = ev => {
                        try {
                          const parsed = JSON.parse(ev.target?.result as string);
                          if (!parsed.entries && !parsed.staffList) throw new Error("Invalid backup file");
                          saveDB(parsed);
                          showToast("Backup restored — reloading…");
                          setTimeout(() => window.location.reload(), 1200);
                        } catch { showToast("Invalid backup file","error"); }
                      };
                      r.readAsText(f);
                      e.target.value = "";
                    }} />
                  </label>
                </div>
              </Card>

              {/* Danger zone */}
              <Card className="p-5 border-2 border-red-100 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500" />
                  <p className="text-xs font-black uppercase text-red-600">Danger Zone — Clear All Data</p>
                </div>
                <p className="text-xs text-red-500 font-medium">Permanently deletes all records, staff, attendance and settings. Enter Admin PIN to confirm.</p>
                <Field error={clearPinErr}>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={clearPin}
                      maxLength={8}
                      placeholder="Admin PIN"
                      onChange={e => { setClearPin(e.target.value.replace(/\D/g,"")); setClearPinErr(""); }}
                      className="flex-1 px-3 py-2.5 bg-white border-2 border-red-200 rounded-xl text-sm font-black text-center tracking-widest focus:border-red-400 outline-none transition-all"
                    />
                    <Btn variant="danger" size="sm" onClick={handleClearDB} disabled={clearPin.length < 4}>
                      <Trash2 size={13} />Clear DB
                    </Btn>
                  </div>
                </Field>
              </Card>
            </div>
          )}
          {sec === "security" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Security & PIN</p>
                <p className="text-xs text-slate-400 mt-0.5">Admin PIN authorises sensitive actions.</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                <Shield size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 font-medium space-y-0.5">
                  <p className="font-black uppercase">PIN Encryption Active</p>
                  <p>All PINs are hashed with <span className="font-black">SHA-256</span> via the Web Crypto API before storage. Raw PINs are never saved to disk, localStorage, or Firebase.</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">Keep this PIN private. Default PIN is <strong>1234</strong> — change it immediately after first login.</p>
              </div>
              {(["cur", "nxt", "cnf"] as const).map((fk, i) => {
                const labels = { cur: "Current PIN", nxt: "New PIN (min 4 digits)", cnf: "Confirm New PIN" };
                return (
                  <Field key={fk} label={labels[fk]}>
                    <div className="relative">
                      <input
                        type={pinSh[fk] ? "text" : "password"}
                        value={pinF[fk]}
                        maxLength={8}
                        placeholder="••••••"
                        onChange={e => setPinF(p => ({ ...p, [fk]: e.target.value.replace(/\D/g, "") }))}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none transition-all pr-11"
                      />
                      <button type="button" onClick={() => setPinSh(s => ({ ...s, [fk]: !s[fk] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {pinSh[fk] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                );
              })}
              {pinErr && <p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={12} />{pinErr}</p>}
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={changePin}>
                  <Shield size={15} />Update Admin PIN
                </Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Report Sheet ─────────────────────────────────────────────────────────────
const ReportSheet = memo(({ report, curC, attRate, schoolLogo, schoolSettings }: any) => {
  const tpl: ReportTemplateConfig = schoolSettings.reportTemplate || DEFAULT_REPORT_TEMPLATE;
  const headers = tpl.showGrade
    ? ["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"]
    : ["Subject", "CA /40", "Exam /60", "Total /100"];
  const studentFields = [
    ["Student", report.name, "font-black text-blue-700"],
    ["Class", report.class, ""],
    ...(tpl.showPosition ? [["Position", report.position, "font-black text-emerald-700"], ["In Class", report.classCount, ""]] : []),
  ];
  const remarkSections = [
    ...(tpl.showTeacherRemark ? [["teacher", "Class Teacher's Remark", "teacherSig", ""] as const] : []),
    ...(tpl.showPrincipalRemark ? [["principal", "Principal's Remark", "principalSig", "principal"] as const] : []),
  ];
  return (
    <div id="printable-report" className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ fontFamily: `${tpl.fontFamily},serif` }}>
      <div className="h-1.5" style={{ backgroundColor: tpl.accentColor }} />
      <div className="px-8 pt-7 pb-5 border-b-2 flex items-center justify-between gap-4" style={{ borderColor: tpl.headerColor }}>
        <div className="flex items-center gap-4 min-w-0">
          {tpl.showLogo && <SchoolLogo logoUrl={schoolLogo} size="lg" />}
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight leading-tight" style={{ color: tpl.headerColor }}>{schoolSettings.name}</h1>
            {tpl.showMotto && <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: tpl.accentColor }}>{schoolSettings.motto}</p>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="inline-block text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full" style={{ backgroundColor: tpl.headerColor }}>Report Sheet</span>
          <p className="text-xs text-slate-500 font-bold mt-1.5">{schoolSettings.session} · {schoolSettings.term}</p>
        </div>
      </div>
      <div className="bg-slate-50 px-8 py-3.5 border-b border-slate-100" style={{ display: "grid", gridTemplateColumns: `repeat(${studentFields.length}, 1fr)`, gap: "0.75rem" }}>
        {studentFields.map(([l, v, x]) => (
          <div key={l as string}>
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-0.5">{l}</p>
            <p className={`text-sm font-black uppercase text-slate-900 ${x}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="px-8 pt-5 pb-3">
        <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Academic Performance</p>
        <table className="w-full border-collapse text-xs" style={{ borderTop: `2px solid ${tpl.headerColor}`, borderBottom: `2px solid ${tpl.headerColor}` }}>
          <thead>
            <tr style={{ backgroundColor: tpl.headerColor, color: "#fff" }}>
              {headers.map((h, i) => (
                <th key={i} style={{ padding:"9px 10px", textAlign: i === 0 ? "left" : "center", fontWeight:800, fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", borderRight: i < headers.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.records.map((r: any, i: number) => {
              const g = getGrade(r.total);
              const bg = tpl.tableStyle === "striped" ? (i % 2 === 0 ? "#fff" : "#f8fafc") : "#fff";
              const border = tpl.tableStyle === "minimal" ? "none" : "1px solid #e2e8f0";
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ padding:"8px 10px", borderRight: border, borderBottom: border, fontWeight:700, textTransform:"uppercase", fontSize:"10px" }}>{r.subject}</td>
                  <td style={{ padding:"8px 10px", borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.caScore}</td>
                  <td style={{ padding:"8px 10px", borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.examScore}</td>
                  <td style={{ padding:"8px 10px", borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, fontSize:"12px" }}>{r.total}</td>
                  {tpl.showGrade && <td style={{ padding:"8px 10px", borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, color:g.color }}>{g.grade}</td>}
                  {tpl.showGrade && <td style={{ padding:"8px 10px", borderBottom: border, fontStyle:"italic", color:"#64748b", fontSize:"10px" }}>{g.remark}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: tpl.headerColor }}>
              <td colSpan={tpl.showGrade ? 3 : 3} style={{ padding:"9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Cumulative Total</td>
              <td style={{ padding:"9px 10px", textAlign:"center", color:"#fff", fontWeight:900, fontSize:"14px" }}>{report.summary.total}<span style={{ fontSize:"9px", opacity:0.5 }}>/{report.summary.obtainable}</span></td>
              {tpl.showGrade && <td style={{ padding:"9px 10px", textAlign:"center", color:"#34d399", fontWeight:900, fontSize:"12px" }}>{report.summary.avg}%</td>}
              {tpl.showGrade && <td style={{ padding:"9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase" }}>Avg.</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {tpl.showAttendance && (
        <div className="px-8 pt-4 pb-3">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Attendance</p>
          <div className="grid grid-cols-4 gap-2">
            {([
              ["Days Opened",  curC.daysOpen    || "—", "bg-slate-100 text-slate-800"],
              ["Days Present", curC.daysPresent || "—", "bg-emerald-50 text-emerald-800"],
              ["Days Absent",  curC.daysAbsent  || "—", "bg-red-50 text-red-700"],
              ["Rate", attRate !== null ? `${attRate}%` : "—", attRate === null ? "bg-slate-100 text-slate-800" : attRate >= 75 ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"],
            ] as const).map(([l, v, c]) => (
              <div key={l} className={`${c} rounded-xl p-3 text-center`}>
                <p className="text-xs font-black uppercase opacity-60 mb-0.5">{l}</p>
                <p className="text-xl font-black">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {remarkSections.length > 0 && (
        <div className={`px-8 pt-4 pb-5 grid gap-4 ${remarkSections.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {remarkSections.map(([f, l, sf, role]) => (
            <div key={f} className="border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">{l}</p>
              <div className="min-h-10 text-sm text-slate-700 italic border-b border-dashed border-slate-200 pb-2 mb-3">
                {curC[f] || <span className="text-slate-300 not-italic text-xs">No remark entered</span>}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400 mb-0.5">Signature</p>
                  <p className="italic text-base" style={{ fontFamily:`${tpl.fontFamily},serif`, color: tpl.accentColor }}>{curC[sf] || "_____________________"}</p>
                </div>
                {role === "principal" && tpl.showStamp && (
                  <div className="w-16 h-10 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                    <p className="text-xs text-slate-300 font-bold">Stamp</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {tpl.showResumptionDate && (
        <div className="px-8 py-3 flex items-center justify-between" style={{ backgroundColor: tpl.headerColor }}>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Next Term Resumption</p>
          <p className="text-sm font-black text-white uppercase">{schoolSettings.resumptionDate}</p>
        </div>
      )}
      <div className="h-1.5" style={{ backgroundColor: tpl.accentColor }} />
    </div>
  );
});
// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────────────────────
const AttendanceTab = memo(() => {
  const { state, dispatch, showToast } = useApp();
  const { attendance, classRolls, entries } = state;
  const [attTab, setAttTab] = useState<"roll" | "mark" | "history">("roll");

  // ── Class Roll ────────────────────────────────────────────────────────────
  const [rollClass, setRollClass] = useState("");
  const [rollSearch, setRollSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdmNo, setNewAdmNo] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAdmNo, setEditAdmNo] = useState("");
  // CSV Import state
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvImportMode, setCsvImportMode] = useState<"idle" | "preview" | "done">("idle");
  const [csvPreview, setCsvPreview] = useState<{ name: string; admNo: string }[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  // FIX: Reset search when class changes
  const handleRollClassChange = useCallback((cls: string) => {
    setRollClass(cls);
    setRollSearch("");
    setEditingId(null);
    setCsvImportMode("idle");
    setCsvPreview([]);
  }, []);

  // CSV import handler
  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i)) { showToast("Please upload a .csv or .txt file", "error"); return; }
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSVRoll(text);
      if (!parsed.length) { showToast("No valid student names found in file", "error"); return; }
      setCsvPreview(parsed);
      setCsvImportMode("preview");
    };
    reader.readAsText(file);
    // Reset file input so same file can be re-selected
    e.target.value = "";
  };

  const confirmCSVImport = () => {
    if (!rollClass) return showToast("Select a class first", "error");
    const existing = classRolls[rollClass] || [];
    const existingNames = new Set(existing.map(s => s.name.toLowerCase()));
    const newStudents = csvPreview
      .filter(s => !existingNames.has(s.name.toLowerCase()))
      .map(s => ({ id: uid(), name: s.name, admNo: s.admNo }));
    const dupes = csvPreview.length - newStudents.length;
    if (!newStudents.length) { showToast("All students already in roll", "warning"); return; }
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: [...existing, ...newStudents] });
    showToast(`${newStudents.length} added${dupes ? `, ${dupes} duplicate${dupes > 1 ? "s" : ""} skipped` : ""}`);
    setCsvImportMode("done");
    setCsvPreview([]);
    setShowBulk(false);
  };

  const rollStudents = useMemo((): RollStudent[] => {
    const roll = classRolls[rollClass] || [];
    const fromEntries = entries.filter(e => e.studentClass === rollClass).map(e => e.studentName);
    const entrySet = new Set(fromEntries);
    const rollSet = new Set(roll.map(r => r.name));
    const suggested = [...entrySet]
      .filter(n => !rollSet.has(n))
      .map(n => ({ id: "suggest_" + n, name: n, admNo: "", suggested: true }));
    return [...roll, ...suggested];
  }, [classRolls, rollClass, entries]);

  const filteredRoll = useMemo(() =>
    rollStudents.filter(s =>
      s.name.toLowerCase().includes(rollSearch.toLowerCase()) ||
      (s.admNo || "").includes(rollSearch)
    ),
  [rollStudents, rollSearch]);

  const addStudent = () => {
    if (!newName.trim()) return showToast("Enter student name", "error");
    if (!rollClass) return showToast("Select a class", "error");
    const existing = classRolls[rollClass] || [];
    if (existing.find(s => s.name.toLowerCase() === newName.trim().toLowerCase()))
      return showToast("Student already exists", "error");
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: uid(), name: newName.trim(), admNo: newAdmNo.trim() }],
    });
    setNewName(""); setNewAdmNo("");
    showToast("Student added to roll");
  };

  const addBulk = () => {
    if (!rollClass) return showToast("Select a class", "error");
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const existing = classRolls[rollClass] || [];
    const existingNames = new Set(existing.map(s => s.name.toLowerCase()));
    const newStudents = lines
      .filter(l => !existingNames.has(l.toLowerCase()))
      .map(l => ({ id: uid(), name: l, admNo: "" }));
    if (!newStudents.length) return showToast("All students already in roll", "warning");
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: [...existing, ...newStudents] });
    setBulkText(""); setShowBulk(false);
    showToast(`${newStudents.length} student${newStudents.length !== 1 ? "s" : ""} added`);
  };

  const confirmStudent = (student: RollStudent) => {
    const existing = (classRolls[rollClass] || []);
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: uid(), name: student.name, admNo: student.admNo || "" }],
    });
    showToast(`${student.name} added to roll`);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    const roll = (classRolls[rollClass] || []).map(s =>
      s.id === id ? { ...s, name: editName.trim(), admNo: editAdmNo.trim() } : s
    );
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: roll });
    setEditingId(null);
    showToast("Student updated");
  };

  const removeStudent = (studentId: string) => {
    dispatch({ type: "DELETE_ROLL_STUDENT", className: rollClass, studentId });
    showToast("Student removed from roll");
  };

  // ── Mark Attendance ───────────────────────────────────────────────────────
  const [markClass, setMarkClass] = useState("");
  const [markDate, setMarkDate] = useState(today());
  const [markRecords, setMarkRecords] = useState<Record<string, { status: string | null; note: string }>>({});
  const [markSearch, setMarkSearch] = useState("");

  // FIX: Reset markRecords when class OR date changes
  const handleMarkClassChange = useCallback((cls: string) => {
    setMarkClass(cls);
    setMarkRecords({});
    setMarkSearch("");
  }, []);

  const handleMarkDateChange = useCallback((date: string) => {
    setMarkDate(date);
    setMarkRecords({});
  }, []);

  const markPool = useMemo((): string[] => {
    const roll = classRolls[markClass] || [];
    const fromEntries = [...new Set(entries.filter(e => e.studentClass === markClass).map(e => e.studentName))];
    const rollNames = new Set(roll.map(s => s.name));
    const extra = fromEntries.filter(n => !rollNames.has(n));
    return [...roll.map(s => s.name), ...extra].sort();
  }, [classRolls, markClass, entries]);

  const filteredMark = useMemo(() =>
    markPool.filter(n => n.toLowerCase().includes(markSearch.toLowerCase())),
  [markPool, markSearch]);

  const existingForDate = useMemo(() => {
    const m: Record<string, { status: string; note: string }> = {};
    attendance
      .filter(a => a.studentClass === markClass && a.date === markDate)
      .forEach(a => { m[a.studentName] = { status: a.status, note: a.note || "" }; });
    return m;
  }, [attendance, markClass, markDate]);

  const markSummary = useMemo(() => {
    const all = attendance.filter(a => a.studentClass === markClass && a.date === markDate);
    return {
      present: all.filter(a => a.status === "present").length,
      absent:  all.filter(a => a.status === "absent").length,
      late:    all.filter(a => a.status === "late").length,
      excused: all.filter(a => a.status === "excused").length,
      total:   all.length,
    };
  }, [attendance, markClass, markDate]);

  const setStudentAtt = useCallback((name: string, field: "status" | "note", val: string | null) => {
    setMarkRecords(p => ({ ...p, [name]: { ...(p[name] || { status: null, note: "" }), [field]: val } }));
  }, []);

  const markAll = useCallback((status: string) => {
    const m: Record<string, { status: string; note: string }> = {};
    filteredMark.forEach(n => { m[n] = { ...(markRecords[n] || { status: null, note: "" }), status }; });
    setMarkRecords(prev => ({ ...prev, ...m }));
  }, [filteredMark, markRecords]);

  const saveAttendance = () => {
    if (!markClass) return showToast("Select a class", "error");
    const toSave = Object.entries(markRecords)
      .filter(([, v]) => v?.status)
      .map(([name, v]) => {
        const ex = attendance.find(a => a.studentName === name && a.studentClass === markClass && a.date === markDate);
        return {
          id: ex?.id || uid(),
          studentName: name,
          studentClass: markClass,
          date: markDate,
          status: v.status!,
          note: v.note || "",
          createdAt: ex?.createdAt || new Date().toISOString(),
        };
      });
    if (!toSave.length) return showToast("Mark at least one student", "error");
    dispatch({ type: "BULK_SAVE_ATTENDANCE", payload: toSave });
    setMarkRecords({});
    showToast(`Attendance saved for ${toSave.length} student${toSave.length !== 1 ? "s" : ""}`);
  };

  const unsavedCount = Object.values(markRecords).filter(v => v?.status).length;

  // ── History ───────────────────────────────────────────────────────────────
  const [hClass,  setHClass]  = useState("");
  const [hDate,   setHDate]   = useState(today());
  const [hStatus, setHStatus] = useState("All");
  const [hSearch, setHSearch] = useState("");

  const historyData = useMemo(() => {
    let d = [...attendance];
    if (hClass)          d = d.filter(a => a.studentClass === hClass);
    if (hDate)           d = d.filter(a => a.date === hDate);
    if (hStatus !== "All") d = d.filter(a => a.status === hStatus);
    if (hSearch)         d = d.filter(a => a.studentName.toLowerCase().includes(hSearch.toLowerCase()));
    return d.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendance, hClass, hDate, hStatus, hSearch]);

  const statColor: Record<string, string> = { present:"emerald", absent:"red", late:"amber", excused:"indigo" };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Attendance</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {attendance.length} record{attendance.length !== 1 ? "s" : ""} · {Object.keys(classRolls).length} class roll{Object.keys(classRolls).length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            ["roll",    "Class Rolls", ClipboardList],
            ["mark",    "Mark",        CalendarDays],
            ["history", "History",     Database],
          ] as const).map(([id, label, Icon]) => (
            <Btn key={id} variant={attTab === id ? "primary" : "outline"} size="sm" onClick={() => setAttTab(id)}>
              <Icon size={14} />{label}
            </Btn>
          ))}
        </div>
      </div>

      {/* CLASS ROLLS */}
      {attTab === "roll" && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Select Class to Manage Roll</p>
            <Sel value={rollClass} onChange={(e: any) => handleRollClassChange(e.target.value)}>
              <option value="">Choose a class…</option>
              {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
            </Sel>
            {rollClass && (
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase text-slate-600">{rollClass}</span>
                  <Pill color="blue">{(classRolls[rollClass] || []).length} registered</Pill>
                  {[...new Set(entries.filter(e => e.studentClass === rollClass).map(e => e.studentName))].length > 0 && (
                    <Pill color="green">{[...new Set(entries.filter(e => e.studentClass === rollClass).map(e => e.studentName))].length} from scores</Pill>
                  )}
                </div>
                <div className="flex gap-2">
                  {(classRolls[rollClass]||[]).length > 0 && (
                    <Btn variant="ghost" size="sm" onClick={async () => {
                      const ok = await loadSheetJS();
                      if (!ok) { showToast("Could not load Excel engine","error"); return; }
                      const wb = XLSX.utils.book_new();
                      const rows: any[][] = [["#","Student Name","Adm No."]];
                      (classRolls[rollClass]||[]).forEach((s, i) => rows.push([i+1, s.name, s.admNo||""]));
                      const ws = XLSX.utils.aoa_to_sheet(rows);
                      ws["!cols"] = [{wch:5},{wch:30},{wch:14}];
                      XLSX.utils.book_append_sheet(wb, ws, rollClass);
                      XLSX.writeFile(wb, `${rollClass.replace(/\s+/g,"_")}_Roll.xlsx`);
                      showToast("Roll exported to Excel");
                    }}>
                      📊 Export Roll
                    </Btn>
                  )}
                  <Btn variant="outline" size="sm" onClick={() => setShowBulk(b => !b)}>
                    {showBulk ? <><X size={13} />Close</> : <><Upload size={13} />Bulk / CSV</>}
                  </Btn>
                </div>
              </div>
            )}
          </Card>

          {rollClass && (
            <>
              {showBulk && (
                <Card className="border-2 border-blue-200 overflow-hidden">
                  {/* Tab switcher */}
                  <div className="flex border-b border-blue-200 bg-blue-50">
                    <button
                      type="button"
                      onClick={() => { setCsvImportMode("idle"); setCsvPreview([]); }}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${csvImportMode === "idle" && csvPreview.length === 0 ? "bg-white text-blue-700 border-b-2 border-blue-600" : "text-blue-500 hover:text-blue-700"}`}>
                      📝 Paste Text
                    </button>
                    <button
                      type="button"
                      onClick={() => csvInputRef.current?.click()}
                      className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${csvImportMode === "preview" ? "bg-white text-blue-700 border-b-2 border-blue-600" : "text-blue-500 hover:text-blue-700"}`}>
                      📂 Upload CSV
                    </button>
                  </div>

                  {/* Hidden CSV input */}
                  <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFile} />

                  {/* CSV Preview Mode */}
                  {csvImportMode === "preview" ? (
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black uppercase text-blue-700 tracking-wide">CSV Preview — {csvFileName}</p>
                          <p className="text-xs text-blue-600 mt-0.5">{csvPreview.length} student{csvPreview.length !== 1 ? "s" : ""} detected</p>
                        </div>
                        <button type="button" onClick={() => csvInputRef.current?.click()}
                          className="text-xs font-black uppercase text-blue-500 hover:text-blue-700">
                          Change File
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto border-2 border-blue-200 rounded-xl divide-y divide-blue-100">
                        {csvPreview.slice(0, 50).map((s, i) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="text-xs font-black text-blue-400 w-5 flex-shrink-0">{i + 1}</span>
                            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 font-black text-xs">{s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                            </div>
                            <p className="font-bold text-sm text-slate-800 flex-1 truncate">{s.name}</p>
                            {s.admNo && <span className="text-xs text-slate-400 flex-shrink-0">{s.admNo}</span>}
                          </div>
                        ))}
                        {csvPreview.length > 50 && (
                          <div className="px-4 py-2.5 text-xs text-slate-400 font-bold text-center">
                            +{csvPreview.length - 50} more not shown
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <Btn variant="ghost" onClick={() => { setCsvImportMode("idle"); setCsvPreview([]); }}>Cancel</Btn>
                        <Btn variant="primary" onClick={confirmCSVImport}>
                          <Check size={14} />Import {csvPreview.length} Students
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    /* Paste Text Mode */
                    <div className="p-5 space-y-3">
                      <p className="text-xs text-blue-600 font-medium">
                        One student name per line. Duplicates are automatically skipped.
                      </p>
                      <textarea
                        value={bulkText}
                        onChange={e => setBulkText(e.target.value)}
                        rows={6}
                        placeholder={"Adaeze Okonkwo\nEmeka Nwosu\nFatima Bello\n…"}
                        className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none transition-all resize-none"
                      />
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-xs text-blue-600 font-medium">
                        💡 <span className="font-black">CSV tip:</span> You can also upload a .csv file with columns: <code className="bg-white px-1 rounded">Name, AdmNo</code> — admission numbers are optional.
                      </div>
                      <div className="flex gap-3">
                        <Btn variant="ghost" onClick={() => { setBulkText(""); setShowBulk(false); }}>Cancel</Btn>
                        <Btn variant="primary" onClick={addBulk} disabled={!bulkText.trim()}>
                          <PlusCircle size={14} />Add {bulkText.split("\n").filter(l => l.trim()).length} Students
                        </Btn>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              <Card className="p-5 space-y-3">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Add Individual Student</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Inp value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Student full name"
                      onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                  </div>
                  <Inp value={newAdmNo} onChange={(e: any) => setNewAdmNo(e.target.value)} placeholder="Adm No. (optional)"
                    onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                </div>
                <Btn variant="primary" onClick={addStudent} disabled={!newName.trim()}>
                  <PlusCircle size={14} />Add to Roll
                </Btn>
              </Card>

              {filteredRoll.length === 0 && !rollSearch ? (
                <EmptyState icon={Users} title="No students on roll" subtitle="Add students above or they'll appear from score entries" />
              ) : (
                <Card className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={rollSearch} onChange={e => setRollSearch(e.target.value)}
                        placeholder="Search student or adm no…"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                    </div>
                    <span className="text-xs font-black text-slate-400 flex-shrink-0">{filteredRoll.length} student{filteredRoll.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {filteredRoll.map((s, i) => (
                      <div key={s.id} className={`px-5 py-3.5 flex items-center gap-3 ${s.suggested ? "bg-blue-50" : ""}`}>
                        <span className="text-xs font-black text-slate-400 w-6 flex-shrink-0 text-center">{i + 1}</span>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.suggested ? "bg-blue-200" : "bg-slate-200"}`}>
                          <span className={`font-black text-sm ${s.suggested ? "text-blue-700" : "text-slate-600"}`}>
                            {s.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        {editingId === s.id ? (
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2 bg-white border-2 border-blue-300 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                              onKeyDown={e => e.key === "Enter" && saveEdit(s.id)} />
                            <input value={editAdmNo} onChange={e => setEditAdmNo(e.target.value)}
                              placeholder="Adm No."
                              className="w-28 px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500" />
                            <Btn size="sm" variant="success" onClick={() => saveEdit(s.id)}><Check size={13} />Save</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Btn>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-slate-900 truncate">{s.name}</p>
                            <p className="text-xs text-slate-400">
                              {s.admNo ? `Adm: ${s.admNo}` : "No adm no."}
                              {s.suggested && <span className="ml-2 text-blue-600 font-black">← from score entry</span>}
                            </p>
                          </div>
                        )}
                        {editingId !== s.id && (
                          <div className="flex gap-1.5 flex-shrink-0">
                            {s.suggested ? (
                              <Btn size="sm" variant="primary" onClick={() => confirmStudent(s)}><Check size={13} />Confirm</Btn>
                            ) : (
                              <>
                                <button onClick={() => { setEditingId(s.id); setEditName(s.name); setEditAdmNo(s.admNo || ""); }}
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => removeStudent(s.id)}
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
          {!rollClass && <EmptyState icon={BookMarked} title="Select a class to manage its roll" subtitle="You can add, edit or remove students from each class roll" />}
        </div>
      )}

      {/* MARK ATTENDANCE */}
      {attTab === "mark" && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Session Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Sel value={markClass} onChange={(e: any) => handleMarkClassChange(e.target.value)}>
                <option value="">Select class…</option>
                {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
              </Sel>
              <Inp type="date" value={markDate} onChange={(e: any) => handleMarkDateChange(e.target.value)} max={today()} />
            </div>
            {markClass && markDate && (
              <div className="grid grid-cols-4 gap-2 pt-1">
                {([
                  ["Present", markSummary.present, "bg-emerald-50 text-emerald-700"],
                  ["Absent",  markSummary.absent,  "bg-red-50 text-red-700"],
                  ["Late",    markSummary.late,    "bg-amber-50 text-amber-700"],
                  ["Excused", markSummary.excused, "bg-indigo-50 text-indigo-700"],
                ] as const).map(([l, v, c]) => (
                  <div key={l} className={`${c} rounded-xl p-3 text-center`}>
                    <p className="text-2xl font-black">{v}</p>
                    <p className="text-xs font-black uppercase opacity-70">{l}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {markClass ? (
            markPool.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students in this class"
                subtitle="Add students to the class roll first, or enter scores to auto-populate"
                action={<Btn variant="primary" size="sm" onClick={() => setAttTab("roll")}><ClipboardList size={14} />Go to Class Rolls</Btn>}
              />
            ) : (
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={markSearch} onChange={e => setMarkSearch(e.target.value)}
                      placeholder="Search student…"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                    <span className="text-xs font-black uppercase text-slate-400 self-center hidden sm:block">All:</span>
                    {ATT_STATUSES.map(({ key, label, icon, color }) => (
                      <button key={key} onClick={() => markAll(key)}
                        className={`text-xs font-black uppercase px-3 py-2 rounded-xl transition-opacity hover:opacity-80 ${color === "emerald" ? "bg-emerald-500 text-white" : color === "red" ? "bg-red-500 text-white" : color === "amber" ? "bg-amber-500 text-white" : "bg-indigo-500 text-white"}`}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {filteredMark.map((name, i) => {
                    const saved = existingForDate[name];
                    const cur = markRecords[name];
                    const status = cur?.status || saved?.status || null;
                    const note = cur?.note !== undefined ? cur.note : (saved?.note || "");
                    const rowBg = status === "present" ? "bg-emerald-50" : status === "absent" ? "bg-red-50" : status === "late" ? "bg-amber-50" : status === "excused" ? "bg-indigo-50" : "hover:bg-slate-50";
                    return (
                      <div key={name} className={`px-5 py-3.5 transition-colors ${rowBg}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-black text-slate-400 w-6 text-center flex-shrink-0">{i + 1}</span>
                          <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-slate-600 font-black text-sm">{name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                          </div>
                          <p className="font-black text-sm text-slate-900 flex-1 min-w-0 truncate">{name}</p>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {ATT_STATUSES.map(({ key, icon, color }) => {
                              const active = status === key;
                              const bg = active
                                ? (color === "emerald" ? "bg-emerald-500 border-emerald-500" : color === "red" ? "bg-red-500 border-red-500" : color === "amber" ? "bg-amber-500 border-amber-500" : "bg-indigo-500 border-indigo-500")
                                : "bg-white border-slate-200 hover:border-slate-300 text-slate-400";
                              return (
                                <button key={key}
                                  onClick={() => setStudentAtt(name, "status", status === key ? null : key)}
                                  className={`w-9 h-9 rounded-xl text-sm font-black border-2 transition-all ${bg} ${active ? "text-white" : ""}`}>
                                  {icon}
                                </button>
                              );
                            })}
                          </div>
                          {saved && !cur && <span className="text-xs font-black text-slate-400 uppercase">Saved</span>}
                        </div>
                        {status && (
                          <div className="mt-2 ml-20">
                            <input value={note} onChange={e => setStudentAtt(name, "note", e.target.value)}
                              placeholder="Note (optional)…"
                              className="w-full px-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-xs font-medium focus:border-blue-400 outline-none transition-all" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 font-bold">{unsavedCount} unsaved change{unsavedCount !== 1 ? "s" : ""}</p>
                  <Btn variant="primary" onClick={saveAttendance} disabled={unsavedCount === 0}>
                    <Save size={14} />Save Attendance
                  </Btn>
                </div>
              </Card>
            )
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Select a class to mark attendance"
              subtitle="Choose a class and date above to begin"
              action={<Btn variant="outline" size="sm" onClick={() => setAttTab("roll")}><ClipboardList size={14} />Manage Class Rolls</Btn>}
            />
          )}
        </div>
      )}

      {/* HISTORY */}
      {attTab === "history" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Filter Records</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="relative col-span-2 md:col-span-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={hSearch} onChange={e => setHSearch(e.target.value)} placeholder="Search name…"
                  className="w-full pl-9 pr-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
              </div>
              <select value={hClass} onChange={e => setHClass(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                <option value="">All Classes</option>
                {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="date" value={hDate} onChange={e => setHDate(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
              <select value={hStatus} onChange={e => setHStatus(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                <option value="All">All Statuses</option>
                {ATT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {(hClass || hStatus !== "All" || hSearch) && (
              <div className="flex items-center gap-2 flex-wrap">
                {hSearch  && <Pill color="blue">"{hSearch}"</Pill>}
                {hClass   && <Pill color="indigo">{hClass}</Pill>}
                {hDate    && <Pill color="green">{fmtDate(hDate)}</Pill>}
                {hStatus !== "All" && <Pill color={statColor[hStatus] || "slate"}>{hStatus}</Pill>}
                <span className="text-xs text-slate-400 font-bold">{historyData.length} record{historyData.length !== 1 ? "s" : ""}</span>
                <button onClick={() => { setHSearch(""); setHClass(""); setHDate(today()); setHStatus("All"); }}
                  className="text-xs font-black uppercase text-red-400 hover:text-red-600 flex items-center gap-1">
                  <X size={11} />Clear
                </button>
              </div>
            )}
          </Card>

          {historyData.length === 0 ? (
            <EmptyState icon={Clock} title="No attendance records found" subtitle="Mark attendance in the Mark tab to see history here" />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Student", "Class", "Date", "Status", "Note", ""].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {historyData.map(a => {
                      const sc: Record<string, string> = {
                        present: "bg-emerald-100 text-emerald-700",
                        absent:  "bg-red-100 text-red-700",
                        late:    "bg-amber-100 text-amber-700",
                        excused: "bg-indigo-100 text-indigo-700",
                      };
                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-black text-sm text-slate-900">{a.studentName}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{a.studentClass}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{fmtDate(a.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${sc[a.status] || "bg-slate-100 text-slate-600"}`}>{a.status}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{a.note || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => dispatch({ type: "DELETE_ATTENDANCE", id: a.id })}
                              className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Pending CA draft row — exam input + finalize
// ─────────────────────────────────────────────────────────────────────────────
function PendingDraftRow({ draft, onFinalize, onDelete }: {
  draft: { id: string; studentName: string; studentClass: string; subject: string; caScore: number; createdAt: string };
  onFinalize: (id: string, exam: string) => void;
  onDelete: (id: string) => void;
}) {
  const [exam, setExam] = useState("");
  const { date, time } = fmtTs(draft.createdAt);
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-slate-900 truncate">{draft.studentName}</p>
        <p className="text-xs text-slate-500 truncate">
          {draft.studentClass} · {draft.subject} · CA <span className="font-black text-amber-700">{draft.caScore}</span>
          <span className="text-slate-300"> · {date} {time}</span>
        </p>
      </div>
      <input
        type="number" min="0" max="60" step="0.5" placeholder="Exam"
        value={exam}
        onChange={e => { const v = e.target.value; if (v === "" || (+v >= 0 && +v <= 60)) setExam(v); }}
        onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
        className="w-20 px-2 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg text-sm font-black text-center focus:border-amber-500 focus:bg-white outline-none"
      />
      <button
        onClick={() => { if (exam === "") return; onFinalize(draft.id, exam); setExam(""); }}
        disabled={exam === ""}
        className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-black uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-600 transition-colors flex items-center gap-1"
      >
        <Check size={12} />Finalize
      </button>
      <button
        onClick={() => onDelete(draft.id)}
        className="p-2 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all"
        title="Discard draft"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, dispatch] = useReducer(appReducer, initialState);
  const { toast, showToast } = useToast();
  const adminPinRef = useRef("1234"); // plain — verifyPIN handles raw strings
  const logoRef = useRef<HTMLInputElement>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [dlg, setDlg] = useState<any>(null);
  const [showBin, setShowBin] = useState(false);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ loggedIn: boolean; user: StaffMember | null }>({ loggedIn: false, user: null });
  const [loginId, setLoginId] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotInput, setForgotInput] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [dbClass,  setDbClass]  = useState("");
  const [dbDate,   setDbDate]   = useState("");
  const [rpSearch, setRpSearch] = useState("");
  const [rpClass,  setRpClass]  = useState("All");
  const [activeReport, setActiveReport] = useState<any>(null);
  const [scoreForm, setScoreForm] = useState({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" });

  // CA-only drafts: stored separately until exam scores are ready, then promoted to entries.
  type CADraft = { id: string; studentName: string; studentClass: string; subject: string; caScore: number; term: string; session: string; enteredBy: string; createdAt: string };
  const DRAFTS_KEY = "gm_score_drafts_v1";
  const [caDrafts, setCaDrafts] = useState<CADraft[]>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]"); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(caDrafts)); } catch {} }, [caDrafts]);

  const { entries, bin, logs, attendance, classRolls, staffList, schoolSettings } = appState;
  const isAdmin = !auth.user;
  const can = useCallback((p: string) => isAdmin || (auth.user?.permissions?.[p] ?? false), [isAdmin, auth.user]);

  const subjectList = useMemo(() => {
    const cat = Object.values(CURRICULUM).find(c => c.classes.includes(scoreForm.studentClass));
    return cat ? cat.subjects : [];
  }, [scoreForm.studentClass]);

  const allKnownStudents = useMemo(() => {
    const fromRolls = Object.entries(classRolls).flatMap(([cls, students]) =>
      students.map(s => ({ name: s.name, class: cls }))
    );
    const fromEntries = entries.map(e => ({ name: e.studentName, class: e.studentClass }));
    const map: Record<string, { name: string; class: string }> = {};
    [...fromRolls, ...fromEntries].forEach(s => { map[`${s.name}||${s.class}`] = s; });
    return Object.values(map);
  }, [classRolls, entries]);

  const classSuggestions = useMemo(() => {
    if (!scoreForm.studentClass) return [];
    return allKnownStudents.filter(s => s.class === scoreForm.studentClass).map(s => s.name).sort();
  }, [allKnownStudents, scoreForm.studentClass]);

  // Term-scoped entries: records/reports/score-list show only the active term+session.
  // Older terms remain saved; switching the Current Term in Settings reveals their data.
  const termEntries = useMemo(() => entries.filter(e =>
    (!e.term || e.term === schoolSettings.term) &&
    (!e.session || e.session === schoolSettings.session)
  ), [entries, schoolSettings.term, schoolSettings.session]);

  const studentList = useMemo(() => {
    const m: Record<string, { name: string; class: string; id: string }> = {};
    termEntries.forEach(e => {
      const k = `${e.studentName}||${e.studentClass}`;
      if (!m[k]) m[k] = { name: e.studentName, class: e.studentClass, id: k };
    });
    return Object.values(m);
  }, [termEntries]);

  const filteredStudents = useMemo(() =>
    studentList.filter(s =>
      s.name.toLowerCase().includes(rpSearch.toLowerCase()) &&
      (rpClass === "All" || s.class === rpClass)
    ),
  [studentList, rpSearch, rpClass]);

  const filteredEntries = useMemo(() =>
    termEntries.filter(e =>
      (!dbSearch || e.studentName.toLowerCase().includes(dbSearch.toLowerCase())) &&
      (!dbClass  || e.studentClass === dbClass) &&
      (!dbDate   || e.createdAt.slice(0, 10) === dbDate)
    ),
  [termEntries, dbSearch, dbClass, dbDate]);

  const curC = useMemo(() =>
    activeReport
      ? (appState.comments[activeReport.id] || { teacher:"", principal:"", teacherSig:"", principalSig:"", daysOpen:"", daysPresent:"", daysAbsent:"" })
      : { teacher:"", principal:"", teacherSig:"", principalSig:"", daysOpen:"", daysPresent:"", daysAbsent:"" },
  [activeReport, appState.comments]);

  const attRate = useMemo(() => {
    const o = parseInt(curC.daysOpen) || 0, p = parseInt(curC.daysPresent) || 0;
    return o > 0 ? Math.round(p / o * 100) : null;
  }, [curC]);

  const navigate = useCallback((id: string) => {
    setActiveTab(id);
    setMenuOpen(false);
    setStaffDetailId(null);
  }, []);

  const TABS = useMemo(() => [
    { id:"dashboard",  label:"Dashboard",  icon:LayoutDashboard, show:true,                                   primary:true },
    { id:"entry",      label:"Score Entry",icon:PlusCircle,       show:can("scoreEntry"),                     primary:true },
    { id:"database",   label:"Records",    icon:Database,         show:isAdmin||can("manageRecords")||can("scoreEntry"), primary:true },
    { id:"reports",    label:"Reports",    icon:FileText,         show:can("viewReports"),                    primary:true },
    { id:"attendance", label:"Attendance", icon:CalendarDays,     show:can("scoreEntry")||isAdmin,            primary:false },
    { id:"staff",      label:"Staff",      icon:Users,            show:isAdmin,                               primary:false },
    { id:"settings",   label:"Settings",   icon:Settings,         show:isAdmin,                               primary:false },
  ].filter(t => t.show), [can, isAdmin]);

  const primaryTabs = useMemo(() => TABS.filter(t => t.primary), [TABS]);
  const moreTabs    = useMemo(() => TABS.filter(t => !t.primary), [TABS]);

  const doLogin = useCallback(async () => {
    setLoginErr("");

    if (loginId.toLowerCase() === "admin") {
      if (!loginPass) return setLoginErr("Enter a password");
      const ok = await verifyPIN(loginPass, adminPinRef.current);
      if (!ok) return setLoginErr("Incorrect password. Default is: 1234");
      // Migrate plain PIN to hash on first successful login
      if (!adminPinRef.current.startsWith("h:") && !adminPinRef.current.startsWith("p:")) {
        adminPinRef.current = await ensureHashed(adminPinRef.current);
      }
      setAuth({ loggedIn: true, user: null });
      return;
    }

    // Staff login — match by name
    const s = staffList.find(st => st.name.toLowerCase() === loginId.toLowerCase());
    if (!s) return setLoginErr("Invalid name or PIN. Check spelling.");
    if (s.status === "revoked") return setLoginErr("Your access has been revoked. Contact admin.");

    const pinOk = await verifyPIN(loginPass, s.pin);
    if (!pinOk) return setLoginErr("Invalid name or PIN.");

    // Migrate plain PIN to hash on first successful login
    if (!s.pin.startsWith("h:") && !s.pin.startsWith("p:")) {
      const hashed = await ensureHashed(s.pin);
      dispatch({ type: "SAVE_STAFF", payload: { ...s, pin: hashed, updatedAt: new Date().toISOString() } });
    }

    setAuth({ loggedIn: true, user: s });
    if (s.status === "restricted") showToast("Account restricted — limited access.", "warning");
  }, [loginId, loginPass, staffList, showToast]);

  const submitScore = useCallback(() => {
    const { studentName, studentClass, subject, caScore, examScore } = scoreForm;
    if (!studentName.trim() || !studentClass || !subject || caScore === "" || examScore === "")
      return showToast("Fill in all fields.", "error");
    if (entries.some(e =>
      e.studentName.toLowerCase().trim() === studentName.toLowerCase().trim() &&
      e.studentClass === studentClass && e.subject === subject
    )) return showToast(`${subject} already exists for ${studentName}.`, "error");
    const ca = parseFloat(caScore) || 0, ex = parseFloat(examScore) || 0;
    if (ca < 0 || ca > 40) return showToast("CA score must be 0–40", "error");
    if (ex < 0 || ex > 60) return showToast("Exam score must be 0–60", "error");
    dispatch({
      type: "ADD_ENTRY",
      payload: {
        studentName: studentName.trim(), studentClass, subject,
        caScore: ca, examScore: ex, id: uid(), total: ca + ex,
        createdAt: new Date().toISOString(),
        term: schoolSettings.term,
        session: schoolSettings.session,
        enteredBy: isAdmin ? "Admin" : (auth.user?.name || "Staff"),
      },
    });
    showToast("Score saved");
    // Keep name & class — only clear scores so user can quickly add next subject
    setScoreForm(f => ({ ...f, subject: "", caScore: "", examScore: "" }));
  }, [scoreForm, entries, showToast, schoolSettings.term, schoolSettings.session, isAdmin, auth.user]);

  // Save CA-only draft (exam pending). Drafts are scoped to the current term/session.
  const saveCADraft = useCallback(() => {
    const { studentName, studentClass, subject, caScore } = scoreForm;
    if (!studentName.trim() || !studentClass || !subject || caScore === "")
      return showToast("Enter name, class, subject and CA.", "error");
    const ca = parseFloat(caScore) || 0;
    if (ca < 0 || ca > 40) return showToast("CA score must be 0–40", "error");
    if (entries.some(e =>
      e.studentName.toLowerCase().trim() === studentName.toLowerCase().trim() &&
      e.studentClass === studentClass && e.subject === subject &&
      (!e.term || e.term === schoolSettings.term) &&
      (!e.session || e.session === schoolSettings.session)
    )) return showToast(`${subject} already finalized for ${studentName}.`, "error");
    setCaDrafts(prev => {
      const filtered = prev.filter(d =>
        !(d.studentName.toLowerCase().trim() === studentName.toLowerCase().trim() &&
          d.studentClass === studentClass && d.subject === subject &&
          d.term === schoolSettings.term && d.session === schoolSettings.session)
      );
      return [...filtered, {
        id: uid(),
        studentName: studentName.trim(),
        studentClass, subject, caScore: ca,
        term: schoolSettings.term, session: schoolSettings.session,
        enteredBy: isAdmin ? "Admin" : (auth.user?.name || "Staff"),
        createdAt: new Date().toISOString(),
      }];
    });
    showToast("CA draft saved — exam pending");
    setScoreForm(f => ({ ...f, subject: "", caScore: "", examScore: "" }));
  }, [scoreForm, entries, showToast, schoolSettings.term, schoolSettings.session, isAdmin, auth.user]);

  // Promote a CA draft to a finalized entry by adding the exam score.
  const finalizeDraft = useCallback((draftId: string, examStr: string) => {
    const d = caDrafts.find(x => x.id === draftId);
    if (!d) return;
    const ex = parseFloat(examStr);
    if (isNaN(ex) || ex < 0 || ex > 60) return showToast("Exam score must be 0–60", "error");
    if (entries.some(e =>
      e.studentName.toLowerCase().trim() === d.studentName.toLowerCase().trim() &&
      e.studentClass === d.studentClass && e.subject === d.subject &&
      (!e.term || e.term === d.term) && (!e.session || e.session === d.session)
    )) { setCaDrafts(p => p.filter(x => x.id !== draftId)); return showToast("Already finalized — draft removed.", "warning"); }
    dispatch({
      type: "ADD_ENTRY",
      payload: {
        id: uid(),
        studentName: d.studentName, studentClass: d.studentClass, subject: d.subject,
        caScore: d.caScore, examScore: ex, total: d.caScore + ex,
        createdAt: new Date().toISOString(),
        term: d.term, session: d.session,
        enteredBy: isAdmin ? "Admin" : (auth.user?.name || d.enteredBy || "Staff"),
      },
    });
    setCaDrafts(p => p.filter(x => x.id !== draftId));
    showToast(`${d.subject} finalized for ${d.studentName}`);
  }, [caDrafts, entries, showToast, isAdmin, auth.user]);

  const deleteDraft = useCallback((draftId: string) => {
    setCaDrafts(p => p.filter(x => x.id !== draftId));
    showToast("Draft removed");
  }, [showToast]);

  // Drafts visible in current term/session only.
  const termDrafts = useMemo(() => caDrafts.filter(d =>
    d.term === schoolSettings.term && d.session === schoolSettings.session
  ), [caDrafts, schoolSettings.term, schoolSettings.session]);

  const openReport = useCallback((student: { name: string; class: string; id: string }) => {
    const inTerm = (e: Entry) =>
      (!e.term || e.term === schoolSettings.term) &&
      (!e.session || e.session === schoolSettings.session);
    const scoped = entries.filter(inTerm);
    const records = scoped.filter(e =>
      e.studentName.toLowerCase() === student.name.toLowerCase() && e.studentClass === student.class
    );
    if (!records.length) return showToast("No records found for current term", "error");
    const names = [...new Set(scoped.filter(e => e.studentClass === student.class).map(e => e.studentName.toLowerCase().trim()))];
    const standings = names
      .map(n => ({ name: n, total: scoped.filter(e => e.studentName.toLowerCase().trim() === n && e.studentClass === student.class).reduce((a, c) => a + c.total, 0) }))
      .sort((a, b) => b.total - a.total);
    const pos = standings.findIndex(s => s.name === student.name.toLowerCase().trim()) + 1;
    const total = records.reduce((a, c) => a + c.total, 0);
    setActiveReport({
      id: student.id,
      name: student.name,
      class: student.class,
      records,
      position: getOrdinal(pos),
      classCount: names.length,
      summary: { total, obtainable: records.length * 100, avg: records.length ? (total / records.length).toFixed(1) : "0.0" },
    });
    setActiveTab("reports");
  }, [entries, showToast, schoolSettings.term, schoolSettings.session]);

  const saveStaff = useCallback(async (sd: StaffMember) => {
    const isEdit = appState.staffList.some(s => s.id === sd.id);
    // Hash PIN if it's a new raw value (not already hashed/prefixed)
    const finalPin = sd.pin ? await ensureHashed(sd.pin) : (appState.staffList.find(s => s.id === sd.id)?.pin || "");
    dispatch({ type: "SAVE_STAFF", payload: { ...sd, pin: finalPin } });
    showToast(`${sd.name} ${isEdit ? "updated" : "created successfully"}`);
    setDlg(null);
  }, [appState.staffList, showToast]);

  const ctxValue = useMemo<AppCtxType>(() => ({ state: appState, dispatch, showToast }), [appState, showToast]);

  // ── Auto-save to localStorage whenever state changes ──────────────────────
  useEffect(() => {
    debouncedSaveDB(appState);
  }, [appState]);

  // ── Firebase real-time listener: pull remote changes into local state ──────
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const lastLocalTs = useRef<string>("");
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    const unsub = subscribeFirebase((remote) => {
      // Ignore our own pushes (compare _updatedAt to avoid echo loops)
      if ((remote as any)._deviceId === getDeviceId()) return;
      if ((remote as any)._updatedAt === lastLocalTs.current) return;
      // Merge: remote wins on conflict (principal's office is source of truth)
      lastLocalTs.current = (remote as any)._updatedAt || "";
      setSyncStatus("synced");
      // Save to localStorage and reload to apply remote state
      saveDB(remote as AppState);
      showToast("☁️ Cloud sync received — refreshing…", "warning");
      setTimeout(() => window.location.reload(), 1800);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Firebase real-time subscription (multi-device sync) ───────────────────
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    const deviceId = getDeviceId();
    const unsub = subscribeFirebase((remote: any) => {
      // Only apply updates from OTHER devices to avoid echo loop
      if (remote._deviceId && remote._deviceId === deviceId) return;
      if (!remote._updatedAt) return;
      // Compare timestamps — only apply if remote is newer
      const remoteTs = new Date(remote._updatedAt).getTime();
      const localTs  = appState.logs[0]?.ts ? new Date(appState.logs[0].ts).getTime() : 0;
      if (remoteTs > localTs + 5000) { // 5 second grace period
        // Apply remote state
        const { _deviceId: _d, _updatedAt: _u, ...cleanState } = remote;
        Object.keys(cleanState).forEach(key => {
          if ((initialState as any)[key] !== undefined) {
            dispatch({ type: "__HYDRATE__", key, value: cleanState[key] });
          }
        });
        showToast("Synced from another device ☁️", "success");
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Forgot password ────────────────────────────────────────────────────────
  if (!auth.loggedIn && forgotOpen) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-amber-500">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-amber-100 rounded-2xl mb-3"><ShieldAlert size={28} className="text-amber-600" /></div>
          <h2 className="text-xl font-black text-slate-900">Password Recovery</h2>
        </div>
        {forgotStep === 1 ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 font-medium">
              Enter the registered school name to verify identity.
            </div>
            <Inp
              label="Registered School Name"
              value={forgotInput}
              onChange={(e: any) => setForgotInput(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && (forgotInput.toLowerCase() === schoolSettings.name.toLowerCase() ? setForgotStep(2) : showToast("School name does not match", "error"))}
              placeholder={schoolSettings.name}
            />
            <Btn variant="primary" size="lg" className="w-full"
              onClick={() => forgotInput.toLowerCase() === schoolSettings.name.toLowerCase() ? setForgotStep(2) : showToast("School name does not match", "error")}>
              Verify Identity
            </Btn>
            <button onClick={() => { setForgotOpen(false); setForgotStep(1); setForgotInput(""); }}
              className="w-full text-xs font-black uppercase text-slate-400 hover:text-slate-600 py-2">
              ← Back to Login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-3">
              <Check size={28} className="text-emerald-500 mx-auto" />
              <p className="text-xs font-black uppercase text-emerald-700">Identity Verified</p>
              <p className="text-xs text-slate-500">Admin accepts any non-empty password. Staff use full name + assigned PIN.</p>
              <div className="bg-white border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Default Admin PIN</p>
                <p className="text-3xl font-black text-slate-900 tracking-widest">1234</p>
              </div>
            </div>
            <Btn variant="ghost" size="lg" className="w-full" onClick={() => { setForgotOpen(false); setForgotStep(1); setForgotInput(""); }}>
              Back to Login
            </Btn>
          </div>
        )}
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!auth.loggedIn) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-blue-600">
        <div className="text-center mb-8">
          <SchoolLogo logoUrl={schoolLogo} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-900">{schoolSettings.name}</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Staff Authentication</p>
        </div>
        <div className="space-y-4">
          <Inp label="Name / Username" value={loginId} onChange={(e: any) => { setLoginId(e.target.value); setLoginErr(""); }} placeholder="admin or staff full name" />
          <Field label="Password / PIN" error={loginErr}>
            <input
              type="password"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setLoginErr(""); }}
              onKeyDown={e => e.key === "Enter" && doLogin()}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm focus:border-blue-500 focus:bg-white outline-none transition-all"
            />
          </Field>
          <div className="text-right -mt-1">
            <button onClick={() => setForgotOpen(true)} className="text-xs font-black uppercase text-blue-500 hover:text-blue-700 transition-colors">
              Forgot Password?
            </button>
          </div>
          <Btn variant="primary" size="lg" className="w-full" onClick={doLogin}>Launch Portal</Btn>
          <p className="text-xs text-slate-400 text-center">
            Admin: <code className="font-black bg-slate-100 px-1 rounded">admin</code> + password <code className="font-black bg-slate-100 px-1 rounded">1234</code> · Staff: full name + PIN
          </p>
        </div>
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── Main App ───────────────────────────────────────────────────────────────
  return (
    <AppCtx.Provider value={ctxValue}>
      <div className="flex h-screen overflow-hidden bg-slate-100">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 flex-shrink-0">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <SchoolLogo logoUrl={schoolLogo} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-black text-sm text-slate-900 truncate">{schoolSettings.name}</p>
              <p className="text-xs text-slate-400">{schoolSettings.term}</p>
            </div>
            {/* Cloud sync indicator */}
            {FIREBASE_ENABLED && (
              <div title="Firebase sync active" className={`w-2 h-2 rounded-full flex-shrink-0 ${syncStatus === "synced" ? "bg-emerald-500" : "bg-blue-400 animate-pulse"}`} />
            )}
          </div>
          <div className="px-4 py-3 border-b border-slate-100">
            <div className={`flex items-center gap-2.5 p-2.5 rounded-xl ${isAdmin ? "bg-blue-50" : "bg-slate-50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin ? "bg-blue-600" : "bg-indigo-500"}`}>
                {isAdmin ? <Shield size={14} /> : <span className="font-black text-xs">{auth.user!.name[0]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "Super Admin" : auth.user!.name}</p>
                <p className="text-xs text-slate-400 truncate">{isAdmin ? "Full Access" : auth.user!.role}</p>
              </div>
              {auth.user && <StatusPill status={auth.user.status} />}
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => navigate(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                <t.icon size={18} className="flex-shrink-0" />
                <span className="text-sm font-bold">{t.label}</span>
                {t.id === "database" && bin.length > 0 && (
                  <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100">
            <button onClick={() => setShowLogout(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-sm group">
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0 z-40 relative">
            <div className="flex items-center gap-2.5">
              <SchoolLogo logoUrl={schoolLogo} size="xs" />
              <p className="font-black text-sm text-slate-900 truncate max-w-[160px]">{schoolSettings.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowLogout(true)} className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                <LogOut size={18} />
              </button>
              <button onClick={() => setMenuOpen(o => !o)}
                className={`p-2 rounded-lg transition-all ${menuOpen ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                <Menu size={20} />
              </button>
            </div>
          </header>

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden absolute top-[57px] left-0 right-0 bg-white border-b border-slate-100 shadow-xl z-50 px-4 py-3 space-y-1">
              <div className={`flex items-center gap-2.5 p-3 rounded-xl mb-3 ${isAdmin ? "bg-blue-50" : "bg-slate-50"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin ? "bg-blue-600" : "bg-indigo-500"}`}>
                  {isAdmin ? <Shield size={14} /> : <span className="font-black text-xs">{auth.user!.name[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "Super Admin" : auth.user!.name}</p>
                  <p className="text-xs text-slate-400">{isAdmin ? "Full Access" : auth.user!.role}</p>
                </div>
                {auth.user && <StatusPill status={auth.user.status} />}
              </div>
              <p className="text-xs font-black uppercase text-slate-400 tracking-wide px-2 pb-1">Navigation</p>
              {TABS.map(t => (
                <button key={t.id} onClick={() => navigate(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600 font-black" : "text-slate-600 font-bold hover:bg-slate-50"}`}>
                  <t.icon size={18} className="flex-shrink-0" />
                  <span className="text-sm">{t.label}</span>
                  {t.id === "database" && bin.length > 0 && (
                    <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                  )}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-100 mt-1">
                <button onClick={() => { setShowLogout(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm">
                  <LogOut size={18} />Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Main content — FIX: backdrop closes menu on tap */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative">
            {menuOpen && (
              <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
            )}
            <div className="max-w-5xl mx-auto space-y-6 pb-8">

              {/* DASHBOARD */}
              {activeTab === "dashboard" && (() => {
                const who = isAdmin ? "Admin" : (auth.user?.name || "Staff");
                const visibleLogs = isAdmin
                  ? logs
                  : logs.filter((l: any) => (l.actor || "") === (auth.user?.name || ""));
                return (
                <>
                  <div className={`rounded-2xl p-5 ${isAdmin ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white" : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"}`}>
                    <p className="text-xs font-black uppercase tracking-widest opacity-80">{isAdmin ? "Administrator Console" : "Staff Workspace"}</p>
                    <h1 className="text-2xl md:text-3xl font-black mt-1">{timeGreeting()}, {who}!</h1>
                    <p className="text-xs md:text-sm opacity-90 mt-1">{schoolSettings.term} · {schoolSettings.session}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(isAdmin ? ([
                      ["Students",     studentList.length,                                                          "border-l-blue-500"],
                      ["Records (Term)", termEntries.length,                                                         "border-l-emerald-500"],
                      ["Active Staff", `${staffList.filter(s => s.status === "active").length}/${staffList.length}`,"border-l-indigo-500"],
                    ] as const) : ([
                      ["My Entries (Term)", termEntries.filter(e => (e.enteredBy || "") === (auth.user?.name || "")).length, "border-l-emerald-500"],
                      ["Classes", (auth.user?.assignedClasses?.length || 0), "border-l-blue-500"],
                      ["My Actions", visibleLogs.length, "border-l-indigo-500"],
                    ] as const)).map(([l, v, a]) => (
                      <Card key={l} className={`p-5 border-l-4 ${a}`}>
                        <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-1">{l}</p>
                        <p className="text-2xl font-black text-slate-900">{v}</p>
                      </Card>
                    ))}
                    <Card className="p-5 bg-slate-900 border-slate-900 col-span-2 md:col-span-1">
                      <p className="text-xs font-black uppercase text-blue-400 tracking-wide mb-1">Session</p>
                      <p className="text-lg font-black text-white leading-tight">{schoolSettings.session || "—"}</p>
                      <p className="text-xs text-slate-400 mt-1 font-bold">{schoolSettings.term || "—"}</p>
                    </Card>
                  </div>
                  {visibleLogs.length > 0 && (
                    <Card>
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <p className="text-sm font-black uppercase text-slate-600">{isAdmin ? "Live Staff Activity" : "My Recent Activity"}</p>
                        {isAdmin && <span className="ml-auto text-xs font-bold text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Real-time</span>}
                      </div>
                      <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                        {visibleLogs.slice(0, isAdmin ? 30 : 15).map((log: any) => {
                          const { date, time } = fmtTs(log.ts);
                          const ac = log.action === "Deleted" ? "bg-red-100 text-red-600" : log.action === "Restored" ? "bg-emerald-100 text-emerald-700" : log.action.includes("Revok") ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
                          return (
                            <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 ${ac}`}>{log.action}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-slate-900 truncate">
                                    {log.student}
                                    {isAdmin && log.actor && (
                                      <span className="ml-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">by {log.actor}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-slate-500 truncate">{log.subject}{log.detail && ` · ${log.detail}`}</p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-slate-500">{time}</p>
                                <p className="text-xs text-slate-400">{date}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </>
                );
              })()}

              {/* SCORE ENTRY */}
              {activeTab === "entry" && can("scoreEntry") && (() => {
                const draftMatch = termDrafts.find(d =>
                  d.studentName.toLowerCase().trim() === scoreForm.studentName.toLowerCase().trim() &&
                  d.studentClass === scoreForm.studentClass && d.subject === scoreForm.subject
                );
                return (
                <div className="max-w-xl mx-auto space-y-4">
                  {/* Term/Session banner — clarifies which period this entry belongs to */}
                  <div className="rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CalendarDays size={16} className="text-amber-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Saving to</p>
                        <p className="text-sm font-black text-amber-900 truncate">{schoolSettings.term} · {schoolSettings.session}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <select
                        value={schoolSettings.term}
                        onChange={(e) => { dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { term: e.target.value } }); showToast(`Switched to ${e.target.value}`); }}
                        className="px-3 py-1.5 bg-white border-2 border-amber-200 rounded-lg text-xs font-black text-amber-800 outline-none"
                        title="Switch term"
                      >
                        {TERMS.map(t => <option key={t}>{t}</option>)}
                      </select>
                    )}
                  </div>

                  <Card className="overflow-hidden">
                    <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
                      <BookOpen size={18} className="text-white/80" />
                      <p className="text-white font-black uppercase tracking-widest text-sm">Score Submission</p>
                    </div>
                    <div className="p-6 space-y-5">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">Student Name</label>
                        <input
                          list="student-suggestions"
                          value={scoreForm.studentName}
                          onChange={e => setScoreForm(f => ({ ...f, studentName: e.target.value }))}
                          placeholder="Student full name"
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300"
                        />
                        <datalist id="student-suggestions">
                          {classSuggestions.map(n => <option key={n} value={n} />)}
                        </datalist>
                        {classSuggestions.length > 0 && (
                          <p className="text-xs text-blue-600 font-bold">{classSuggestions.length} student{classSuggestions.length !== 1 ? "s" : ""} on roll — type to filter</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Sel
                          label="Class"
                          value={scoreForm.studentClass}
                          onChange={(e: any) => setScoreForm(f => ({ ...f, studentClass: e.target.value, subject: "" }))}
                        >
                          <option value="">Select class</option>
                          {(auth.user?.assignedClasses?.length ? auth.user.assignedClasses : ALL_CLASSES).map(c => <option key={c}>{c}</option>)}
                        </Sel>
                        <Sel
                          label="Subject"
                          value={scoreForm.subject}
                          onChange={(e: any) => setScoreForm(f => ({ ...f, subject: e.target.value }))}
                          disabled={!scoreForm.studentClass}
                        >
                          <option value="">Select subject</option>
                          {subjectList.map(s => <option key={s}>{s}</option>)}
                        </Sel>
                      </div>

                      {draftMatch && (
                        <div className="rounded-xl bg-emerald-50 border-2 border-emerald-200 px-4 py-3 flex items-center gap-3">
                          <Check size={14} className="text-emerald-600 flex-shrink-0" />
                          <p className="text-xs font-bold text-emerald-800">
                            CA already saved as draft (<span className="font-black">{draftMatch.caScore}</span>). Add the exam score below to finalize.
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {([
                          ["caScore",   "CA Score (max 40)",   40],
                          ["examScore", "Exam Score (max 60)", 60],
                        ] as const).map(([field, label, max]) => (
                          <div key={field} className="space-y-1.5">
                            <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label>
                            <input
                              type="number"
                              min="0"
                              max={max}
                              step="0.5"
                              value={field === "caScore" && draftMatch && scoreForm.caScore === "" ? String(draftMatch.caScore) : scoreForm[field]}
                              placeholder={`0–${max}`}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === "" || (+v >= 0 && +v <= max))
                                  setScoreForm(f => ({ ...f, [field]: v }));
                              }}
                              onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-lg focus:border-blue-500 focus:bg-white outline-none transition-all"
                            />
                          </div>
                        ))}
                      </div>
                      {/* Score preview */}
                      {(scoreForm.caScore !== "" || scoreForm.examScore !== "") && (() => {
                        const t = (+scoreForm.caScore || 0) + (+scoreForm.examScore || 0);
                        const g = getGrade(t);
                        return (
                          <div className="bg-slate-50 rounded-xl p-4 text-center border-2 border-slate-100">
                            <p className="text-xs font-black uppercase text-slate-400 mb-1">Total Preview</p>
                            <p className="text-4xl font-black text-slate-900">{t}<span className="text-lg text-slate-400">/100</span></p>
                            <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-black uppercase" style={{ background: g.bg, color: g.color }}>
                              {g.grade} — {g.remark}
                            </span>
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <Btn variant="ghost" onClick={() => { setScoreForm({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" }); showToast("Form cleared"); }}>
                          Clear
                        </Btn>
                        <Btn variant="outline" onClick={saveCADraft} title="Save CA only — finalize when exam is ready">
                          <Save size={13} />Save CA
                        </Btn>
                        <Btn variant="primary" onClick={() => {
                          if (draftMatch && scoreForm.caScore === "" && scoreForm.examScore !== "") {
                            finalizeDraft(draftMatch.id, scoreForm.examScore);
                            setScoreForm(f => ({ ...f, subject: "", caScore: "", examScore: "" }));
                          } else {
                            submitScore();
                          }
                        }}><Check size={14} />Save Full</Btn>
                      </div>
                    </div>
                  </Card>

                  {/* Pending CA drafts — finalize when exam is ready */}
                  {termDrafts.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
                        <Clock size={14} className="text-white" />
                        <p className="text-white font-black uppercase tracking-widest text-xs">Pending Exam Score ({termDrafts.length})</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {termDrafts.map(d => (
                          <PendingDraftRow key={d.id} draft={d} onFinalize={finalizeDraft} onDelete={deleteDraft} />
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
                );
              })()}

              {/* RECORDS */}
              {activeTab === "database" && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h1 className="text-2xl font-black text-slate-900 uppercase">Records</h1>
                      <p className="text-sm text-slate-400">{termEntries.length} in {schoolSettings.term} · {bin.length} in bin</p>
                    </div>
                    {(isAdmin || can("manageRecords")) && (
                      <Btn variant={showBin ? "primary" : "outline"} onClick={() => setShowBin(b => !b)}>
                        <RotateCcw size={14} />{showBin ? "View Active" : `Bin${bin.length ? ` (${bin.length})` : ""}`}
                      </Btn>
                    )}
                  </div>
                  {!showBin && (
                    <Card className="p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search by name…"
                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                        </div>
                        <select value={dbClass} onChange={e => setDbClass(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                          <option value="">All Classes</option>
                          {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <input type="date" value={dbDate} onChange={e => setDbDate(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
                      </div>
                      {(dbSearch || dbClass || dbDate) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {dbSearch && <Pill color="blue">Name: "{dbSearch}"</Pill>}
                          {dbClass  && <Pill color="indigo">{dbClass}</Pill>}
                          {dbDate   && <Pill color="green">{new Date(dbDate + "T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</Pill>}
                          <span className="text-xs text-slate-400 font-bold">{filteredEntries.length} result{filteredEntries.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => { setDbSearch(""); setDbClass(""); setDbDate(""); }}
                            className="text-xs font-black uppercase text-red-400 hover:text-red-600 flex items-center gap-1">
                            <X size={11} />Clear
                          </button>
                        </div>
                      )}
                    </Card>
                  )}
                  {!showBin && (
                    entries.length === 0
                      ? <EmptyState icon={Database} title="No records yet" subtitle="Add scores in the Score Entry tab" />
                      : filteredEntries.length === 0
                        ? <EmptyState icon={Search} title="No matching records"
                            action={<Btn variant="ghost" size="sm" onClick={() => { setDbSearch(""); setDbClass(""); setDbDate(""); }}>Clear filters</Btn>} />
                        : (
                          <Card className="overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                  <tr>
                                    {["Student","Class","Subject","CA","Exam","Total","Grade","Logged"].map((h, i) => (
                                      <th key={i} className={`px-4 py-3 text-xs font-black uppercase text-slate-400 ${[3,4,5,6].includes(i) ? "text-center" : ""}`}>{h}</th>
                                    ))}
                                    {(isAdmin || can("manageRecords")) && <th className="px-4 py-3" />}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {filteredEntries.map(e => {
                                    const g = getGrade(e.total);
                                    const { date, time } = fmtTs(e.createdAt);
                                    return (
                                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-black text-sm text-slate-900">{e.studentName}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-600">{e.studentClass}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-blue-600">{e.subject}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-center">{e.caScore}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-center">{e.examScore}</td>
                                        <td className="px-4 py-3 text-sm font-black text-center">{e.total}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="text-xs font-black px-2 py-0.5 rounded-md" style={{ background: g.bg, color: g.color }}>{g.grade}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <p className="text-xs font-bold text-slate-600">{time}</p>
                                          <p className="text-xs text-slate-400">{date}</p>
                                        </td>
                                        {(isAdmin || can("manageRecords")) && (
                                          <td className="px-4 py-3 text-center">
                                            <button onClick={() => setDlg({ type:"delete", data:e })}
                                              className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all">
                                              <Trash2 size={14} />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </Card>
                        )
                  )}
                  {showBin && (
                    bin.length === 0
                      ? <EmptyState icon={RotateCcw} title="Recycle bin is empty" />
                      : (
                        <Card className="overflow-hidden border-amber-200">
                          <div className="bg-amber-50 px-5 py-3 border-b border-amber-100 flex items-center gap-2">
                            <AlertTriangle size={13} className="text-amber-500" />
                            <p className="text-xs font-black uppercase text-amber-700">Recycle Bin — {bin.length} item{bin.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>{["Student","Class","Subject","Total","Created","Deleted",""].map((h, i) => (
                                  <th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {bin.map(e => {
                                  const g = getGrade(e.total);
                                  const cr = fmtTs(e.createdAt);
                                  const dl = fmtTs(e.deletedAt);
                                  return (
                                    <tr key={e.id} className="hover:bg-amber-50 transition-colors">
                                      <td className="px-4 py-3 font-black text-sm text-slate-700">{e.studentName}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{e.studentClass}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-slate-400 line-through">{e.subject}</td>
                                      <td className="px-4 py-3">
                                        <span className="text-xs font-black px-2 py-0.5 rounded-md" style={{ background: g.bg, color: g.color }}>{e.total} · {g.grade}</span>
                                      </td>
                                      <td className="px-4 py-3"><p className="text-xs font-bold text-slate-500">{cr.time}</p><p className="text-xs text-slate-400">{cr.date}</p></td>
                                      <td className="px-4 py-3"><p className="text-xs font-bold text-red-400">{dl.time}</p><p className="text-xs text-red-300">{dl.date}</p></td>
                                      <td className="px-4 py-3">
                                        <button onClick={() => setDlg({ type:"restore", data:e })}
                                          className="p-1.5 rounded-lg text-emerald-500 hover:text-white hover:bg-emerald-500 transition-all">
                                          <RotateCcw size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </Card>
                      )
                  )}
                </>
              )}

              {/* REPORTS */}
              {activeTab === "reports" && can("viewReports") && (
                !activeReport ? (
                  <>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase">Reports</h1>
                        <p className="text-sm text-slate-400">{filteredStudents.length} student{filteredStudents.length !== 1 ? "s" : ""} found</p>
                      </div>
                      {rpClass !== "All" && filteredStudents.length > 0 && can("printReports") && (
                        <Btn variant="outline" size="sm" onClick={async () => {
                          showToast(`Exporting ${rpClass}…`);
                          await exportClassToExcel(rpClass, schoolSettings.session, schoolSettings.term, entries, attendance);
                          showToast(`${rpClass} exported to Excel`);
                        }}>
                          📊 Export {rpClass}
                        </Btn>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={rpSearch} onChange={e => setRpSearch(e.target.value)} placeholder="Search student…"
                          className="w-full pl-9 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none shadow-sm transition-all" />
                      </div>
                      <select value={rpClass} onChange={e => setRpClass(e.target.value)}
                        className="px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none shadow-sm">
                        <option value="All">All Classes</option>
                        {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    {filteredStudents.length === 0
                      ? <EmptyState icon={FileText} title="No students found" subtitle="Add scores to see students here" />
                      : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {filteredStudents.map(s => (
                            <button key={s.id} onClick={() => openReport(s)}
                              className="p-5 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-between text-left group hover:border-blue-400 hover:shadow-md transition-all">
                              <div>
                                <p className="font-black text-sm uppercase text-slate-900">{s.name}</p>
                                <p className="text-xs font-bold text-slate-400 mt-0.5">{s.class}</p>
                              </div>
                              <FileText size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                      )}
                  </>
                ) : (
                  <div className="space-y-5 max-w-3xl mx-auto">
                    <button onClick={() => setActiveReport(null)}
                      className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors">
                      <X size={13} />Back to Students
                    </button>
                    <Card className="overflow-hidden">
                      <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
                        <PenTool size={16} className="text-white/80" />
                        <p className="text-white font-black uppercase tracking-widest text-sm">Report Editor — {activeReport.name}</p>
                      </div>
                      <div className="p-6 space-y-5">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Attendance</p>
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ["daysOpen",    "Days Opened",  "slate"],
                              ["daysPresent", "Days Present", "emerald"],
                              ["daysAbsent",  "Days Absent",  "red"],
                            ] as const).map(([f, l, c]) => (
                              <div key={f}>
                                <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">{l}</label>
                                <input
                                  type="number" min="0" max="365" placeholder="0"
                                  value={curC[f] || ""}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (v === "" || (+v >= 0 && +v <= 365))
                                      dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:v });
                                  }}
                                  onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                                  className={`w-full px-3 py-3 rounded-xl border-2 font-black text-center text-xl outline-none transition-all ${c === "emerald" ? "bg-emerald-50 border-emerald-100 focus:border-emerald-400" : c === "red" ? "bg-red-50 border-red-100 focus:border-red-400" : "bg-slate-50 border-slate-100 focus:border-slate-400"}`}
                                />
                              </div>
                            ))}
                          </div>
                          {attRate !== null && (
                            <p className={`mt-2 text-center text-sm font-black ${attRate >= 75 ? "text-emerald-600" : "text-red-500"}`}>
                              Attendance Rate: {attRate}% {attRate >= 75 ? "✓" : "⚠"}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {([
                            ["teacher",   "Class Teacher's Remark", "teacherSig",   "Teacher Signature"],
                            ["principal", "Principal's Remark",     "principalSig", "Principal's Signature"],
                          ] as const).map(([f, l, sf, sl]) => (
                            <div key={f} className="space-y-2">
                              <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{l}</label>
                              <textarea
                                value={curC[f] || ""}
                                onChange={e => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:e.target.value })}
                                rows={3} placeholder="Enter remark…"
                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium focus:border-blue-500 outline-none transition-all resize-none"
                              />
                              <input
                                value={curC[sf] || ""}
                                onChange={e => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:e.target.value })}
                                placeholder={sl}
                                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black uppercase tracking-wide focus:border-blue-500 outline-none transition-all"
                              />
                            </div>
                          ))}
                        </div>
                        {can("printReports") && (
                          <div className="grid grid-cols-2 gap-3">
                            <Btn variant="primary" size="lg" onClick={() => setShowPrint(true)}>
                              <Printer size={16} />Print / Export PDF
                            </Btn>
                            <Btn variant="outline" size="lg" onClick={async () => {
                              await exportSingleStudentExcel(activeReport, curC, attRate, schoolSettings);
                              showToast("Excel exported");
                            }}>
                              📊 Export Excel
                            </Btn>
                          </div>
                        )}
                      </div>
                    </Card>
                    <ReportSheet report={activeReport} curC={curC} attRate={attRate} schoolLogo={schoolLogo} schoolSettings={schoolSettings} />
                  </div>
                )
              )}

              {/* ATTENDANCE */}
              {activeTab === "attendance" && (can("scoreEntry") || isAdmin) && <AttendanceTab />}

              {/* STAFF */}
              {activeTab === "staff" && isAdmin && (() => {
                const detailStaff = staffDetailId ? staffList.find(s => s.id === staffDetailId) : null;

                // ── Staff Detail View ──────────────────────────────────────
                if (detailStaff) return (
                  <div className="space-y-5 max-w-2xl mx-auto">
                    {/* Back nav */}
                    <button onClick={() => setStaffDetailId(null)}
                      className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors group">
                      <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
                      Back to Staff List
                    </button>
                    {/* Detail card */}
                    <Card className="overflow-hidden">
                      <div className={`px-6 py-5 ${detailStaff.status === "active" ? "bg-indigo-600" : detailStaff.status === "restricted" ? "bg-amber-500" : "bg-slate-600"} flex items-center gap-4`}>
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-black text-xl">{detailStaff.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black uppercase text-lg truncate">{detailStaff.name}</p>
                          <p className="text-white/70 text-sm font-bold mt-0.5">{detailStaff.role}</p>
                          <div className="mt-2"><StatusPill status={detailStaff.status} /></div>
                        </div>
                      </div>
                      <div className="p-6 space-y-5">
                        {/* Permissions */}
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Permissions</p>
                          <div className="grid grid-cols-2 gap-2">
                            {PERMS_META.map(p => (
                              <div key={p.key} className={`flex items-center gap-2 p-3 rounded-xl border ${detailStaff.permissions[p.key] ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100 opacity-50"}`}>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${detailStaff.permissions[p.key] ? "bg-blue-600" : "bg-slate-300"}`}>
                                  {detailStaff.permissions[p.key] && <Check size={10} className="text-white" />}
                                </div>
                                <p className={`text-xs font-black uppercase ${detailStaff.permissions[p.key] ? "text-blue-800" : "text-slate-400"}`}>{p.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Assigned classes */}
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Assigned Classes</p>
                          {detailStaff.assignedClasses.length === 0
                            ? <p className="text-xs text-slate-400 italic">All classes (no restriction)</p>
                            : <div className="flex flex-wrap gap-1.5">{detailStaff.assignedClasses.map(c => <Pill key={c} color="slate">{c}</Pill>)}</div>}
                        </div>
                        {/* Timestamps */}
                        <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 border-t border-slate-100 pt-4">
                          <div><p className="font-black uppercase mb-0.5">Created</p><p>{fmtTs(detailStaff.createdAt).date}</p></div>
                          <div><p className="font-black uppercase mb-0.5">Last Updated</p><p>{fmtTs(detailStaff.updatedAt).date}</p></div>
                        </div>
                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                          <Btn variant="outline" onClick={() => { setDlg({ type:"staffEdit", data:detailStaff }); setStaffDetailId(null); }}>
                            <KeyRound size={14} />Edit Access
                          </Btn>
                          {detailStaff.status !== "revoked"
                            ? <Btn variant="danger" onClick={() => setDlg({ type:"revoke", data:detailStaff })}>
                                <UserX size={14} />Revoke Access
                              </Btn>
                            : <Btn variant="success" onClick={() => { dispatch({ type:"SET_STAFF_STATUS", id:detailStaff.id, status:"active" }); showToast(`${detailStaff.name} restored`); setStaffDetailId(null); }}>
                                <UserCheck size={14} />Restore Access
                              </Btn>
                          }
                        </div>
                      </div>
                    </Card>
                  </div>
                );

                // ── Staff List View ────────────────────────────────────────
                return (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase">Staff Access</h1>
                        <p className="text-sm text-slate-400">
                          {staffList.filter(s => s.status === "active").length} active ·{" "}
                          {staffList.filter(s => s.status === "restricted").length} restricted ·{" "}
                          {staffList.filter(s => s.status === "revoked").length} revoked
                        </p>
                      </div>
                      <Btn variant="primary" onClick={() => setDlg({ type:"staffAdd" })}><UserPlus size={15} />Add Staff</Btn>
                    </div>
                    {staffList.length === 0
                      ? <EmptyState icon={Users} title='No staff accounts yet' subtitle='Click "Add Staff" to create one' />
                      : (
                        <div className="space-y-2">
                          {staffList.map(s => (
                            <div key={s.id} onClick={() => setStaffDetailId(s.id)}
                              className="cursor-pointer group">
                              <StaffCard s={s}
                                onEdit={s => { setDlg({ type:"staffEdit", data:s }); }}
                                onRevoke={s => setDlg({ type:"revoke", data:s })}
                                onRestore={s => { dispatch({ type:"SET_STAFF_STATUS", id:s.id, status:"active" }); showToast(`${s.name} restored`); }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                  </>
                );
              })()}

              {/* SETTINGS */}
              {activeTab === "settings" && isAdmin && (
                <SettingsTab
                  logoUrl={schoolLogo}
                  setSchoolLogo={setSchoolLogo}
                  logoRef={logoRef as React.RefObject<HTMLInputElement>}
                  showToast={showToast}
                  adminPinRef={adminPinRef}
                />
              )}

            </div>
          </main>

          {/* Mobile bottom nav */}
          <nav className="md:hidden bg-white border-t border-slate-100 flex-shrink-0 z-40">
            <div className="flex items-stretch">
              {primaryTabs.map(t => (
                <button key={t.id} onClick={() => navigate(t.id)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-1 transition-all ${activeTab === t.id ? "text-blue-600" : "text-slate-400"}`}>
                  <t.icon size={20} />
                  <span className="text-xs font-bold">{t.label.split(" ")[0]}</span>
                </button>
              ))}
              {moreTabs.length > 0 && (
                <button onClick={() => setMenuOpen(o => !o)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-1 transition-all ${moreTabs.some(t => t.id === activeTab) || menuOpen ? "text-blue-600" : "text-slate-400"}`}>
                  <MoreVertical size={20} />
                  <span className="text-xs font-bold">More</span>
                </button>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showPrint && activeReport && (
        <PrintDialog
          student={activeReport}
          schoolName={schoolSettings.name}
          schoolLogo={schoolLogo}
          curC={curC}
          attRate={attRate}
          schoolSettings={schoolSettings}
          onClose={() => setShowPrint(false)}
        />
      )}
      {dlg?.type === "staffAdd" && (
        <StaffDialog mode="add" onSave={saveStaff} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === "staffEdit" && (
        <StaffDialog mode="edit" staff={dlg.data} onSave={saveStaff} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === "delete" && (
        <PinAuth
          title="Delete Record"
          subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`}
          headerColor="bg-red-600"
          icon={Trash2}
          confirmLabel={<><Trash2 size={13} />Delete</>}
          confirmVariant="danger"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"DELETE_ENTRY", id:dlg.data.id }); showToast("Moved to recycle bin"); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-black uppercase mb-1">Deleting:</p>
              <p className="font-bold">{dlg.data.subject} — {dlg.data.studentName}</p>
              <p className="text-red-400">Score: {dlg.data.caScore} + {dlg.data.examScore} = {dlg.data.total}</p>
            </div>
          </div>
        </PinAuth>
      )}
      {dlg?.type === "restore" && (
        <PinAuth
          title="Restore Record"
          subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`}
          headerColor="bg-emerald-600"
          icon={RotateCcw}
          confirmLabel={<><RotateCcw size={13} />Restore</>}
          confirmVariant="success"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"RESTORE_ENTRY", id:dlg.data.id }); showToast("Record restored"); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3">
            <RotateCcw size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 font-medium">
              <strong>{dlg.data.subject}</strong> — {dlg.data.studentName} will be moved back to active records.
            </p>
          </div>
        </PinAuth>
      )}
      {dlg?.type === "revoke" && (
        <PinAuth
          title="Revoke Access"
          subtitle={dlg.data.name}
          headerColor="bg-red-600"
          icon={UserX}
          confirmLabel={<><UserX size={13} />Revoke</>}
          confirmVariant="danger"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"SET_STAFF_STATUS", id:dlg.data.id, status:"revoked" }); showToast(`${dlg.data.name}'s access revoked`); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-medium"><strong>{dlg.data.name}</strong> will lose portal access immediately.</p>
          </div>
        </PinAuth>
      )}
      {showLogout && (
        <Modal onBgClick={() => setShowLogout(false)}>
          <MHead icon={LogOut} title="Sign Out" subtitle="You are about to leave the portal" color="bg-slate-900" onClose={() => setShowLogout(false)} />
          <div className="p-6 space-y-5">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-600 font-medium">Unsaved changes will be lost. Are you sure?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" size="lg" onClick={() => setShowLogout(false)}>Stay</Btn>
              <Btn variant="danger" size="lg" onClick={() => {
                setAuth({ loggedIn:false, user:null });
                setLoginId("admin"); setLoginPass(""); setShowLogout(false);
                setActiveTab("dashboard"); setActiveReport(null); setMenuOpen(false);
              }}>
                <LogOut size={15} />Sign Out
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast toast={toast} />}

      <style>{`
        @media print {
          aside, nav, header { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; height: auto !important; }
          #printable-report { box-shadow: none !important; border-radius: 0 !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </AppCtx.Provider>
  );
}
