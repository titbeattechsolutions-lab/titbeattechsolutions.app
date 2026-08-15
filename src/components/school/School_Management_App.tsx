import { useState, useMemo, useRef, useCallback, memo, useReducer, createContext, useContext, useEffect } from "react";
import { setAppState, DB_KEY } from "@/lib/app-storage";
import { useAuth } from "@/contexts/AuthContext";
import { logAuthEvent } from "@/lib/auth-logger";
import { syncActivityLog } from "@/lib/activity-sync";
import ReportCardSupabaseActions from "./ReportCardSupabaseActions";
import { StudentsDirectoryTab } from "./StudentsDirectoryTab";
import { supabase } from "@/integrations/supabase/client";
import { NAPPS_CURRICULUM } from "./data/nappsCurriculum";
import { E_NOTES } from "./data/eNotes";
import { RESOURCE_SOURCES } from "./data/resourceSources";
import { downloadCurriculumGuidePDF, downloadENotePDF } from "./utils/resourcePdf";
import {
  GraduationCap, Database, FileText, Printer, PlusCircle,
  Check, X, Settings, Save, LogOut, LayoutDashboard,
  Trash2, Search, PenTool, Upload, RotateCcw,
  AlertTriangle, Clock, ShieldAlert, Users, UserPlus,
  UserX, UserCheck, Eye, EyeOff, KeyRound, Shield,
  Menu, BookOpen, MoreVertical, ChevronRight, ChevronLeft,
  CalendarDays, ClipboardList, BookMarked, Edit2, ArrowLeft,
  Bell, CalendarClock, Send, Inbox, MessageSquare, Wallet, CheckCircle,
  FileSpreadsheet, Lock, Info, DollarSign, Loader2, Trophy, Download, UserCircle, HelpCircle, Calculator, Copy
} from "lucide-react";
import { verifyAdminPin, setAdminPin, loadTenantSession, requestCloudDeletion as rpcRequestCloudDeletion, cancelCloudDeletion as rpcCancelCloudDeletion, fetchCloudDeletionStatus as rpcFetchCloudDeletionStatus } from "@/lib/tenant-client";
import { exportToCSV } from "@/lib/exportUtils";
import { getOrdinal } from "@/lib/school-helpers";
import { Joyride, CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';

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
const ROLES = ["Teacher","Class Teacher","Subject Teacher","Head of Dept","Bursar","Secretary","Headmaster","Headmistress","Vice Principal","Principal"];
const PERMS_META = [
  { key:"scoreEntry",    label:"Score Entry",    desc:"Enter CA & exam scores" },
  { key:"viewReports",   label:"View Reports",   desc:"Access student reports" },
  { key:"printReports",  label:"Print Reports",  desc:"Print or export reports" },
  { key:"manageRecords", label:"Manage Records", desc:"Delete or edit grades" },
  { key:"fees",          label:"Fees Access",    desc:"View and manage school fees and payments" },
  { key:"payroll",       label:"Payroll Access", desc:"Manage staff salaries and payroll processing" },
  { key:"rankings",      label:"Class Rankings", desc:"View student position/ranking within their class" },
];
const ATT_STATUSES = [
  { key:"present", label:"Present", icon:"✓", color:"emerald" },
  { key:"absent",  label:"Absent",  icon:"✗", color:"red" },
  { key:"late",    label:"Late",    icon:"⏱", color:"amber" },
  { key:"excused", label:"Excused", icon:"📋", color:"indigo" },
];

const BUILTIN_REMARKS = {
  excellent: "Excellent performance in all subjects. Keep it up!",
  veryGood: "Very good academic performance. Shows great potential.",
  good: "Good performance. Needs more effort in weak areas.",
  fair: "Fair performance. Requires improvement in several subjects.",
  poor: "Below average performance. Needs serious attention and extra coaching."
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface RollStudent {
  id: string;
  name: string;
  admNo: string;
  gender?: string;
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
  staffCode?: string;
  role: string;
  pin: string;
  status: "active" | "restricted" | "revoked";
  assignedClasses: string[];
  assignedSubjects?: string[]; // empty/undefined = all subjects of assigned classes
  permissions: Record<string, boolean>;
  signature?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}
interface StaffSignIn {
  id: string;
  staffName: string;
  role: string;       // "Admin" or staff role
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  ts: string;         // ISO
}
interface AttendanceRecord {
  id: string;
  studentName: string;
  studentClass: string;
  date: string;
  status: string;
  note: string;
  createdAt: string;
  updatedAt?: string;
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
  showBehavioural?: boolean;
  tableStyle: "grid" | "striped" | "minimal";
}
interface SchoolSettings {
  name: string;
  motto: string;
  session: string;
  term: string;
  resumptionDate: string;
  principalName?: string;
  reportTemplate?: ReportTemplateConfig;
  staffCodeMigrationDone?: boolean;
  adminUsername?: string;
  salaryDay?: number;
  salaryReminderEnabled?: boolean;
}
interface TimetableCell { subject: string; teacherName: string }
interface TimetableState {
  periods: { id: string; label: string; start: string; end: string }[];
  days: string[];
  // key: `${className}|${day}|${periodId}` → TimetableCell
  cells: Record<string, TimetableCell>;
}
interface AppNotification {
  id: string;
  createdAt: string;
  fromActor: string;
  fromRole: "admin" | "staff" | "system";
  toScope: "admin" | "all-staff" | string; // string = `staff:<name>`
  title: string;
  body: string;
  priority: "normal" | "high";
  readBy: string[];
  type?: "system_salary" | "system_schedule" | "manual";
  referenceId?: string;
}
interface SalaryStructure {
  baseSalary: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
}
interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  month: string;
  grossPay: number;
  netPay: number;
  status: "paid";
  paidAt: string;
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
  timetable: TimetableState;
  notifications: AppNotification[];
  staffSignIns: StaffSignIn[];
  salaryStructures: Record<string, SalaryStructure>;
  payrollRecords: Record<string, PayrollRecord>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);

function computeStandings(
  entries: Entry[], 
  studentClass: string, 
  filter: (e: Entry) => boolean,
  aggregateFn: (studentEntries: Entry[]) => number
): { name: string; value: number; rank: number }[] {
  const scoped = entries.filter(e => e.studentClass === studentClass && filter(e));
  const names = [...new Set(scoped.map(e => e.studentName.toLowerCase().trim()))];
  const standings = names
    .map(n => ({ 
      name: n, 
      value: aggregateFn(scoped.filter(e => e.studentName.toLowerCase().trim() === n)) 
    }))
    .sort((a, b) => b.value - a.value);
  
  let rank = 0;
  let lastValue: number | null = null;
  return standings.map(s => {
    if (s.value !== lastValue) { rank++; lastValue = s.value; }
    return { ...s, rank };
  });
}

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

// Bump this when you change the default timetable structure so existing
// browsers auto-upgrade instead of staying on the old cached version.
const TIMETABLE_SCHEMA_VERSION = "tt_v4_napps_break";

function loadDB(): Partial<AppState> {
  try {
    // Use synchronous read for initial render (fast, no loading state needed)
    const raw = localStorage.getItem("greatmind_school_db_v2");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AppState> & { _timetableVersion?: string };
    // Drop the stored timetable if its schema version is missing/outdated
    // so the new _defaultTimetable takes over on next load.
    if (parsed._timetableVersion !== TIMETABLE_SCHEMA_VERSION) {
      delete parsed.timetable;
    }
    return parsed;
  } catch { return {}; }
}

function saveDB(state: AppState) {
  try {
    let preserved: { _rev?: number; _updatedAt?: string } = {};
    try {
      const existing = JSON.parse(localStorage.getItem("greatmind_school_db_v2") || "{}");
      if (typeof existing._rev === "number") preserved._rev = existing._rev;
      if (existing._updatedAt) preserved._updatedAt = existing._updatedAt;
    } catch {}
    const payload = JSON.stringify({
      ...state,
      ...preserved,
      _timetableVersion: TIMETABLE_SCHEMA_VERSION,
    });
    // Attempt localStorage first; fall back to IndexedDB via app-storage (static import)
    setAppState(payload).catch(() => {
      // Both stores failed — warn the user visibly
      window.dispatchEvent(new CustomEvent("app_storage_full"));
    });
  } catch { /* non-critical */ }
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
    await loadScript("https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js");
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
  
  // Style headers
  summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: subjects.length + 3 } }];
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A8A" } }, alignment: { horizontal: "center", vertical: "center" } };
  if (summarySheet["A1"]) summarySheet["A1"].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: "center", vertical: "center" } };
  for (let c = 0; c <= subjects.length + 3; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 2, c });
    if (summarySheet[cellRef]) summarySheet[cellRef].s = headerStyle;
  }
  
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
    
    // Style student sheet headers
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
    if (ws["A1"]) ws["A1"].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } };
    if (ws["A2"]) ws["A2"].s = { font: { bold: true, sz: 11 }, alignment: { horizontal: "center" } };
    for (let c = 0; c <= 5; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 3, c });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    }
    
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
  
  // Style attendance sheet headers
  attSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  if (attSheet["A1"]) attSheet["A1"].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } };
  for (let c = 0; c <= 3; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 1, c });
    if (attSheet[cellRef]) attSheet[cellRef].s = headerStyle;
  }
  
  XLSX.utils.book_append_sheet(wb, attSheet, "Attendance Log");

  XLSX.writeFile(wb, `${className.replace(/\s+/g, "_")}_${term.replace(/\s+/g, "_")}_Report.xlsx`);
}

// Single student PDF helper (called from report page)
async function exportSingleStudentExcel(report: any, curC: any, attRate: number | null, schoolSettings: any): Promise<void> {
  const ok = await loadSheetJS();
  if (!ok) return;
  const wb = XLSX.utils.book_new();
  const g = getGrade(parseFloat(report.summary.avg));
  
  const borderAll = { top: { style: "thin", color: { auto: 1 } }, bottom: { style: "thin", color: { auto: 1 } }, left: { style: "thin", color: { auto: 1 } }, right: { style: "thin", color: { auto: 1 } } };
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A8A" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderAll };
  const titleStyle = { font: { bold: true, sz: 16, color: { rgb: "1E3A8A" } }, alignment: { horizontal: "center", vertical: "center" } };
  const subTitleStyle = { font: { bold: true, sz: 12, color: { rgb: "475569" } }, alignment: { horizontal: "center", vertical: "center" } };
  const cellCenter = { border: borderAll, alignment: { horizontal: "center", vertical: "center" } };
  const cellLeft = { border: borderAll, alignment: { horizontal: "left", vertical: "center" } };
  const boldLeft = { font: { bold: true }, border: borderAll, alignment: { horizontal: "left", vertical: "center" } };

  // Helper to safely get affective/psychomotor values
  const getTraits = () => {
    const traits = [...AFFECTIVE_TRAITS, ...PSYCHOMOTOR_SKILLS];
    return traits.map(t => [t.label, curC[t.key] || "-"]);
  };
  const behaviouralData = getTraits();

  const sheetData: any[][] = [
    [schoolSettings.name, "", "", "", "", ""],
    [`${schoolSettings.session} — ${schoolSettings.term}`, "", "", "", "", ""],
    ["", "", "", "", "", ""],
    [`Student Name:`, report.name, "", `Class:`, report.class, ""],
    [`Admission No:`, report.admNo || "—", "", `Position:`, report.position || "—", ""],
    ["", "", "", "", "", ""],
    ["ACADEMIC PERFORMANCE", "", "", "", "", ""],
    ["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"],
    ...report.records.map((r: any) => {
      const gr = getGrade(r.total);
      return [r.subject, r.caScore, r.examScore, r.total, gr.grade, gr.remark];
    }),
    ["CUMULATIVE TOTAL", "", "", report.summary.total, `${report.summary.avg}%`, g.remark],
    ["", "", "", "", "", ""],
    ["BEHAVIOURAL ASSESSMENT", "", "", "ATTENDANCE & REMARKS", "", ""],
  ];

  // We need to place Behavioural Data side-by-side with Attendance & Remarks
  const leftCol = behaviouralData;
  const rightCol = [
    ["Days Opened", curC.daysOpen || "—"],
    ["Days Present", curC.daysPresent || "—"],
    ["Days Absent", curC.daysAbsent || "—"],
    ["Attendance Rate", attRate !== null ? `${attRate}%` : "—"],
    ["Class Teacher's Remark", curC.teacher || "—"],
    ["Principal's Remark", curC.principal || "—"],
    ["Next Resumption", schoolSettings.resumptionDate || "—"]
  ];

  const maxRows = Math.max(leftCol.length, rightCol.length);
  for (let i = 0; i < maxRows; i++) {
    const l = leftCol[i] || ["", ""];
    const r = rightCol[i] || ["", ""];
    // Merging columns for Remarks so it fits nicely
    sheetData.push([l[0], l[1], "", r[0], r[1], ""]); 
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Apply Merges
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // School Name
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // Session/Term
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } }, // Student Name value merge
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } }, // Class value merge
    { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } }, // Adm No value merge
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } }, // Position value merge
    { s: { r: 6, c: 0 }, e: { r: 6, c: 5 } }, // Academic Performance header
    { s: { r: 9 + report.records.length, c: 0 }, e: { r: 9 + report.records.length, c: 2 } }, // Cumulative Total text
    { s: { r: 11 + report.records.length, c: 0 }, e: { r: 11 + report.records.length, c: 2 } }, // Behavioural Assessment header
    { s: { r: 11 + report.records.length, c: 3 }, e: { r: 11 + report.records.length, c: 5 } }, // Attendance & Remarks header
  ];
  
  // Also merge the right columns for the Remarks so they have more space
  const startRow = 12 + report.records.length;
  for (let i = 0; i < maxRows; i++) {
    ws["!merges"].push({ s: { r: startRow + i, c: 4 }, e: { r: startRow + i, c: 5 } });
    ws["!merges"].push({ s: { r: startRow + i, c: 0 }, e: { r: startRow + i, c: 1 } });
  }

  // Apply Styles
  for (const cell in ws) {
    if (cell[0] === '!') continue;
    
    const r = XLSX.utils.decode_cell(cell).r;
    const c = XLSX.utils.decode_cell(cell).c;
    
    if (r === 0) ws[cell].s = titleStyle;
    else if (r === 1) ws[cell].s = subTitleStyle;
    else if (r === 3 || r === 4) {
      if (c === 0 || c === 3) ws[cell].s = boldLeft;
      else ws[cell].s = cellLeft;
    }
    else if (r === 6 || r === 11 + report.records.length) ws[cell].s = headerStyle;
    else if (r === 7) ws[cell].s = headerStyle;
    else if (r >= 8 && r < 8 + report.records.length) {
      if (c === 0) ws[cell].s = cellLeft;
      else ws[cell].s = cellCenter;
    }
    else if (r === 9 + report.records.length) {
       ws[cell].s = { ...cellCenter, font: { bold: true } };
    }
    else if (r >= startRow && r < startRow + maxRows) {
       if (c === 0 || c === 3) ws[cell].s = boldLeft;
       else if (c === 1) ws[cell].s = cellCenter;
       else if (c === 4) ws[cell].s = cellLeft;
       else ws[cell].s = { alignment: { vertical: "center" } }; // blank spacing columns
    }
    else {
      if (!ws[cell].s) ws[cell].s = { alignment: { vertical: "center" } }; // default empty spaces
    }
  }

  ws["!cols"] = [{ wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 25 }];
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

// Default staff - Empty for new tenants
const _defaultStaff: StaffMember[] = [];

// NAPPS-Standard Timetable: Assembly → 4 lessons → Break (10:40-11:10) →
// 2 lessons → Lunch → 3 lessons → Closing at 3:00PM (NAPPS).
const _defaultTimetable: TimetableState = {
  periods: [
    { id: "asm", label: "Assembly",                     start: "07:30", end: "08:00" },
    { id: "p1",  label: "Period 1",                     start: "08:00", end: "08:40" },
    { id: "p2",  label: "Period 2",                     start: "08:40", end: "09:20" },
    { id: "p3",  label: "Period 3",                     start: "09:20", end: "10:00" },
    { id: "p4",  label: "Period 4",                     start: "10:00", end: "10:40" },
    { id: "sbr", label: "Lesson Break",                 start: "10:40", end: "11:10" },
    { id: "p5",  label: "Period 5",                     start: "11:10", end: "11:50" },
    { id: "p6",  label: "Period 6",                     start: "11:50", end: "12:30" },
    { id: "lbr", label: "Lunch Break",                  start: "12:30", end: "13:10" },
    { id: "p7",  label: "Period 7",                     start: "13:10", end: "13:50" },
    { id: "p8",  label: "Period 8",                     start: "13:50", end: "14:30" },
    { id: "p9",  label: "Period 9",                     start: "14:30", end: "15:00" },
    { id: "cls", label: "Closing Time – 3:00PM (NAPPS)", start: "15:00", end: "15:10" },
  ],
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  cells: {},
};

const EMPTY_STATE: AppState = {
  entries: [], bin: [], logs: [], comments: {}, attendance: [],
  classRolls: {}, staffList: _defaultStaff,
  schoolSettings: { name:"", motto:"", session:"", term:"", resumptionDate:"" },
  timetable: _defaultTimetable, notifications: [], staffSignIns: [],
  salaryStructures: {}, payrollRecords: {},
};

const initialState: AppState = {
  entries:        _saved.entries        ?? EMPTY_STATE.entries,
  bin:            _saved.bin            ?? EMPTY_STATE.bin,
  logs:           _saved.logs           ?? EMPTY_STATE.logs,
  comments:       _saved.comments       ?? EMPTY_STATE.comments,
  attendance:     _saved.attendance     ?? EMPTY_STATE.attendance,
  classRolls:     _saved.classRolls     ?? EMPTY_STATE.classRolls,
  staffList:      _saved.staffList      ?? EMPTY_STATE.staffList,
  schoolSettings: _saved.schoolSettings ?? EMPTY_STATE.schoolSettings,
  timetable:      _saved.timetable      ?? EMPTY_STATE.timetable,
  notifications:  _saved.notifications  ?? EMPTY_STATE.notifications,
  staffSignIns:   _saved.staffSignIns   ?? EMPTY_STATE.staffSignIns,
  salaryStructures: _saved.salaryStructures ?? EMPTY_STATE.salaryStructures,
  payrollRecords: _saved.payrollRecords ?? EMPTY_STATE.payrollRecords,
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
        bin: [{ ...e, deletedAt: new Date().toISOString() }, ...state.bin].slice(0, 200),
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
        logs: [mkLog(exists ? "Updated" : "Staff Added", action.payload.name, action.payload.role, "", action.actor || ""), ...state.logs].slice(0, 100),
      };
    }
    case "SET_STAFF_STATUS": {
      const s = state.staffList.find(x => x.id === action.id);
      if (!s) return state;
      return {
        ...state,
        staffList: state.staffList.map(x => x.id === action.id ? { ...x, status: action.status, updatedAt: new Date().toISOString() } : x),
        logs: [mkLog(action.status === "revoked" ? "Revoked" : "Restored", s.name, s.role, "", action.actor || ""), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_ATTENDANCE": {
      const idx = state.attendance.findIndex(a => a.id === action.payload.id);
      return {
        ...state,
        attendance: idx >= 0
          ? state.attendance.map((a, i) => i === idx ? { ...action.payload, updatedAt: new Date().toISOString() } : a)
          : [...state.attendance, { ...action.payload, updatedAt: new Date().toISOString() }],
      };
    }
    case "BULK_SAVE_ATTENDANCE": {
      const cls = action.payload[0]?.studentClass || "";
      const date = action.payload[0]?.date || "";
      const actor = action.actor || "";
      const notify = actor && actor !== "Admin"
        ? [makeNotification({
            fromActor: actor, fromRole: "system", toScope: "admin",
            title: "Attendance recorded",
            body: `${actor} saved attendance for ${cls} on ${date} (${action.payload.length} student${action.payload.length === 1 ? "" : "s"}).`,
          })]
        : [];
      return {
        ...state,
        attendance: [
          ...state.attendance.filter(a => !action.payload.find((p: AttendanceRecord) =>
            p.studentName === a.studentName && p.studentClass === a.studentClass && p.date === a.date
          )),
          ...action.payload,
        ],
        logs: [mkLog("Attendance Saved", `${action.payload.length} student(s)`, cls, `Date: ${date}`, actor), ...state.logs].slice(0, 200),
        notifications: [...notify, ...state.notifications].slice(0, 200),
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
    case "SET_SALARY_STRUCTURE":
      return { ...state, salaryStructures: { ...state.salaryStructures, [action.role]: action.structure } };
    case "SAVE_PAYROLL_RECORD":
      return { ...state, payrollRecords: { ...state.payrollRecords, [`${action.payload.staffId}|${action.payload.month}`]: action.payload } };
    case "SET_TIMETABLE_CELL": {
      const next = { ...state.timetable.cells };
      if (!action.cell || (!action.cell.subject && !action.cell.teacherName)) delete next[action.key];
      else next[action.key] = action.cell;
      return { ...state, timetable: { ...state.timetable, cells: next } };
    }
    case "SET_TIMETABLE_CELLS": {
      return { ...state, timetable: { ...state.timetable, cells: action.cells } };
    }
    case "SET_TIMETABLE_PERIODS":
      return { ...state, timetable: { ...state.timetable, periods: action.periods } };
    case "ADD_NOTIFICATION":
      return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 200) };
    case "LOG_ACTIVITY":
      return { ...state, logs: [action.payload, ...state.logs].slice(0, 200) };
    case "MARK_NOTIFICATION_READ": {
      const next = state.notifications.map(n =>
        n.id === action.id && !n.readBy.includes(action.actor)
          ? { ...n, readBy: [...n.readBy, action.actor] }
          : n
      );
      return { ...state, notifications: next };
    }
    case "DELETE_NOTIFICATION":
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.id) };
    case "LOG_STAFF_SIGNIN": {
      const p = action.payload as StaffSignIn;
      // Idempotent: only one sign-in per staff per day
      const existing = state.staffSignIns.find(s => s.staffName === p.staffName && s.date === p.date);
      if (existing) return state;
      return {
        ...state,
        staffSignIns: [p, ...state.staffSignIns].slice(0, 1000),
        logs: [mkLog("Signed In", p.staffName, p.role, `${p.date} ${p.time}`, p.staffName), ...state.logs].slice(0, 200),
      };
    }
    case "REPLACE_ALL": {
      // Cross-device hydration: full state swap. Preserve unknown keys from default.
      
      // Simple ID-union merge for append-only arrays (no in-place edits possible)
      const unionById = (local: any[], incoming: any[]) => {
        const map = new Map(local.map(item => [item.id, item]));
        for (const item of incoming) {
          if (!map.has(item.id)) map.set(item.id, item);
        }
        return Array.from(map.values());
      };

      // Union by ID, keeping the record with the later timestamp on conflicts
      const mergeByIdKeepNewest = (local: any[], incoming: any[], tsField: string) => {
        const map = new Map(local.map(item => [item.id, item]));
        for (const item of incoming) {
          const existing = map.get(item.id);
          if (!existing || new Date(item[tsField] || 0).getTime() > new Date(existing[tsField] || 0).getTime()) {
            map.set(item.id, item);
          }
        }
        return Array.from(map.values());
      };

      const mergedLogs = [...(action.payload.logs || []), ...state.logs]
        .filter((log, idx, arr) => arr.findIndex(l => l.id === log.id) === idx)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 200);
      const mergedNotifications = [...(action.payload.notifications || []), ...state.notifications]
        .filter((n, idx, arr) => arr.findIndex(x => x.id === n.id) === idx)
        .slice(0, 200);
        
      const mergedStaffSignIns = unionById(state.staffSignIns, action.payload.staffSignIns || []);
      const mergedStaffList = mergeByIdKeepNewest(state.staffList, action.payload.staffList || [], "updatedAt");
      const mergedAttendance = mergeByIdKeepNewest(state.attendance, action.payload.attendance || [], "updatedAt");

      // entries/bin: treat as one combined pool per id, resolve to exactly ONE location
      const combinedPool = new Map<string, { item: any; location: "entries" | "bin"; ts: string }>();
      const consider = (arr: any[], location: "entries" | "bin", tsGetter: (x: any) => string) => {
        for (const item of arr) {
          const ts = tsGetter(item);
          const existing = combinedPool.get(item.id);
          if (!existing || new Date(ts).getTime() > new Date(existing.ts).getTime()) {
            combinedPool.set(item.id, { item, location, ts });
          }
        }
      };
      const tsFor = (x: any) => x.deletedAt || x.restoredAt || x.createdAt;
      consider(state.entries, "entries", tsFor);
      consider(state.bin, "bin", tsFor);
      consider(action.payload.entries || [], "entries", tsFor);
      consider(action.payload.bin || [], "bin", tsFor);
      const mergedEntries: any[] = [];
      const mergedBin: any[] = [];
      for (const { item, location } of combinedPool.values()) {
        (location === "entries" ? mergedEntries : mergedBin).push(item);
      }

      return { 
        ...state, ...action.payload, 
        schoolSettings: { ...state.schoolSettings, ...(action.payload.schoolSettings || {}) },
        logs: mergedLogs, notifications: mergedNotifications,
        staffSignIns: mergedStaffSignIns, staffList: mergedStaffList, 
        attendance: mergedAttendance, entries: mergedEntries, bin: mergedBin 
      };
    }
    case "HARD_RESET": {
      // Unconditional clean-slate reset. Used exclusively for tenant switching.
      // Unlike REPLACE_ALL (which merges for cross-device sync), this wipes ALL
      // existing state and replaces it with the payload. Never use for normal sync.
      return {
        ...EMPTY_STATE,
        ...(action.payload || {}),
        schoolSettings: {
          name: "", motto: "", session: "", term: "", resumptionDate: "",
          ...(action.payload?.schoolSettings || {}),
        },
      };
    }
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
  tenantId?: string;
}
const AppCtx = createContext<AppCtxType | null>(null);
export const useApp = () => useContext(AppCtx)!;

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

const Card = ({ children, className = "", ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`} {...props}>{children}</div>
);

const EmptyState = ({ icon: Icon, title, subtitle, action }: { icon: any; title: string; subtitle?: string; action?: React.ReactNode }) => (
  <Card className="p-12 text-center">
    <Icon size={40} className="mx-auto text-slate-200 mb-3" />
    <p className="font-bold text-slate-400">{title}</p>
    {subtitle && <p className="text-xs text-slate-300 mt-1">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </Card>
);

const Modal = ({ children, maxW = "max-w-md", onBgClick, zIndex = 200 }: { children: React.ReactNode; maxW?: string; onBgClick?: () => void; zIndex?: number }) => (
  <div
    className="fixed inset-0 flex items-center justify-center p-4"
    style={{ background: "rgba(15,23,42,0.65)", zIndex }}
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
const PinAuth = ({ title, subtitle, headerColor = "bg-blue-600", icon: Icon, children, confirmLabel, confirmVariant = "danger", onConfirm, onCancel }: any) => {
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
      const session = loadTenantSession();
      if (!session) {
        setErr("Session error. Please re-login.");
        setPin("");
        return;
      }
      const ok = await verifyAdminPin(session, pin);
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
  }, [pin, onConfirm, checking]);

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
              maxLength={32}
              placeholder="••••••"
              onChange={e => { setPin(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && verify()}
              className={`w-full px-4 py-3 bg-slate-50 border-2 ${err ? "border-red-300" : "border-slate-100"} rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none transition-all`}
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <p className="text-xs text-slate-400 text-center">Enter your admin PIN to confirm.</p>
      </div>
      <div className="px-6 pb-6 grid grid-cols-2 gap-3 flex-shrink-0">
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant={confirmVariant} onClick={verify} loading={checking}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const SignaturePad = memo(({ value, onChange, onClear }: { value: string; onChange: (value: string) => void; onClear: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = 150;
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      if (value) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = value;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      const canvas = canvasRef.current;
      if (canvas) onChange(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onChange("");
      onClear();
    }
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="w-full bg-white border-2 border-slate-200 rounded-xl cursor-crosshair touch-none"
        style={{ height: "150px" }}
      />
      <button
        onClick={clear}
        className="text-xs font-black uppercase text-red-600 hover:text-red-700 transition-colors"
      >
        Clear Signature
      </button>
    </div>
  );
});

const DefaultSignaturesPanel = memo(({ initialTeacher, initialPrincipal, onSave }: {
  initialTeacher: string;
  initialPrincipal: string;
  onSave: (teacher: string, principal: string) => void;
}) => {
  const [teacherSig, setTeacherSig] = useState(initialTeacher);
  const [principalSig, setPrincipalSig] = useState(initialPrincipal);
  const saved = teacherSig === initialTeacher && principalSig === initialPrincipal;
  return (
    <Card className="p-6 space-y-5">
      <div>
        <p className="text-sm font-black uppercase text-slate-700">Default Signatures</p>
        <p className="text-xs text-slate-400 mt-0.5">Set default signatures for teacher and principal on reports</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">Default Teacher Signature</label>
          <SignaturePad value={teacherSig} onChange={setTeacherSig} onClear={() => setTeacherSig("")} />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">Default Principal Signature</label>
          <SignaturePad value={principalSig} onChange={setPrincipalSig} onClear={() => setPrincipalSig("")} />
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <Btn variant="primary" size="lg" className="w-full" onClick={() => onSave(teacherSig, principalSig)}>
          {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Signatures</>}
        </Btn>
      </div>
    </Card>
  );
});

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
          {s.staffCode && <span className="bg-slate-100 text-slate-500 font-black text-[10px] px-2 py-0.5 rounded-md border border-slate-200">{s.staffCode}</span>}
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

export function generateStaffCode(name: string, existingCodes: string[]): string {
  const nameClean = name
    .replace(/\b(mr|mrs|ms|miss|dr|prof|rev|pastor)\.?\b/gi, '')
    .replace(/[^a-zA-Z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = nameClean.split(/[\s-]+/).filter(Boolean);
  let initials = words.map(w => w[0].toUpperCase()).join('').slice(0, 3);
  if (!initials) initials = "STF";
  let maxSeq = 0;
  for (const code of existingCodes) {
    if (code.startsWith(`${initials}-`)) {
      const numPart = parseInt(code.split("-")[1], 10);
      if (!isNaN(numPart) && numPart > maxSeq) maxSeq = numPart;
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${initials}-${nextSeq}`;
}

const blankStaff = (): Omit<StaffMember, "id" | "createdAt" | "updatedAt"> => ({
  name: "", staffCode: "", role: "Teacher", pin: "", status: "active",
  assignedClasses: [],
  assignedSubjects: [],
  permissions: { scoreEntry:true, viewReports:true, printReports:false, manageRecords:false },
});

const StaffDialog = memo(({ staff, mode, onSave, onClose, tenantId }: { staff?: StaffMember; mode: "add" | "edit"; onSave: (s: StaffMember) => void; onClose: () => void; tenantId?: string }) => {
  const originalRef = useRef<any>(staff ? { ...staff, pin: "" } : blankStaff());
  const [form, setForm] = useState<any>(() => staff ? { ...staff, pin: "" } : blankStaff());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPin, setShowPin] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [schoolProfiles, setSchoolProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { db: schoolDb } = await import("@/supabase/schoolService");
      const { data } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, staff_member_id")
        .eq("school_id", tenantId);
      if (data) setSchoolProfiles(data);
    })();
  }, [tenantId]);

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
      assignedSubjects: form.assignedSubjects || [],
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
          {form.staffCode && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase text-slate-500">Staff ID (For Login)</p>
                <p className="text-lg font-black text-slate-900">{form.staffCode}</p>
              </div>
            </div>
          )}
          <Inp label="Full Name" value={form.name} onChange={(e: any) => setF("name", e.target.value)} placeholder="e.g. Mrs. Amaka Obi" error={errors.name} />
          <Inp label="Email Address (Optional)" value={form.email || ""} onChange={(e: any) => setF("email", e.target.value)} placeholder="e.g. staff@school.com" />
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

          {/* Link to Login Account */}
          <div className="pt-2">
            <Field label="Link to Login Account (Optional)" error="">
              <select 
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black tracking-wide text-sm focus:border-blue-500 outline-none transition-all"
                value={schoolProfiles.find(p => p.staff_member_id === (staff?.id || ""))?.id || ""}
                onChange={async (e) => {
                  const selectedProfileId = e.target.value;
                  const currentId = staff?.id;
                  if (!currentId) return; // Cannot link before saving for the first time
                  
                  const { db: schoolDb } = await import("@/supabase/schoolService");

                  // Clear previous link for this staff member if any
                  const previousLinked = schoolProfiles.find(p => p.staff_member_id === currentId);
                  if (previousLinked) {
                    await (schoolDb().from("profiles") as any).update({ staff_member_id: null }).eq("id", previousLinked.id);
                  }

                  // Set new link
                  if (selectedProfileId) {
                    await (schoolDb().from("profiles") as any).update({ staff_member_id: currentId }).eq("id", selectedProfileId);
                  }

                  // Update local state to reflect change immediately
                  setSchoolProfiles(prev => prev.map(p => {
                    if (p.id === selectedProfileId) return { ...p, staff_member_id: currentId };
                    if (p.id === previousLinked?.id) return { ...p, staff_member_id: null };
                    return p;
                  }));
                }}
                disabled={!staff}
              >
                <option value="">-- No Account Linked --</option>
                {schoolProfiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.email})
                  </option>
                ))}
              </select>
              {!staff && <p className="text-[10px] text-amber-600 font-bold mt-1">Please save this staff member first before linking.</p>}
              {staff && <p className="text-[10px] text-slate-400 mt-1">Links this staff record to a real login so their E-Signature syncs.</p>}
            </Field>
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

          {/* ── Assigned subjects (Subject Teacher scoping) ───────────────── */}
          {(() => {
            const selectedSubjects: string[] = form.assignedSubjects || [];
            // Pool of subjects from selected classes (or all curriculum subjects when none selected)
            const pool = (() => {
              const set = new Set<string>();
              Object.values(CURRICULUM).forEach(cat => {
                const overlap = classSet.size === 0 || cat.classes.some(c => classSet.has(c));
                if (overlap) cat.subjects.forEach(s => set.add(s));
              });
              return Array.from(set).sort();
            })();
            const toggleSubj = (s: string) => {
              const next = selectedSubjects.includes(s)
                ? selectedSubjects.filter(x => x !== s)
                : [...selectedSubjects, s];
              setF("assignedSubjects", next);
            };
            return (
              <div className="border-t border-slate-100 pt-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-700 tracking-wide">Assigned Subjects</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Leave empty to allow all subjects · Select to restrict (Subject Teacher)</p>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">{selectedSubjects.length}</span>
                </div>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {pool.map(s => {
                    const sel = selectedSubjects.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleSubj(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${sel ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        {sel && <Check size={10} />} {s}
                      </button>
                    );
                  })}
                </div>
                {selectedSubjects.length > 0 && (
                  <button type="button" onClick={() => setF("assignedSubjects", [])}
                    className="text-xs font-black uppercase text-red-600 hover:underline">× Clear subjects</button>
                )}
              </div>
            );
          })()}
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
        <Modal maxW="max-w-sm" zIndex={300} onBgClick={() => setConfirmClose(false)}>
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
  showBehavioural: true,
  tableStyle: "striped",
};

const AFFECTIVE_TRAITS = [
  { key: "bh_punctuality", label: "Punctuality" },
  { key: "bh_attendance", label: "Attendance" },
  { key: "bh_reliability", label: "Reliability" },
  { key: "bh_neatness", label: "Neatness" },
  { key: "bh_politeness", label: "Politeness" },
  { key: "bh_honesty", label: "Honesty" },
  { key: "bh_teamwork", label: "Teamwork" },
];

const PSYCHOMOTOR_SKILLS = [
  { key: "ps_handwriting", label: "Handwriting" },
  { key: "ps_sports", label: "Games & Sports" },
  { key: "ps_crafts", label: "Crafts" },
  { key: "ps_drawing", label: "Drawing & Painting" },
];

const SETTINGS_SECTIONS = [
  { id:"logo",     label:"School Logo",    icon:"🖼️" },
  { id:"info",     label:"School Info",    icon:"🏫" },
  { id:"session",  label:"Session & Term", icon:"📅" },
  { id:"result_checker", label:"Result Checker", icon:"🔑" },
  { id:"payroll",  label:"Payroll",        icon:"💰" },
  { id:"template", label:"Report Template",icon:"📋" },
  { id:"signatures",label:"Signatures",    icon:"✍️" },
  { id:"security", label:"Security & PIN", icon:"🔒" },
  { id:"database", label:"Database",       icon:"🗄️" },
  { id:"staff_activity", label:"Staff Activity", icon:"👁️" },
  { id:"tenant_activity", label:"Staff Actions", icon:"⚡" },
];

// ─── Fees: auto-structured tracker ────────────────────────────────────────────
// Admin sets ONE fee structure per class (Tuition + extras). The app automatically
// derives Expected / Collected / Outstanding per enrolled student and per class.
const FEES_LS = "sf_fees_v2";
const FEE_STRUCT_LS = "sf_fee_structure_v2";

function getOrAssignAdmNo(
  rollStudent: RollStudent | undefined, 
  className: string, 
  studentName: string,
  classRolls: Record<string, RollStudent[]>, 
  dispatch: React.Dispatch<any>
): string {
  if (rollStudent?.admNo) return rollStudent.admNo;
  
  let fallbackId = "";
  if (!rollStudent) {
    let hash = 0;
    const str = `${className}::${studentName.trim().toLowerCase()}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    fallbackId = "H" + Math.abs(hash).toString(36);
  }

  const newAdmNo = `AUTO-${rollStudent?.id || fallbackId}`;
  if (rollStudent) {
    const updatedRoll = (classRolls[className] || []).map(s => 
      s.id === rollStudent.id ? { ...s, admNo: newAdmNo } : s
    );
    dispatch({ 
      type: "SAVE_CLASS_ROLL", 
      className, 
      students: updatedRoll,
      actor: "System Migration"
    });
  }
  return newAdmNo;
}

const PayrollTab = memo(({ isAdmin, currentActor }: { isAdmin: boolean, currentActor: string }) => {
  const { state, dispatch, showToast } = useApp();
  const [subTab, setSubTab] = useState<"structures" | "processing">("processing");
  const [selectedRole, setSelectedRole] = useState<string>("Teacher");
  const [month, setMonth] = useState<string>(today().slice(0, 7)); // YYYY-MM
  
  const currentStructure = state.salaryStructures[selectedRole] || { baseSalary: 0, allowances: [], deductions: [] };
  
  const handleSaveStructure = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const base = Number(fd.get("baseSalary"));
    dispatch({ type: "SET_SALARY_STRUCTURE", role: selectedRole, structure: { baseSalary: base, allowances: [], deductions: [] } });
    showToast(`${selectedRole} salary structure saved!`);
  };

  const processPayment = (staff: StaffMember, netPay: number, grossPay: number) => {
    if (!window.confirm(`Confirm payment of ₦${netPay.toLocaleString()} to ${staff.name} for ${month}?`)) return;
    const record: PayrollRecord = {
      id: uid(), staffId: staff.id, staffName: staff.name, role: staff.role, month,
      grossPay, netPay, status: "paid", paidAt: new Date().toISOString()
    };
    dispatch({ type: "SAVE_PAYROLL_RECORD", payload: record });
    showToast(`Paid ${staff.name} for ${month}`);
  };

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-green-600" />
            Payroll Management
          </h2>
          <p className="text-sm font-medium text-slate-500">Manage salary structures and process monthly payroll.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setSubTab("processing")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${subTab === "processing" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Process Payroll</button>
          <button onClick={() => setSubTab("structures")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${subTab === "structures" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Structures</button>
        </div>
      </div>

      {subTab === "structures" && (
        <Card className="p-6 border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Role-Based Salary Configuration</h3>
          <div className="flex gap-4 mb-6">
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full sm:w-64 p-3 rounded-xl border-2 border-slate-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 font-bold text-slate-700 outline-none transition-all">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <form onSubmit={handleSaveStructure} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Base Salary (₦)</label>
              <input name="baseSalary" type="number" defaultValue={currentStructure.baseSalary} required min="0" className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 font-bold text-slate-700 outline-none transition-all" />
            </div>
            <button type="submit" className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95">Save {selectedRole} Structure</button>
          </form>
        </Card>
      )}

      {subTab === "processing" && (
        <Card className="p-6 border-slate-200 shadow-sm overflow-x-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Monthly Payroll Processing</h3>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="p-2 rounded-lg border-2 border-slate-200 font-bold text-slate-700" />
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 font-bold uppercase tracking-wider border-b-2 border-slate-100">
              <tr>
                <th className="pb-3 px-2">Staff Member</th>
                <th className="pb-3 px-2">Role</th>
                <th className="pb-3 px-2 text-right">Base Salary</th>
                <th className="pb-3 px-2 text-right">Net Pay</th>
                <th className="pb-3 px-2 text-center">Status</th>
                <th className="pb-3 px-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.staffList.filter(s => s.status === "active").map(staff => {
                const struct = state.salaryStructures[staff.role];
                const base = struct?.baseSalary || 0;
                // Currently no deductions/allowances, so net = base
                const net = base;
                const payKey = `${staff.id}|${month}`;
                const paidRecord = state.payrollRecords[payKey];
                
                return (
                  <tr key={staff.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-2 font-bold text-slate-800">{staff.name}</td>
                    <td className="py-4 px-2 font-medium text-slate-500">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs">{staff.role}</span>
                    </td>
                    <td className="py-4 px-2 font-bold text-slate-700 text-right">₦{base.toLocaleString()}</td>
                    <td className="py-4 px-2 font-black text-green-600 text-right">₦{net.toLocaleString()}</td>
                    <td className="py-4 px-2 text-center">
                      {paidRecord ? (
                        <span className="inline-flex items-center justify-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                          <CheckCircle className="w-3 h-3" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-2 text-center">
                      {!paidRecord && base > 0 && (
                        <button onClick={() => processPayment(staff, net, base)} className="text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 active:scale-95 transition-all">
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
});

const FeesTab = memo(({ showToast }: { showToast: (msg: string, type?: string) => void }) => {
  const { state, dispatch, currentActor } = useApp();
  const { entries, classRolls, schoolSettings } = state;
  const { role } = useAuth();
  
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  const session = schoolSettings?.session || "2024/2025";
  const term = schoolSettings?.term || "First Term";
  const periodKey = `${session}__${term}`;

  const [sessionToken, setSessionToken] = useState("");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("schoolapp_tenant_session_v2");
      if (raw) setSessionToken(JSON.parse(raw).sessionToken);
    } catch {}
  }, []);

  // Fee structure: { [class]: { [periodKey]: { tuition, items: [{label, amount}] } } }
  const [structures, setStructures] = useState<Record<string, Record<string, { tuition: number; items: { label: string; amount: number }[] }>>>(() => {
    try { return JSON.parse(localStorage.getItem(FEE_STRUCT_LS) || "{}"); } catch { return {}; }
  });
  // Payments: { [class|student|periodKey]: { paid: number, history: [{amount, date}] } }
  const [payments, setPayments] = useState<Record<string, { paid: number; history: { amount: number; date: string; note?: string }[] }>>(() => {
    try { return JSON.parse(localStorage.getItem(FEES_LS) || "{}"); } catch { return {}; }
  });

  // Sync from Supabase on mount
  useEffect(() => {
    if (!sessionToken) return;
    import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data, error } = await supabase.rpc("get_fee_data", { _session_token: sessionToken });
      if (error || !data) return;
      
      const newStructs: Record<string, any> = {};
      const newPayments: Record<string, any> = {};

      data.forEach((row: any) => {
        const pKey = `${row.academic_year}__${row.term}`;
        if (row.class_name && row.fee_id) {
          if (!newStructs[row.class_name]) newStructs[row.class_name] = {};
          let parsed = { tuition: Number(row.fee_amount) || 0, items: [] };
          try { if (row.fee_name?.startsWith("{")) parsed = JSON.parse(row.fee_name); } catch {}
          newStructs[row.class_name][pKey] = parsed;
        }
        if (row.payment_id && row.student_name && row.class_name) {
          const k = `${row.class_name}|${row.student_name}|${pKey}`;
          if (!newPayments[k]) newPayments[k] = { paid: 0, history: [] };
          newPayments[k].paid += Number(row.paid_amount) || 0;
          newPayments[k].history.push({
            amount: Number(row.paid_amount) || 0,
            date: row.paid_at,
            note: row.paid_by
          });
        }
      });
      // Merge with any local offline data (prioritizing remote if exists)
      setStructures(prev => ({ ...prev, ...newStructs }));
      setPayments(prev => ({ ...prev, ...newPayments }));
    });
  }, [sessionToken]);

  const [activeClass, setActiveClass] = useState<string>("");
  const [editingStructure, setEditingStructure] = useState(false);
  const [tuitionInput, setTuitionInput] = useState("");
  const [itemsInput, setItemsInput] = useState<{ label: string; amount: number }[]>([]);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [payingStudent, setPayingStudent] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Persist
  useEffect(() => { localStorage.setItem(FEE_STRUCT_LS, JSON.stringify(structures)); }, [structures]);
  useEffect(() => { localStorage.setItem(FEES_LS, JSON.stringify(payments)); }, [payments]);

  // Classes with enrolled students (from rolls or entries)
  const classes = useMemo(() => {
    const fromRolls = Object.keys(classRolls).filter(c => (classRolls[c] || []).length > 0);
    const fromEntries = [...new Set(entries.map(e => e.studentClass))];
    return [...new Set([...fromRolls, ...fromEntries])].sort();
  }, [classRolls, entries]);

  useEffect(() => { if (!activeClass && classes.length > 0) setActiveClass(classes[0]); }, [classes, activeClass]);

  // Students enrolled in the active class (roll first, fallback to entries)
  const studentsInClass = useMemo(() => {
    if (!activeClass) return [] as string[];
    const roll = classRolls[activeClass] || [];
    if (roll.length > 0) return roll.map(r => r.name);
    return [...new Set(entries.filter(e => e.studentClass === activeClass).map(e => e.studentName))];
  }, [activeClass, classRolls, entries]);

  const currentStructure = structures[activeClass]?.[periodKey];
  const expectedPerStudent = currentStructure
    ? (currentStructure.tuition || 0) + currentStructure.items.reduce((s, i) => s + (i.amount || 0), 0)
    : 0;

  const openStructureEditor = () => {
    setTuitionInput(String(currentStructure?.tuition || ""));
    setItemsInput(currentStructure?.items ? [...currentStructure.items] : []);
    setNewItemLabel(""); setNewItemAmount("");
    setEditingStructure(true);
  };

  const saveStructure = () => {
    const tuition = parseFloat(tuitionInput) || 0;
    const items = itemsInput;
    const totalAmount = tuition + items.reduce((s, i) => s + (i.amount || 0), 0);
    const detailsJson = JSON.stringify({ tuition, items });

    setStructures(prev => ({
      ...prev,
      [activeClass]: {
        ...(prev[activeClass] || {}),
        [periodKey]: { tuition, items },
      },
    }));
    setEditingStructure(false);
    showToast(`Fee structure saved for ${activeClass}`, "success");

    if (sessionToken) {
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { error } = await supabase.rpc("save_fee_structure", {
          _session_token: sessionToken,
          _class_name: activeClass,
          _term: term,
          _academic_year: session,
          _amount: totalAmount,
          _details: detailsJson
        });
        if (error) console.error("Failed to save fee structure to Supabase:", error);
        else {
          const tInfo = JSON.parse(sessionStorage.getItem("schoolapp_tenant_session_v2") || "{}");
          syncActivityLog(tInfo.tenantId, currentActor, "Updated Fee Structure", `${activeClass} (${term}): ₦${totalAmount.toLocaleString()}`);
          dispatch({ type: "LOG_ACTIVITY", payload: mkLog("Updated", `${activeClass} (${term})`, "Fee Structure", `₦${totalAmount.toLocaleString()}`, currentActor) });
        }
      });
    }
  };

  const addItem = () => {
    if (!newItemLabel.trim() || !newItemAmount) return;
    setItemsInput(prev => [...prev, { label: newItemLabel.trim(), amount: parseFloat(newItemAmount) || 0 }]);
    setNewItemLabel(""); setNewItemAmount("");
  };

  const recordPayment = () => {
    if (!payingStudent || !payAmount) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) { showToast("Enter a valid amount", "error"); return; }
    
    const key = `${activeClass}|${payingStudent}|${periodKey}`;
    const currentPaid = payments[key]?.paid || 0;
    const balance = Math.max(expectedPerStudent - currentPaid, 0);
    
    if (amt > balance) {
      showToast(`Amount cannot exceed the outstanding balance of ₦${balance.toLocaleString()}`, "error");
      return;
    }

    setPayments(prev => {
      const cur = prev[key] || { paid: 0, history: [] };
      return {
        ...prev,
        [key]: {
          paid: cur.paid + amt,
          history: [...cur.history, { amount: amt, date: new Date().toISOString(), note: payNote.trim() || undefined }],
        },
      };
    });
    showToast(`₦${amt.toLocaleString()} recorded for ${payingStudent}`, "success");
    setReceiptData({ student: payingStudent, amount: amt, balance: balance - amt, term: term });
    setPayingStudent(null);
    setShowReceiptModal(true);

    if (sessionToken) {
      const rollStudent = classRolls[activeClass]?.find(s => s.name === payingStudent);
      const admNo = getOrAssignAdmNo(rollStudent, activeClass, payingStudent, classRolls, dispatch);
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { error } = await supabase.rpc("record_payment", {
          _session_token: sessionToken,
          _admission_no: admNo,
          _student_name: payingStudent,
          _class_name: activeClass,
          _term: term,
          _academic_year: session,
          _amount: amt,
          _note: payNote.trim() || ""
        });
        if (error) console.error("Failed to record payment to Supabase:", error);
        else {
          const tInfo = JSON.parse(sessionStorage.getItem("schoolapp_tenant_session_v2") || "{}");
          syncActivityLog(tInfo.tenantId, currentActor, "Recorded Fee Payment", `Received ₦${amt.toLocaleString()} from ${payingStudent} (${activeClass})`);
          dispatch({ type: "LOG_ACTIVITY", payload: mkLog("Recorded", payingStudent, "Fee Payment", `₦${amt.toLocaleString()} (${activeClass})`, currentActor) });
        }
      });
    }

    setPayingStudent(null); setPayAmount(""); setPayNote("");
  };

  const statusOf = (paid: number, expected: number) => {
    if (expected <= 0) return { label: "No Structure", color: "bg-slate-100 text-slate-500" };
    if (paid <= 0) return { label: "Outstanding", color: "bg-red-100 text-red-700" };
    if (paid >= expected) return { label: "Paid in Full", color: "bg-emerald-100 text-emerald-700" };
    return { label: "Partial", color: "bg-amber-100 text-amber-700" };
  };

  // Aggregate stats for active class
  const stats = useMemo(() => {
    const expectedTotal = expectedPerStudent * studentsInClass.length;
    let collected = 0, partial = 0, paidInFull = 0, outstanding = 0;
    studentsInClass.forEach(name => {
      const k = `${activeClass}|${name}|${periodKey}`;
      const p = payments[k]?.paid || 0;
      collected += Math.min(p, expectedPerStudent);
      if (expectedPerStudent <= 0) return;
      if (p <= 0) outstanding++;
      else if (p >= expectedPerStudent) paidInFull++;
      else partial++;
    });
    return { expectedTotal, collected, outstanding, partial, paidInFull, balance: Math.max(expectedTotal - collected, 0) };
  }, [studentsInClass, activeClass, periodKey, payments, expectedPerStudent]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 id="tour-fees-header" className="text-2xl font-black text-slate-900 uppercase">Fees</h2>
          <p className="text-sm text-slate-500 mt-1">Auto-structured tracker · {session} · {term}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-2 no-print">
            <Btn variant="outline" onClick={() => window.print()} title="Print / PDF">
              <Printer size={14}/> Print
            </Btn>
            <Btn variant="primary" onClick={() => {
              const headers = ["Student", "Total Billed", "Paid", "Balance", "Status"];
              const rows = studentsInClass.map(name => {
                const k = `${activeClass}|${name}|${periodKey}`;
                const p = payments[k]?.paid || 0;
                const bal = Math.max(expectedPerStudent - p, 0);
                const status = p >= expectedPerStudent ? "Cleared" : (p > 0 ? "Partial" : "Outstanding");
                return [name, expectedPerStudent, p, bal, status];
              });
              exportToCSV(`Fees_${activeClass}_${term}`, headers, rows);
            }} title="Export Excel">
              <Download size={14}/> Export
            </Btn>
          </div>
          <Sel value={activeClass} onChange={(e: any) => setActiveClass(e.target.value)}>
            {classes.length === 0 && <option value="">No enrolled classes</option>}
            {classes.map(c => <option key={c}>{c}</option>)}
          </Sel>
          <Btn variant="outline" onClick={openStructureEditor} disabled={!activeClass}>
            <Settings size={14}/>{currentStructure ? "Edit Structure" : "Set Structure"}
          </Btn>
        </div>
      </div>

      {!activeClass ? (
        <EmptyState icon={DollarSign} title="No classes yet" subtitle="Enrol students from Attendance roll or Score Entry to start tracking fees" />
      ) : !currentStructure ? (
        <Card className="p-8 text-center">
          <DollarSign size={32} className="mx-auto text-slate-300 mb-3"/>
          <p className="font-black text-slate-700 mb-1">No fee structure for {activeClass} ({term})</p>
          <p className="text-sm text-slate-400 mb-4">Set the tuition and extras once — it applies automatically to all {studentsInClass.length} enrolled student{studentsInClass.length === 1 ? "" : "s"}.</p>
          <Btn variant="primary" onClick={openStructureEditor}><PlusCircle size={14}/>Set Structure</Btn>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Expected",      value: stats.expectedTotal, color: "bg-slate-100 text-slate-700",  icon: Wallet },
              { label: "Collected",     value: stats.collected,     color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
              { label: "Outstanding",   value: stats.balance,       color: "bg-red-100 text-red-700",      icon: AlertTriangle },
              { label: "Per Student",   value: expectedPerStudent,  color: "bg-blue-100 text-blue-700",    icon: Users },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon size={14} className="text-slate-400" />
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.label}</p>
                </div>
                <p className={`text-xl font-black ${s.color.split(" ")[1]}`}>₦{s.value.toLocaleString()}</p>
              </Card>
            ))}
          </div>

          {/* Status counts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border-2 border-emerald-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-emerald-700">{stats.paidInFull}</p>
              <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mt-1">Paid in Full</p>
            </div>
            <div className="bg-amber-50 border-2 border-amber-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-amber-700">{stats.partial}</p>
              <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest mt-1">Partial</p>
            </div>
            <div className="bg-red-50 border-2 border-red-100 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-red-700">{stats.outstanding}</p>
              <p className="text-[10px] font-black uppercase text-red-600 tracking-widest mt-1">Outstanding</p>
            </div>
          </div>

          {/* Per-student tracker */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b-2 border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-black uppercase text-sm text-slate-800">{activeClass} · Enrolled Students</p>
                <p className="text-xs text-slate-400 mt-0.5">Expected ₦{expectedPerStudent.toLocaleString()} per student (Tuition ₦{currentStructure.tuition.toLocaleString()}{currentStructure.items.length > 0 ? ` + ${currentStructure.items.length} extra${currentStructure.items.length === 1 ? "" : "s"}` : ""})</p>
              </div>
              <span className="text-xs font-black text-slate-500">{studentsInClass.length} student{studentsInClass.length === 1 ? "" : "s"}</span>
            </div>
            {studentsInClass.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No students enrolled. Add them from Attendance roll.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {studentsInClass.map(name => {
                  const k = `${activeClass}|${name}|${periodKey}`;
                  const paid = payments[k]?.paid || 0;
                  const balance = Math.max(expectedPerStudent - paid, 0);
                  const pct = expectedPerStudent > 0 ? Math.min(Math.round((paid / expectedPerStudent) * 100), 100) : 0;
                  const st = statusOf(paid, expectedPerStudent);
                  return (
                    <div key={name} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-slate-800 truncate">{name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${st.color}`}>{st.label}</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                              <div className={`h-full ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-slate-500">{pct}%</span>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-500 flex gap-3 flex-wrap">
                            <span>Expected: <b className="text-slate-700">₦{expectedPerStudent.toLocaleString()}</b></span>
                            <span>Paid: <b className="text-emerald-700">₦{paid.toLocaleString()}</b></span>
                            <span>Balance: <b className={balance > 0 ? "text-red-700" : "text-emerald-700"}>₦{balance.toLocaleString()}</b></span>
                          </div>
                        </div>
                        <Btn variant={balance > 0 ? "primary" : "ghost"} size="sm" onClick={() => { setPayingStudent(name); setPayAmount(""); setPayNote(""); }}>
                          {balance > 0 ? <><PlusCircle size={13}/>Record Payment</> : <><Check size={13}/>Add Payment</>}
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Structure editor modal */}
      {editingStructure && (
        <Modal maxW="max-w-lg" onBgClick={() => setEditingStructure(false)}>
          <MHead icon={Wallet} title={`Fee Structure — ${activeClass}`} subtitle={`${session} · ${term}`} color="bg-blue-600" onClose={() => setEditingStructure(false)} />
          <div className="p-6 space-y-4">
            <Field label="Tuition (₦)">
              <Inp type="number" value={tuitionInput} onChange={(e: any) => setTuitionInput(e.target.value)} placeholder="0" />
            </Field>
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 mb-2">Extra Items</label>
              {itemsInput.length === 0 && <p className="text-xs text-slate-400 italic mb-2">No extras yet. Add books, uniforms, sports, etc.</p>}
              <div className="space-y-1.5 mb-3">
                {itemsInput.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg">
                    <span className="flex-1 text-sm font-medium">{it.label}</span>
                    <span className="font-black text-slate-700">₦{it.amount.toLocaleString()}</span>
                    <button onClick={() => setItemsInput(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700"><Trash2 size={13}/></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                <input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} placeholder="Item name (e.g. Books)" className="px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg text-sm"/>
                <input type="number" value={newItemAmount} onChange={e => setNewItemAmount(e.target.value)} placeholder="Amount" className="px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg text-sm"/>
                <Btn variant="outline" size="sm" onClick={addItem} disabled={!newItemLabel.trim() || !newItemAmount}><PlusCircle size={13}/></Btn>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs font-black uppercase text-blue-700">Total per student</span>
              <span className="text-lg font-black text-blue-700">₦{((parseFloat(tuitionInput) || 0) + itemsInput.reduce((s, i) => s + i.amount, 0)).toLocaleString()}</span>
            </div>
          </div>
          <div className="px-6 pb-6 grid grid-cols-2 gap-2">
            <Btn variant="ghost" onClick={() => setEditingStructure(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveStructure}><Save size={13}/>Save Structure</Btn>
          </div>
        </Modal>
      )}

      {/* Payment modal */}
      {payingStudent && (
        <Modal maxW="max-w-sm" onBgClick={() => setPayingStudent(null)}>
          <MHead icon={Wallet} title="Record Payment" subtitle={`${payingStudent} · ${activeClass}`} color="bg-emerald-600" onClose={() => setPayingStudent(null)} />
          <div className="p-6 space-y-4">
            {(() => {
              const k = `${activeClass}|${payingStudent}|${periodKey}`;
              const paid = payments[k]?.paid || 0;
              const balance = Math.max(expectedPerStudent - paid, 0);
              return (
                <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-[10px] font-black uppercase text-slate-400">Expected</p><p className="font-black text-slate-700">₦{expectedPerStudent.toLocaleString()}</p></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-400">Paid</p><p className="font-black text-emerald-700">₦{paid.toLocaleString()}</p></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-400">Balance</p><p className="font-black text-red-700">₦{balance.toLocaleString()}</p></div>
                </div>
              );
            })()}
            <Field label="Amount Received (₦)">
              <Inp type="number" value={payAmount} onChange={(e: any) => setPayAmount(e.target.value)} placeholder="0" autoFocus />
            </Field>
            <Field label="Note (optional)">
              <Inp value={payNote} onChange={(e: any) => setPayNote(e.target.value)} placeholder="e.g. Receipt #1234" />
            </Field>
          </div>
          <div className="px-6 pb-6 grid grid-cols-2 gap-2">
            <Btn variant="ghost" onClick={() => setPayingStudent(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={recordPayment} disabled={!payAmount}><Check size={13}/>Record</Btn>
          </div>
        </Modal>
      )}

      {/* Success Celebration / WhatsApp Receipt Modal */}
      {showReceiptModal && receiptData && (
        <Modal maxW="max-w-md" onBgClick={() => setShowReceiptModal(false)} zIndex={300}>
          <div className="p-8 text-center bg-white rounded-2xl">
            <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-emerald-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-2">Success!</h2>
            <p className="text-slate-500 text-lg mb-8">
              Payment of <span className="font-bold text-slate-800">₦{receiptData.amount.toLocaleString()}</span> recorded for <span className="font-bold text-slate-800">{receiptData.student}</span>.
            </p>
            <div className="flex flex-col gap-3">
              {["school_admin", "principal", "bursar", "secretary"].includes(role || "") && (
                <button 
                  className="w-full flex items-center justify-center h-14 text-lg font-bold bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl shadow-lg transition-colors"
                  onClick={() => {
                    const text = `Hello! We have safely received a school fee payment of NGN ${receiptData.amount.toLocaleString()} for ${receiptData.student} (${receiptData.term}). Outstanding balance is NGN ${receiptData.balance.toLocaleString()}. Thank you!`;
                    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                    window.open(url, "_blank");
                  }}
                >
                  <MessageSquare className="mr-2 h-6 w-6" />
                  Share Receipt via WhatsApp
                </button>
              )}
              <button 
                className="w-full flex items-center justify-center h-14 text-lg font-bold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                onClick={() => setShowReceiptModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
});

// Read fee structures and payments straight from the same localStorage keys
// the FeesTab writes to, so the dashboard always stays in sync.
const FeesOverviewCard = memo(({ schoolSettings, classRolls, entries, setActiveTab }: {
  schoolSettings: SchoolSettings;
  classRolls: Record<string, RollStudent[]>;
  entries: Entry[];
  setActiveTab: (t: string) => void;
}) => {
  const session = schoolSettings?.session || "2024/2025";
  const term = schoolSettings?.term || "First Term";
  const periodKey = `${session}__${term}`;

  // Re-read on each render of dashboard. Keep it simple and reliable.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onStorage = () => setTick(t => t + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const overview = useMemo(() => {
    let structures: Record<string, Record<string, { tuition: number; items: { label: string; amount: number }[] }>> = {};
    let payments: Record<string, { paid: number; history: any[] }> = {};
    try { structures = JSON.parse(localStorage.getItem(FEE_STRUCT_LS) || "{}"); } catch {}
    try { payments = JSON.parse(localStorage.getItem(FEES_LS) || "{}"); } catch {}

    const classes = [...new Set([
      ...Object.keys(classRolls).filter(c => (classRolls[c] || []).length > 0),
      ...entries.map(e => e.studentClass),
    ])].sort();

    let expectedTotal = 0, collectedTotal = 0;
    let paidInFull = 0, partial = 0, outstanding = 0, totalEnrolled = 0;
    const perClass: { className: string; expected: number; collected: number; balance: number; pct: number; students: number; structured: boolean }[] = [];

    classes.forEach(cls => {
      const struct = structures[cls]?.[periodKey];
      const expectedPerStudent = struct ? (struct.tuition || 0) + struct.items.reduce((s, i) => s + (i.amount || 0), 0) : 0;
      const roll = classRolls[cls] || [];
      const studentNames = roll.length > 0
        ? roll.map(r => r.name)
        : [...new Set(entries.filter(e => e.studentClass === cls).map(e => e.studentName))];
      totalEnrolled += studentNames.length;

      const classExpected = expectedPerStudent * studentNames.length;
      let classCollected = 0;
      studentNames.forEach(name => {
        const k = `${cls}|${name}|${periodKey}`;
        const p = payments[k]?.paid || 0;
        classCollected += Math.min(p, expectedPerStudent || p);
        if (expectedPerStudent <= 0) return;
        if (p <= 0) outstanding++;
        else if (p >= expectedPerStudent) paidInFull++;
        else partial++;
      });

      expectedTotal += classExpected;
      collectedTotal += classCollected;
      perClass.push({
        className: cls,
        expected: classExpected,
        collected: classCollected,
        balance: Math.max(classExpected - classCollected, 0),
        pct: classExpected > 0 ? Math.round((classCollected / classExpected) * 100) : 0,
        students: studentNames.length,
        structured: !!struct,
      });
    });

    const collectionRate = expectedTotal > 0 ? Math.round((collectedTotal / expectedTotal) * 100) : 0;
    return {
      expectedTotal, collectedTotal, balance: Math.max(expectedTotal - collectedTotal, 0),
      paidInFull, partial, outstanding, totalEnrolled, collectionRate,
      perClass: perClass.sort((a, b) => b.expected - a.expected),
    };
  }, [tick, classRolls, entries, periodKey]); // tick re-evaluates when storage changes

  return (
    <Card>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Wallet size={14} className="text-emerald-500" />
        <p className="text-sm font-black uppercase text-slate-600">Fees Overview · {term}</p>
        <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-md ${
          overview.collectionRate >= 80 ? "bg-emerald-100 text-emerald-700" :
          overview.collectionRate >= 50 ? "bg-amber-100 text-amber-700" :
          "bg-red-100 text-red-700"
        }`}>{overview.collectionRate}% collected</span>
        <button onClick={() => setActiveTab("fees")} className="text-xs font-black text-blue-600 hover:text-blue-700">Manage →</button>
      </div>

      {overview.expectedTotal === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-slate-400 font-bold mb-2">No fee structures set yet for this term.</p>
          <Btn variant="outline" size="sm" onClick={() => setActiveTab("fees")}><PlusCircle size={12}/>Set Fee Structure</Btn>
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-3 gap-0 border-b border-slate-100">
            <div className="px-4 py-4 border-r border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Expected</p>
              <p className="text-lg font-black text-slate-800 mt-1">₦{overview.expectedTotal.toLocaleString()}</p>
            </div>
            <div className="px-4 py-4 border-r border-slate-100">
              <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Collected</p>
              <p className="text-lg font-black text-emerald-700 mt-1">₦{overview.collectedTotal.toLocaleString()}</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Outstanding</p>
              <p className="text-lg font-black text-red-700 mt-1">₦{overview.balance.toLocaleString()}</p>
            </div>
          </div>

          {/* Status counts */}
          <div className="grid grid-cols-3 gap-0 border-b border-slate-100 text-center">
            <div className="px-4 py-3 border-r border-slate-100">
              <p className="text-2xl font-black text-emerald-700">{overview.paidInFull}</p>
              <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Paid in Full</p>
            </div>
            <div className="px-4 py-3 border-r border-slate-100">
              <p className="text-2xl font-black text-amber-700">{overview.partial}</p>
              <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Partial</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-2xl font-black text-red-700">{overview.outstanding}</p>
              <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Outstanding</p>
            </div>
          </div>

          {/* Per-class progress */}
          <div className="divide-y divide-slate-50 max-h-[260px] overflow-y-auto">
            {overview.perClass.map(c => (
              <button key={c.className} onClick={() => setActiveTab("fees")}
                className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-slate-800 truncate">{c.className}</p>
                    {!c.structured && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">NO STRUCTURE</span>}
                    <span className="text-[10px] text-slate-400 font-bold">{c.students} student{c.students === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${c.pct >= 80 ? "bg-emerald-500" : c.pct >= 50 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${c.pct}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 min-w-[32px] text-right">{c.pct}%</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black text-emerald-700">₦{c.collected.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-bold">/ ₦{c.expected.toLocaleString()}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
});

const ResourcesTab = memo(({ showToast }: { showToast: (msg: string, type?: string) => void }) => {
  const { state } = useApp();
  const [selectedStandard, setSelectedStandard] = useState("NAPPS");
  const [syncStatus, setSyncStatus] = useState<Record<string, { synced: boolean; lastSync?: string }>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedSection, setSelectedSection] = useState<"curriculum" | "notes" | "sources">("curriculum");
  const [selectedLevel, setSelectedLevel] = useState("Lower Primary");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [searchNotes, setSearchNotes] = useState("");
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<string>("All");
  const [sourceSearch, setSourceSearch] = useState("");
  const [savedResources, setSavedResources] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("saved_resources");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const toggleSaveResource = (id: string) => {
    setSavedResources(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem("saved_resources", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const filteredSources = useMemo(() => {
    return RESOURCE_SOURCES.filter(src => {
      const matchesCoverage = coverageFilter === "All" || src.coverage.includes(coverageFilter);
      const matchesSearch = !sourceSearch ||
        src.name.toLowerCase().includes(sourceSearch.toLowerCase()) ||
        src.description.toLowerCase().includes(sourceSearch.toLowerCase()) ||
        src.type.toLowerCase().includes(sourceSearch.toLowerCase());
      return matchesCoverage && matchesSearch;
    });
  }, [coverageFilter, sourceSearch]);

  const handleSync = async (standard: string) => {
    setIsSyncing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setSyncStatus(prev => ({
        ...prev,
        [standard]: { synced: true, lastSync: new Date().toLocaleString() }
      }));
      showToast(`Successfully synced with ${standard} curriculum standards`, "success");
    } catch {
      showToast(`Failed to sync with ${standard}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadCurriculum = async (level: string, data: any) => {
    setDownloadingPDF(`curr-${level}`);
    try {
      const ok = await downloadCurriculumGuidePDF(level, data);
      if (ok) showToast(`Downloaded NAPPS Curriculum Guide for ${level}`, "success");
      else showToast("Failed to generate PDF", "error");
    } finally {
      setDownloadingPDF(null);
    }
  };

  const handleDownloadNotes = async (level: string, subject: string, notes: any[]) => {
    setDownloadingPDF(`notes-${level}-${subject}`);
    try {
      const ok = await downloadENotePDF(level, subject, notes);
      if (ok) showToast(`Downloaded E-Notes for ${level} - ${subject}`, "success");
      else showToast("Failed to generate PDF", "error");
    } finally {
      setDownloadingPDF(null);
    }
  };

  const standards = [
    { id: "NAPPS", name: "NAPPS", description: "National Association of Proprietors of Private Schools", icon: "🏫" },
    { id: "NERDC", name: "NERDC", description: "Nigerian Educational Research and Development Council", icon: "📚" },
    { id: "WAEC", name: "WAEC", description: "West African Examinations Council", icon: "📝" },
    { id: "NECO", name: "NECO", description: "National Examinations Council", icon: "🎓" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 id="tour-resources-header" className="text-2xl font-black text-slate-900">Curriculum Resources</h2>
          <p className="text-sm text-slate-500 mt-1">Sync curriculum, access e-notes & external resources</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedSection("curriculum")}
            className={`px-4 py-2.5 min-h-[48px] rounded-lg text-xs font-black uppercase transition-all ${
              selectedSection === "curriculum"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Curriculum Sync
          </button>
          <button
            onClick={() => setSelectedSection("notes")}
            className={`px-4 py-2.5 min-h-[48px] rounded-lg text-xs font-black uppercase transition-all ${
              selectedSection === "notes"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            E-Notes
          </button>
          <button
            onClick={() => setSelectedSection("sources")}
            className={`px-4 py-2.5 min-h-[48px] rounded-lg text-xs font-black uppercase transition-all ${
              selectedSection === "sources"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            External Sources
          </button>
        </div>
      </div>

      {selectedSection === "curriculum" ? (
        <>
          <Card className="p-6 border-2 border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-900">Current Curriculum Structure</h3>
                <p className="text-xs text-slate-400 mt-1">Based on your school's class and subject configuration</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                <CheckCircle size={14} className="text-emerald-600" />
                <span className="text-xs font-black text-emerald-700">Active</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {((state.schoolSettings as any)?.curriculumLevels ?? Object.keys(CURRICULUM)).map((level: string) => (
                <div key={level} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <GraduationCap size={18} className="text-blue-600" />
                    <h4 className="font-black text-slate-900">{level}</h4>
                  </div>
                  <p className="text-xs text-slate-500">{CURRICULUM[level]?.classes?.length || 0} classes configured</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 border-2 border-slate-100">
            <div className="mb-6">
              <h3 className="text-lg font-black text-slate-900">Educational Body Standards Sync</h3>
              <p className="text-xs text-slate-400 mt-1">Sync curriculum standards with accredited educational bodies</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {standards.map(std => (
                <div key={std.id} className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{std.icon}</span>
                    <div>
                      <h4 className="font-black text-slate-900">{std.name}</h4>
                      <p className="text-xs text-slate-500">{std.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {syncStatus[std.id]?.synced ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                        <CheckCircle size={14} className="text-emerald-600" />
                        <span className="text-xs font-black text-emerald-700">Synced</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSync(std.id)}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        {isSyncing ? "Syncing..." : "Sync"}
                      </button>
                    )}
                    {std.id === "NAPPS" && (
                      <button
                        onClick={() => setSelectedStandard(std.id)}
                        className="px-4 py-2 border-2 border-slate-200 rounded-lg text-xs font-black uppercase hover:bg-slate-50 transition-all"
                      >
                        View
                      </button>
                    )}
                  </div>
                  {syncStatus[std.id]?.lastSync && (
                    <p className="text-[10px] text-slate-400 mt-2">Last sync: {syncStatus[std.id].lastSync}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {selectedStandard === "NAPPS" && (
            <Card className="p-6 border-2 border-slate-100">
              <div className="mb-6">
                <h3 className="text-lg font-black text-slate-900">NAPPS Curriculum Standards</h3>
                <p className="text-xs text-slate-400 mt-1">National Association of Proprietors of Private Schools - Approved Curriculum</p>
              </div>
              <div className="space-y-4">
                {Object.entries(NAPPS_CURRICULUM).map(([key, data]) => (
                  <div key={key} className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <h4 className="font-black text-slate-900">{key}</h4>
                        <p className="text-xs text-slate-500">{data.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-black">{data.classes.length} Classes</span>
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-black">{data.subjects.length} Subjects</span>
                        <button
                          onClick={() => handleDownloadCurriculum(key, data)}
                          disabled={downloadingPDF === `curr-${key}`}
                          className="ml-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-700 transition-all flex items-center gap-1 disabled:opacity-50"
                        >
                          {downloadingPDF === `curr-${key}` ? (
                            <>Generating...</>
                          ) : (
                            <><FileText size={12} /> Download PDF</>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Classes</p>
                        <div className="flex flex-wrap gap-1">
                          {data.classes.map(cls => (
                            <span key={cls} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600">{cls}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Subjects</p>
                        <div className="flex flex-wrap gap-1">
                          {data.subjects.slice(0, 8).map(sub => (
                            <span key={sub} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-600">{sub}</span>
                          ))}
                          {data.subjects.length > 8 && (
                            <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-medium text-slate-500">+{data.subjects.length - 8} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : selectedSection === "notes" ? (
        <>
          <Card className="p-6 border-2 border-slate-100">
            <div className="mb-6">
              <h3 className="text-lg font-black text-slate-900">NAPPS E-Notes</h3>
              <p className="text-xs text-slate-400 mt-1">Educational notes and resources aligned with NAPPS curriculum</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Curriculum Level</label>
                <Sel value={selectedLevel} onChange={(e: any) => { setSelectedLevel(e.target.value); setSelectedSubject(""); }}>
                  {Object.keys(E_NOTES).map(level => <option key={level}>{level}</option>)}
                </Sel>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Subject</label>
                <Sel value={selectedSubject} onChange={(e: any) => setSelectedSubject(e.target.value)} disabled={!selectedLevel}>
                  <option value="">Select level first</option>
                  {selectedLevel && Object.keys(E_NOTES[selectedLevel] || {}).map(sub => <option key={sub}>{sub}</option>)}
                </Sel>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-400 mb-2">Search Topics</label>
                <input
                  type="text"
                  value={searchNotes}
                  onChange={(e) => setSearchNotes(e.target.value)}
                  placeholder="Search topics..."
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            {selectedLevel && selectedSubject ? (
              <div className="space-y-4">
                {E_NOTES[selectedLevel]?.[selectedSubject] && E_NOTES[selectedLevel][selectedSubject].length > 0 && (
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => handleDownloadNotes(selectedLevel, selectedSubject, E_NOTES[selectedLevel][selectedSubject])}
                      disabled={downloadingPDF === `notes-${selectedLevel}-${selectedSubject}`}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {downloadingPDF === `notes-${selectedLevel}-${selectedSubject}` ? (
                        <>Generating PDF...</>
                      ) : (
                        <><FileText size={14} /> Download All as PDF</>
                      )}
                    </button>
                  </div>
                )}
                {E_NOTES[selectedLevel]?.[selectedSubject]?.filter(note =>
                  !searchNotes ||
                  note.title.toLowerCase().includes(searchNotes.toLowerCase()) ||
                  note.topics.some(topic => topic.toLowerCase().includes(searchNotes.toLowerCase()))
                ).map((note, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-5 border border-slate-100 hover:border-blue-200 transition-all">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <h4 className="font-black text-slate-900 flex-1">{note.title}</h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-black">
                          {note.topics.length} Topics
                        </span>
                        <button
                          onClick={() => handleDownloadNotes(selectedLevel, `${selectedSubject}_${note.title}`, [note])}
                          className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-black hover:bg-emerald-100 transition-all flex items-center gap-1"
                          title="Download this note as PDF"
                        >
                          <FileText size={10} /> PDF
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">{note.content}</p>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Topics Covered</p>
                      <div className="flex flex-wrap gap-1">
                        {note.topics.map((topic, tIdx) => (
                          <span key={tIdx} className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-medium text-emerald-700">{topic}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <BookOpen size={48} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 font-medium">Select a curriculum level and subject to view e-notes</p>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card className="p-0 border-2 border-slate-100 overflow-hidden">
            <div className="sticky top-0 bg-white z-10 border-b border-slate-100 p-4 space-y-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">External Curriculum Resources</h3>
                <p className="text-xs text-slate-400 mt-1">Curated educational platforms for Nigerian schools</p>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="Search resources..."
                  className="w-full pl-10 pr-4 py-3 min-h-[48px] bg-slate-50 border-2 border-slate-100 rounded-xl font-medium focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {["All", "Nursery", "Primary", "Secondary"].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setCoverageFilter(filter)}
                    className={`px-4 py-2 min-h-[40px] rounded-full text-xs font-black transition-all ${
                      coverageFilter === filter
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-3">
              {filteredSources.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen size={48} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 font-medium">No resources match your filters</p>
                </div>
              ) : (
                filteredSources.map(src => {
                  const isSaved = savedResources.has(src.id);
                  return (
                    <div key={src.id} className="bg-white border-2 border-slate-100 rounded-xl p-4 hover:border-blue-200 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="text-3xl flex-shrink-0">{src.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-black text-slate-900 truncate">{src.name}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex-shrink-0 ${src.badgeColor}`}>
                              {src.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mb-3">{src.description}</p>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {src.coverage.map(cov => (
                              <span key={cov} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                {cov}
                              </span>
                            ))}
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">
                              {src.type}
                            </span>
                            {src.id === "nerdc" && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-black">
                                ✓ NERDC Aligned
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => showToast(`Opening ${src.name}...`, "success")}
                              className="flex-1 min-h-[48px] px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                            >
                              <Eye size={14} /> Visit Site
                            </a>
                            <button
                              onClick={() => {
                                toggleSaveResource(src.id);
                                showToast(isSaved ? "Removed from library" : "Saved to library", "success");
                              }}
                              className={`min-h-[48px] px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 border-2 ${
                                isSaved
                                  ? "bg-amber-50 border-amber-300 text-amber-700"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                              }`}
                              title={isSaved ? "Remove from library" : "Save to library"}
                            >
                              <BookMarked size={14} /> {isSaved ? "Saved" : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-5 border-2 border-blue-100 bg-blue-50">
            <div className="flex gap-3">
              <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-black text-blue-900 text-sm">How Resources Work</h4>
                <ul className="text-xs text-blue-700 space-y-1 font-medium">
                  <li>• <strong>Deep Links:</strong> Click "Visit Site" to open resources in a new tab</li>
                  <li>• <strong>Save to Library:</strong> Bookmark resources for quick access later</li>
                  <li>• <strong>Offline Use:</strong> Download PDFs from E-Notes section for offline access</li>
                  <li>• <strong>NERDC Aligned:</strong> Resources marked with this badge follow official Nigerian curriculum</li>
                </ul>
              </div>
            </div>
          </Card>

          {savedResources.size > 0 && (
            <Card className="p-5 border-2 border-amber-100 bg-amber-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <BookMarked size={20} className="text-amber-600" />
                  <div>
                    <h4 className="font-black text-amber-900 text-sm">Your Saved Library</h4>
                    <p className="text-xs text-amber-700">{savedResources.size} resource{savedResources.size !== 1 ? 's' : ''} saved</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSavedResources(new Set());
                    try { localStorage.removeItem("saved_resources"); } catch {}
                    showToast("Library cleared", "success");
                  }}
                  className="px-4 py-2 min-h-[40px] bg-white border-2 border-amber-300 text-amber-700 rounded-lg text-xs font-black uppercase hover:bg-amber-100 transition-all"
                >
                  Clear All
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
});

// ─── Result Checker Panel ──────────────────────────────────────────────────
const ResultCheckerPanel = memo(({ tenantId, schoolSettings, dispatch, appState, showToast }: any) => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [genClass, setGenClass] = useState("");
  const [genTerm, setGenTerm] = useState("first");
  const [genLoading, setGenLoading] = useState(false);

  const isEnabled = schoolSettings?.features?.result_checker === true;
    const classes = ALL_CLASSES;
  
  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const { fetchResultCheckerTokens } = await import("@/supabase/schoolService");
      const data = await fetchResultCheckerTokens(tenantId);
      setTokens(data);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [tenantId, showToast]);

  useEffect(() => {
    if (isEnabled) fetchTokens();
  }, [isEnabled, fetchTokens]);

  const toggleFeature = async () => {
      const newStatus = !isEnabled;
      // Optimistically update UI immediately
      dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { ...schoolSettings, features: { ...schoolSettings.features, result_checker: newStatus } } });
      
      try {
        const { updateSchoolProfile } = await import("@/supabase/schoolService");
        await updateSchoolProfile(tenantId, { features: { ...schoolSettings.features, result_checker: newStatus } });
        showToast(`Result Checker ${newStatus ? "Enabled" : "Disabled"}!`);
      } catch (e: any) {
        // Rollback on failure
        dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { ...schoolSettings, features: { ...schoolSettings.features, result_checker: !newStatus } } });
        showToast(e.message, "error");
      }
    };

  const handleGenerate = async () => {
    if (!genClass) return showToast("Select a class first", "error");
    const roll = appState.classRolls[genClass] || [];
    if (!roll.length) return showToast("No students in this class", "error");
    
    try {
      setGenLoading(true);
      const { generateTokensForClass } = await import("@/supabase/schoolService");
      const studentsToTokenize = roll.map((s: any) => ({
        id: s.id,
        admission_no: s.admNo || "",
        name: s.name || "",
        class_name: genClass,
      }));
      await generateTokensForClass(tenantId, schoolSettings.session || "2026/2027", genTerm, studentsToTokenize);
      showToast(`Generated tokens for ${genClass}!`);
      fetchTokens();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setGenLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const { revokeToken } = await import("@/supabase/schoolService");
      await revokeToken(id);
      showToast("Token revoked");
      fetchTokens();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };
  
  const handleExportCSV = () => {
    const header = "Student,Admission No,Class,Academic Year,Term,Token,Status\n";
    const csv = tokens.map(t => {
      const tLabel = t.term === "first" ? "1st Term" : t.term === "second" ? "2nd Term" : "3rd Term";
      const studentName = t.students ? `${t.students.first_name} ${t.students.last_name}` : "Unknown";
      return `${studentName},${t.admission_no},${t.students?.class_name || "Unknown"},${t.academic_year},${tLabel},${t.token},${t.is_used ? "Used" : "Active"}`;
    }).join("\n");
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Result_Checker_Tokens_${new Date().getTime()}.csv`;
    a.click();
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase text-slate-700">Result Checker Hub</p>
          <p className="text-xs text-slate-400 mt-0.5">Manage the public portal for parents to check results online.</p>
        </div>
        <label className="flex items-center gap-3 py-2.5 px-1 cursor-pointer group">
          <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{isEnabled ? "Portal Online" : "Portal Offline"}</span>
          <div className={`relative w-10 h-5 rounded-full transition-colors ${isEnabled ? "bg-blue-600" : "bg-slate-200"}`}
            onClick={(e) => { e.preventDefault(); toggleFeature(); }}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isEnabled ? "translate-x-5" : ""}`} />
          </div>
        </label>
      </div>

      {isEnabled && (
        <>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Public Portal Link</p>
                <p className="text-xs text-slate-500">Share this link with parents</p>
              </div>
              <Btn onClick={() => { navigator.clipboard.writeText(window.location.origin + "/check/" + (tenantId || "DEMO")); showToast("Link copied!"); }}>Copy Link</Btn>
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-600 break-all">
              {window.location.origin}/check/{tenantId || "DEMO"}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-sm font-bold text-slate-800 mb-4">Batch Generate Access Tokens</p>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Class</label>
                <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" value={genClass} onChange={e => setGenClass(e.target.value)}>
                  <option value="">-- Select Class --</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Term</label>
                <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" value={genTerm} onChange={e => setGenTerm(e.target.value)}>
                  <option value="first">1st Term</option>
                  <option value="second">2nd Term</option>
                  <option value="third">3rd Term</option>
                </select>
              </div>
              <Btn onClick={handleGenerate} disabled={genLoading}>
                {genLoading ? "Generating..." : "Generate PINs"}
              </Btn>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">Token Manager</p>
              <Btn onClick={handleExportCSV} disabled={tokens.length === 0} className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 text-xs py-1.5">
                Export to CSV
              </Btn>
            </div>
            
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3 font-mono">PIN / Token</th>
                    <th className="px-4 py-3">Term</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading tokens...</td></tr>
                  ) : tokens.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No tokens generated yet.</td></tr>
                  ) : (
                    tokens.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-700">{t.students ? `${t.students.first_name} ${t.students.last_name}` : "Unknown"}</p>
                          <p className="text-[10px] text-slate-400 uppercase">{t.admission_no}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{t.students?.class_name || "Unknown"}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(t.token);
                              showToast("Token copied to clipboard!");
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-mono text-xs font-bold tracking-wider transition-colors border border-slate-200 shadow-sm"
                            title="Copy Token"
                          >
                            {t.token}
                            <Copy size={13} className="text-slate-400" />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {t.term === "first" ? "1st Term" : t.term === "second" ? "2nd Term" : "3rd Term"} {t.academic_year}
                        </td>
                        <td className="px-4 py-3">
                          {t.is_used ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase">Used</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleRevoke(t.id)} className="text-red-500 hover:text-red-700 text-xs font-bold uppercase px-2 py-1 rounded hover:bg-red-50">Revoke</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Card>
  );
});


// 🏆🏆🏆 Promotion Wizard 🏆🏆🏆
const PromotionWizard = memo(({ onClose, tenantId }: { onClose: () => void; tenantId?: string }) => {
  const { state } = useApp();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [retained, setRetained] = useState<Record<string, string[]>>({});
  
  // Calculate unique classes
  const classesList = useMemo(() => {
    return Array.from(new Set([
      ...Object.keys(state.classRolls),
      ...state.entries.map(e => e.class),
      ...state.attendance.map(a => a.studentClass)
    ])).filter(Boolean).sort();
  }, [state.classRolls, state.entries, state.attendance]);

  // Load students for retention selection
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (step === 2 && tenantId) {
      setLoading(true);
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { data } = await supabase.from("students").select("id, first_name, last_name, class_name").eq("school_id", tenantId).eq("status", "active");
        if (data) {
          const grouped: Record<string, any[]> = {};
          data.forEach(s => {
            if (!grouped[s.class_name]) grouped[s.class_name] = [];
            grouped[s.class_name].push(s);
          });
          setStudentsByClass(grouped);
        }
        setLoading(false);
      });
    }
  }, [step, tenantId]);

  const handleExecute = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { supabase } = await import("@/integrations/supabase/client");

    try {
      // 1. Filter out DO_NOT_PROMOTE
      const activeMappings = Object.entries(mappings).filter(([_, target]) => target !== "DO_NOT_PROMOTE");
      
      // 2. Topological sort to avoid overlap
      const graph: Record<string, string> = {};
      const inDegree: Record<string, number> = {};
      activeMappings.forEach(([src, tgt]) => {
        if (tgt !== "GRADUATE") {
          graph[src] = tgt;
          if (inDegree[tgt] === undefined) inDegree[tgt] = 0;
          inDegree[tgt]++;
        }
        if (inDegree[src] === undefined) inDegree[src] = 0;
      });

      const queue: string[] = Object.keys(inDegree).filter(k => inDegree[k] === 0);
      const order: string[] = [];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        order.push(curr);
        const tgt = graph[curr];
        if (tgt) {
          inDegree[tgt]--;
          if (inDegree[tgt] === 0) queue.push(tgt);
        }
      }
      
      // Execute from end of topological sort to beginning (i.e. highest class first)
      const executionOrder = order.reverse();
      
      for (const currentClass of executionOrder) {
        const targetClass = mappings[currentClass];
        if (!targetClass) continue;
        
        const retainedIds = retained[currentClass] || [];

        if (targetClass === "GRADUATE") {
          let q = supabase.from("students").update({ status: "graduated", updated_at: new Date().toISOString() })
            .eq("school_id", tenantId).eq("class_name", currentClass).eq("status", "active");
          if (retainedIds.length > 0) q = q.not("id", "in", `(${retainedIds.join(',')})`);
          await q;
        } else {
          let q = supabase.from("students").update({ class_name: targetClass, updated_at: new Date().toISOString() })
            .eq("school_id", tenantId).eq("class_name", currentClass).eq("status", "active");
          if (retainedIds.length > 0) q = q.not("id", "in", `(${retainedIds.join(',')})`);
          await q;
        }
      }
      
      alert("Promotion completed successfully! The page will now reload.");
      window.location.reload();
      
    } catch (err: any) {
      console.error(err);
      alert("Error during promotion: " + err.message);
      setLoading(false);
    }
  };

  const hasPromotions = Object.values(mappings).some(v => v !== "DO_NOT_PROMOTE");

  return (
    <Modal maxW="max-w-2xl" onBgClick={onClose} zIndex={400}>
      <MHead icon={AlertTriangle} title="Smart Promotion Wizard" subtitle="Move students to their next classes for the new session" color="bg-indigo-600" onClose={onClose} />
      
      <div className="p-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
              <h3 className="font-bold text-indigo-800">Step 1: Map Classes</h3>
              <p className="text-sm text-indigo-600">Where should students in each current class go next?</p>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {classesList.map(c => (
                <div key={c} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex-1 font-bold text-slate-700">{c}</div>
                  <ChevronRight className="text-slate-400 shrink-0 hidden sm:block" size={16} />
                  <select 
                    value={mappings[c] || "DO_NOT_PROMOTE"}
                    onChange={e => setMappings(prev => ({ ...prev, [c]: e.target.value }))}
                    className="flex-1 p-2 bg-white border border-slate-200 rounded-md font-medium text-sm"
                  >
                    <option value="DO_NOT_PROMOTE">Do not promote (Retain all)</option>
                    <option value="GRADUATE">🎓 Graduate / Leave School</option>
                    <optgroup label="Promote to Class:">
                      {classesList.filter(tc => tc !== c).map(tc => (
                        <option key={tc} value={tc}>{tc}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              ))}
              {classesList.length === 0 && <p className="text-slate-500 text-sm italic">No classes found in this school yet.</p>}
            </div>

            <div className="flex justify-end pt-4">
              <Btn variant="primary" onClick={() => setStep(2)} disabled={!hasPromotions}>Next Step: Retain Students</Btn>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
              <h3 className="font-bold text-amber-800">Step 2: Retain Students</h3>
              <p className="text-sm text-amber-600">Select any specific students who should NOT be promoted with their class.</p>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading student lists...</div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-6">
                {classesList.filter(c => mappings[c] && mappings[c] !== "DO_NOT_PROMOTE").map(c => (
                  <div key={c} className="space-y-2">
                    <h4 className="font-bold text-slate-700 flex justify-between border-b pb-1">
                      <span>{c} <span className="text-sm font-normal text-slate-500">({studentsByClass[c]?.length || 0} students)</span></span>
                      <span className="text-sm text-indigo-600">Going to: {mappings[c] === "GRADUATE" ? "Graduation" : mappings[c]}</span>
                    </h4>
                    {(!studentsByClass[c] || studentsByClass[c].length === 0) ? (
                      <p className="text-xs text-slate-400 italic">No active students found in this class.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {studentsByClass[c].map(s => {
                          const isRetained = retained[c]?.includes(s.id);
                          return (
                            <label key={s.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${isRetained ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                              <input 
                                type="checkbox" 
                                checked={isRetained || false}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setRetained(prev => {
                                    const current = prev[c] || [];
                                    if (checked) return { ...prev, [c]: [...current, s.id] };
                                    return { ...prev, [c]: current.filter(id => id !== s.id) };
                                  });
                                }}
                                className="rounded text-red-500 focus:ring-red-500"
                              />
                              <span className={`text-sm font-medium ${isRetained ? 'text-red-700' : 'text-slate-700'}`}>
                                {s.first_name} {s.last_name}
                              </span>
                              {isRetained && <span className="ml-auto text-xs font-bold text-red-500 uppercase">Retained</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Btn variant="ghost" onClick={() => setStep(1)}>Back</Btn>
              <Btn variant="primary" onClick={() => setStep(3)}>Review & Execute</Btn>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
              <h3 className="font-bold text-emerald-800">Final Review</h3>
              <p className="text-sm text-emerald-600">Review your promotion plan before executing. This will update the database permanently.</p>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 font-medium">
                {Object.entries(mappings).filter(([_, m]) => m !== "DO_NOT_PROMOTE").map(([src, tgt]) => (
                  <li key={src}>
                    <span className="font-bold">{src}</span> will be moved to <span className="font-bold text-indigo-600">{tgt === "GRADUATE" ? "Graduated Status" : tgt}</span>
                    {retained[src]?.length > 0 && <span className="text-red-600 ml-2">({retained[src].length} students retained)</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-between pt-4">
              <Btn variant="ghost" onClick={() => setStep(2)}>Back</Btn>
              <Btn variant="primary" onClick={handleExecute} disabled={loading}>
                {loading ? "Executing..." : "Confirm & Execute"}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});

const SettingsTab = memo(({ isAdmin, showToast, tenantId }: {
  isAdmin: boolean;
  showToast: (msg: string, type?: string) => void;
  tenantId?: string;
}) => {
  if (!isAdmin) return null; // Explicit internal boundary guard
  
  const { state, dispatch } = useApp();
  const { schoolSettings, staffList } = state;
  const [sec, setSec] = useState("logo");
  const [draft, setDraft] = useState({ ...schoolSettings });
  const [pinF, setPinF] = useState({ cur: "", nxt: "", cnf: "" });
  const [pinErr, setPinErr] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  
  const logoUrl = draft.logoUrl || schoolSettings?.logoUrl || null;
  const [pinSh, setPinSh] = useState({ cur: false, nxt: false, cnf: false });
  const [saved, setSaved] = useState(false);
    const [showPromo, setShowPromo] = useState(false);
  const [dbStats, setDbStats] = useState<{ size: string; keys: string[] }>({ size: "—", keys: [] });
  const [clearPin, setClearPin] = useState("");

  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [actionLogs, setActionLogs] = useState<any[]>([]);
  const [loadingActionLogs, setLoadingActionLogs] = useState(true);

  useEffect(() => {
    if (sec !== "staff_activity") return;

    let sessionToken = "";
    try {
      const raw = sessionStorage.getItem("schoolapp_tenant_session_v2");
      if (raw) sessionToken = JSON.parse(raw).sessionToken;
    } catch {}
    if (!sessionToken) { setLoadingLogs(false); return; }

    const fetchLogs = () => {
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { data, error } = await supabase.rpc("get_staff_session_logs", { _session_token: sessionToken });
        if (error) console.error("Failed to fetch staff session logs:", error);
        if (!error && data) setLogs(data);
        setLoadingLogs(false);
      }).catch(err => {
        console.error("Import failed:", err);
        setLoadingLogs(false);
      });
    };

    fetchLogs();
    const intervalId = setInterval(fetchLogs, 10000);

    return () => clearInterval(intervalId);
  }, [sec]);

  useEffect(() => {
    if (sec !== "tenant_activity") return;

    let sessionToken = "";
    try {
      const raw = sessionStorage.getItem("schoolapp_tenant_session_v2");
      if (raw) sessionToken = JSON.parse(raw).sessionToken;
    } catch {}
    if (!sessionToken) { setLoadingActionLogs(false); return; }

    const fetchLogs = () => {
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { data, error } = await supabase.rpc("get_activity_logs_v2", { _session_token: sessionToken });
        if (error) console.error("Failed to fetch staff action logs:", error);
        if (!error && data) setActionLogs(data);
        setLoadingActionLogs(false);
      }).catch(err => {
        console.error("Import failed:", err);
        setLoadingActionLogs(false);
      });
    };

    fetchLogs();
    const intervalId = setInterval(fetchLogs, 10000);

    return () => clearInterval(intervalId);
  }, [sec]);
  const [clearPinErr, setClearPinErr] = useState("");
    const [delReq, setDelReq] = useState<any>(null);
    const [delReqLoading, setDelReqLoading] = useState(false);
  
    useEffect(() => { setDraft({ ...schoolSettings }); }, [schoolSettings]);

    useEffect(() => {
      if (tenantId) {
        const session = loadTenantSession();
        if (session) {
          rpcFetchCloudDeletionStatus(session.sessionToken).then((data) => setDelReq(data));
        }
      }
    }, [tenantId]);

    const requestCloudDeletion = async () => {
      if (!tenantId) return;
      setDelReqLoading(true);
      const session = loadTenantSession();
      if (!session) return;
      
      try {
        const data = await rpcRequestCloudDeletion(session.sessionToken);
        setDelReq(data);
        showToast("Account deletion requested. Pending Super Admin approval.", "warning");
      } catch (error: any) {
        showToast("Failed to request deletion: " + error.message, "error");
      } finally {
        setDelReqLoading(false);
      }
    };

    const cancelCloudDeletion = async () => {
      if (!delReq) return;
      setDelReqLoading(true);
      const session = loadTenantSession();
      if (!session) return;
      
      try {
        await rpcCancelCloudDeletion(session.sessionToken);
        setDelReq(null);
        showToast("Deletion request cancelled.", "success");
      } catch (error: any) {
        showToast("Failed to cancel: " + error.message, "error");
      } finally {
        setDelReqLoading(false);
      }
    };

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
    const isNewTerm = (schoolSettings.term === "Third Term" && draft.term === "First Term") ||
                      (schoolSettings.session !== draft.session && draft.term === "First Term");
    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: draft });
    setSaved(true);
    showToast("Settings saved");
    setTimeout(() => setSaved(false), 2000);
    
    if (isNewTerm) {
      setShowPromo(true);
    }
  };

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return showToast("Invalid image", "error");
    if (f.size > 2097152) return showToast("Image must be under 2MB", "error");
    const r = new FileReader();
    r.onload = async ev => { 
      const base64 = ev.target?.result as string;
      dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { ...schoolSettings, logoUrl: base64 } });
      setDraft(prev => ({ ...prev, logoUrl: base64 }));
      if (tenantId) {
        try {
          const { updateSchoolProfile } = await import("@/supabase/schoolService");
          await updateSchoolProfile(tenantId, { logo: base64 });
        } catch (err) {
          console.error("Failed to sync logo to backend", err);
        }
      }
      showToast("Logo uploaded"); 
    };
    r.readAsDataURL(f);
  };

  const removeLogo = async () => {
    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { ...schoolSettings, logoUrl: null } });
    setDraft(prev => ({ ...prev, logoUrl: null }));
    if (logoRef.current) logoRef.current.value = "";
    if (tenantId) {
      try {
        const { updateSchoolProfile } = await import("@/supabase/schoolService");
        await updateSchoolProfile(tenantId, { logo: null });
      } catch (err) {
        console.error("Failed to remove logo from backend", err);
      }
    }
    showToast("Logo removed");
  };

  const changePin = async () => {
    setPinErr("");
    const session = loadTenantSession();
    if (!session) return setPinErr("Session error.");
    
    const curOk = await verifyAdminPin(session, pinF.cur);
    if (!curOk) return setPinErr("Current PIN is incorrect.");
    if (pinF.nxt.length < 4) return setPinErr("New PIN must be ≥ 4 digits.");
    if (pinF.nxt !== pinF.cnf) return setPinErr("New PINs do not match.");
    
    const ok = await setAdminPin(session, pinF.nxt);
    if (!ok) return setPinErr("Failed to update PIN.");
    
    setPinF({ cur: "", nxt: "", cnf: "" });
    showToast("Admin PIN updated");
  };

  const handleClearDB = async () => {
    setClearPinErr("");
    const session = loadTenantSession();
    if (!session) return setClearPinErr("Session error.");
    
    const ok = await verifyAdminPin(session, clearPin);
    if (!ok) return setClearPinErr("Incorrect PIN.");
    try { localStorage.removeItem(DB_KEY); } catch {}
    showToast("Database cleared — reloading…", "warning");
    setClearPin("");
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 id="tour-settings-header" className="text-2xl font-black text-slate-900 uppercase">Settings</h1>
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
                      <Btn variant="ghost" size="sm" onClick={removeLogo}>
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
              <Inp label="Principal's Full Name" value={draft.principalName || ""} onChange={(e: any) => setDraft(d => ({ ...d, principalName: e.target.value }))} placeholder="e.g. Mr. John Doe" />
              <Inp label="School Motto" value={draft.motto} onChange={(e: any) => setDraft(d => ({ ...d, motto: e.target.value }))} />
              <Inp label="Admin Username" value={draft.adminUsername || ""} onChange={(e: any) => setDraft(d => ({ ...d, adminUsername: e.target.value }))} placeholder="e.g. admin" />
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
          {sec === "payroll" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Payroll Settings</p>
                <p className="text-xs text-slate-400 mt-0.5">Configure when salaries are paid and background reminders.</p>
              </div>
              
              <Inp 
                label="Salary Pay Day (1-31)" 
                value={draft.salaryDay?.toString() || ""} 
                onChange={(e: any) => setDraft(d => ({ ...d, salaryDay: parseInt(e.target.value) || undefined }))} 
                placeholder="e.g. 25" 
              />
              
              <div className="flex items-center justify-between py-2.5 cursor-pointer group" onClick={(e) => { e.preventDefault(); setDraft(d => ({ ...d, salaryReminderEnabled: !d.salaryReminderEnabled })); }}>
                <div>
                  <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 block">Enable Reminders</span>
                  <span className="text-xs text-slate-400">Receive an inbox notification 24 hours before pay day</span>
                </div>
                <div className={`relative w-10 h-5 rounded-full transition-colors ${draft.salaryReminderEnabled ? "bg-blue-600" : "bg-slate-200"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${draft.salaryReminderEnabled ? "translate-x-5" : ""}`} />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>
                  {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Payroll Settings</>}
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
                "image/png",
                "image/jpeg",
                "image/jpg"
              ];
              if (!validTypes.includes(f.type)) return showToast("Please upload a PNG or JPG image", "error");
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
                    <p className="text-xs text-slate-400 mt-0.5">Upload a high-resolution PNG or JPG image to use as the background letterhead for generated reports.</p>
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
                      <p className="text-xs font-black uppercase text-slate-400 group-hover:text-blue-500">Click to upload PNG or JPG image</p>
                      <p className="text-xs text-slate-300">Max 5MB, A4 Ratio Recommended</p>
                      <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={handleTemplateUpload} />
                    </label>
                  )}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700 font-bold leading-relaxed">
                      💡 Uploaded images act as a background letterhead overlay. Report tables will be printed securely over the image.
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
                    <Toggle label="Show Behavioural Assessments" checked={tpl.showBehavioural ?? true} onChange={v => updateTpl({ showBehavioural: v })} />
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

                {/* Submit / Sync Template */}
                <Card className="p-5 space-y-3">
                  <div>
                    <p className="text-sm font-black uppercase text-slate-700">Sync Template</p>
                    <p className="text-xs text-slate-400 mt-0.5">Apply your saved template across all generated reports{FIREBASE_ENABLED ? " and push it to the cloud so every device uses it." : "."}</p>
                  </div>
                  <Btn variant="primary" size="lg" className="w-full" onClick={async () => {
                    // Re-commit current template (forces save) and push to cloud if enabled
                    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { reportTemplate: { ...tpl, syncedAt: new Date().toISOString() } as any } });
                    if (FIREBASE_ENABLED) {
                      try { await pushToFirebase(state as any); showToast("Template synced to cloud ✓"); }
                      catch { showToast("Saved locally — cloud push failed", "warning"); }
                    } else {
                      showToast(tpl.uploadedFile ? `Template "${tpl.uploadedFileName || "Custom"}" applied to all reports` : "Template applied to all reports");
                    }
                  }}>
                    <Check size={15} />Submit & Sync Template
                  </Btn>
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
          {sec === "staff_activity" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Staff Activity Logs</p>
                <p className="text-xs text-slate-400 mt-0.5">Recent staff logins and logouts for this school.</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto">
                {(() => {
                  if (loadingLogs) return <div className="p-8 text-center text-xs font-bold text-slate-400 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={14} /> Loading logs...</div>;
                  if (logs.length === 0) return <div className="p-8 text-center text-xs font-bold text-slate-400">No recent staff activity found.</div>;
                  return (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-100/50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Staff</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Role</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Action</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.map(log => (
                          <tr key={log.id} className="hover:bg-white transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700">{log.staff_name}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{log.role}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${log.action === "login" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </Card>
          )}
          {sec === "tenant_activity" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Staff Actions</p>
                <p className="text-xs text-slate-400 mt-0.5">Granular activity and actions performed by staff.</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto">
                {(() => {
                  if (loadingActionLogs) return <div className="p-8 text-center text-xs font-bold text-slate-400 flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={14} /> Loading actions...</div>;
                  if (actionLogs.length === 0) return <div className="p-8 text-center text-xs font-bold text-slate-400">No recent staff actions found.</div>;
                  return (
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-100/50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Staff ID</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Action</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Details</th>
                          <th className="px-4 py-3 font-black text-xs uppercase tracking-wide text-slate-500">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {actionLogs.map(log => (
                          <tr key={log.id} className="hover:bg-white transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700">{log.staff_id}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{log.details || "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </Card>
          )}
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
                {delReq && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-red-700">Account Deletion Requested</p>
                      <p className="text-xs text-red-600">Pending Super Admin confirmation.</p>
                    </div>
                    <Btn variant="outline" size="sm" onClick={cancelCloudDeletion} disabled={delReqLoading}>
                      Cancel Request
                    </Btn>
                  </div>
                )}
                <Card className="p-5 border-2 border-red-100 space-y-3">
                  {!delReq && (
                    <div className="border-b border-red-100 pb-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-red-500" />
                        <p className="text-xs font-black uppercase text-red-600">Danger Zone - Delete Cloud Account</p>
                      </div>
                      <p className="text-xs text-red-500 font-medium mb-3">Permanently deletes your school account and all data from the cloud.</p>
                      <Btn variant="danger" size="sm" onClick={requestCloudDeletion} disabled={delReqLoading}>
                        Request Account Deletion
                      </Btn>
                    </div>
                  )}
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500" />
                  <p className="text-xs font-black uppercase text-red-600">Danger Zone — Clear All Data</p>
                </div>
                <p className="text-xs text-red-500 font-medium">Permanently deletes all records, staff, attendance and settings. Enter Admin PIN to confirm.</p>
                <Field error={clearPinErr}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      style={{ WebkitTextSecurity: "disc" }}
                      value={clearPin}
                      maxLength={32}
                      placeholder="Admin PIN"
                      onChange={e => { setClearPin(e.target.value); setClearPinErr(""); }}
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
          {sec === "signatures" && (
            <DefaultSignaturesPanel
              initialTeacher={(schoolSettings as any).defaultTeacherSignature || ""}
              initialPrincipal={(schoolSettings as any).defaultPrincipalSignature || ""}
              onSave={async (t, p) => {
                dispatch({ type: "SET_SCHOOL_SETTINGS", payload: { defaultTeacherSignature: t, defaultPrincipalSignature: p } as any });
                if (tenantId) {
                  try {
                    const { db: schoolDb } = await import("@/supabase/schoolService");
                    const { data: school } = await schoolDb().from("schools").select("id").eq("tenant_id", tenantId).single();
                    if (school) {
                      await (schoolDb().from("schools") as any).update({ default_teacher_signature: t, default_principal_signature: p }).eq("id", school.id);
                    }
                  } catch (e) {
                    console.error("Failed to save signatures to Supabase", e);
                  }
                }
                showToast("Default signatures saved", "success");
              }}
            />
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
                <p className="text-xs text-amber-700 font-medium">Keep this PIN private. Never share it with anyone — it grants full administrative access.</p>
              </div>
              {(["cur", "nxt", "cnf"] as const).map((fk, i) => {
                const labels = { cur: "Current PIN", nxt: "New PIN (min 4 characters)", cnf: "Confirm New PIN" };
                return (
                  <Field key={fk} label={labels[fk]}>
                    <div className="relative">
                      <input
                        type={pinSh[fk] ? "text" : "password"}
                        value={pinF[fk]}
                        maxLength={32}
                        placeholder="••••••"
                        onChange={e => setPinF(p => ({ ...p, [fk]: e.target.value }))}
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
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <Btn variant="primary" size="lg" className="w-full" onClick={changePin}>
                  <Shield size={15} />Update Admin PIN
                </Btn>
                {(!schoolSettings.staffCodeMigrationDone || staffList.some(s => s.staffCode && /^[^A-Za-z0-9]/.test(s.staffCode))) && (
                  <Btn variant="outline" size="lg" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => {
                    const updatedStaff = [...staffList];
                    // Don't include buggy codes in existingCodes so we can reuse their intended slots if needed
                    const existingCodes = updatedStaff.map(s => s.staffCode).filter(c => c && !/^[^A-Za-z0-9]/.test(c)) as string[];
                    let changed = false;
                    const changedNames: string[] = [];
                    for (let i = 0; i < updatedStaff.length; i++) {
                      const currentCode = updatedStaff[i].staffCode;
                      const isBuggy = currentCode && /^[^A-Za-z0-9]/.test(currentCode);
                      if (!currentCode || isBuggy) {
                        const newCode = generateStaffCode(updatedStaff[i].name, existingCodes);
                        if (isBuggy) {
                          console.log(`Fixing buggy code for ${updatedStaff[i].name}: ${currentCode} -> ${newCode}`);
                          changedNames.push(`${updatedStaff[i].name} (${currentCode} -> ${newCode})`);
                        }
                        updatedStaff[i] = { ...updatedStaff[i], staffCode: newCode };
                        existingCodes.push(newCode);
                        changed = true;
                      }
                    }
                    if (changedNames.length > 0) {
                      console.log("Total staff fixed:", changedNames.length, changedNames);
                    }
                    dispatch({ type: "REPLACE_ALL", payload: { 
                      ...state, 
                      staffList: updatedStaff,
                      schoolSettings: { ...schoolSettings, staffCodeMigrationDone: true }
                    }});
                    showToast("Staff ID migration/cleanup complete!", "success");
                  }}>
                    <Users size={15} />Migrate/Cleanup Staff IDs
                  </Btn>
                )}
                
                <Btn variant="outline" size="lg" className="w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 mt-2" onClick={async () => {
                  let st = "";
                  try { const r = sessionStorage.getItem("schoolapp_tenant_session_v2"); if (r) st = JSON.parse(r).sessionToken; } catch {}
                  if (!st) return showToast("Session error. Please re-login.", "error");
                  
                  try {
                    const localStructs = JSON.parse(localStorage.getItem("sf_fee_structure_v2") || "{}");
                    const localPayments = JSON.parse(localStorage.getItem("sf_fees_v2") || "{}");
                    const { db: schoolDb } = await import("@/supabase/schoolService");
                    const { supabase } = await import("@/integrations/supabase/client");
                    
                    let migratedStructs = 0;
                    let migratedPayments = 0;
                    
                    // Migrate structures
                    for (const cls of Object.keys(localStructs)) {
                      for (const pKey of Object.keys(localStructs[cls])) {
                        const s = localStructs[cls][pKey];
                        const [year, trm] = pKey.split("__");
                        const amt = s.tuition + (s.items?.reduce((a: number, i: any) => a + (i.amount || 0), 0) || 0);
                        const { error } = await supabase.rpc("save_fee_structure", {
                          _session_token: st, _class_name: cls, _term: trm, _academic_year: year,
                          _amount: amt, _details: JSON.stringify({ tuition: s.tuition, items: s.items || [] })
                        });
                        if (!error) migratedStructs++;
                      }
                    }
                    
                    // Migrate payments
                    for (const k of Object.keys(localPayments)) {
                      const [cls, studentName, pKey] = k.split("|");
                      if (!cls || !studentName || !pKey) continue;
                      const [year, trm] = pKey.split("__");
                      const hist = localPayments[k].history || [];
                      
                      const rollStudent = state.classRolls[cls]?.find(s => s.name === studentName);
                      const admNo = getOrAssignAdmNo(rollStudent, cls, studentName, state.classRolls, dispatch);
                      
                      for (const p of hist) {
                        const { error } = await supabase.rpc("record_payment", {
                          _session_token: st, _admission_no: admNo, _student_name: studentName, _class_name: cls,
                          _term: trm, _academic_year: year, _amount: p.amount, _note: p.note || "Legacy Migration"
                        });
                        if (!error) migratedPayments++;
                      }
                    }
                    
                    showToast(`Migrated ${migratedStructs} fee structures & ${migratedPayments} payments!`, "success");
                  } catch (err: any) {
                    showToast(err.message || "Migration failed", "error");
                  }
                }}>
                  <Database size={15} />Migrate Local Fee Data
                </Btn>
              </div>
            </Card>
          )}

          {sec === "result_checker" && (
            <ResultCheckerPanel tenantId={tenantId} schoolSettings={schoolSettings} dispatch={dispatch} appState={state} showToast={showToast} />
          )}
        </div>
      </div>
    </div>
  );
});

// ─── AutoStamp Component ───────────────────────────────────────────────────────
function AutoStamp({ schoolName, date, color = "#1e40af" }: { schoolName: string; date: string; color?: string }) {
  const sn = (schoolName || "SCHOOL NAME").toUpperCase();
  const fs = sn.length > 45 ? 3.5 : sn.length > 35 ? 4.2 : sn.length > 28 ? 5.2 : sn.length > 20 ? 6.5 : 7.8;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-6deg)', opacity: 0.85, mixBlendMode: 'multiply' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <path id="top-arc-rc-sm" d="M 11,50 A 39,39 0 1,1 89,50" fill="transparent" />
          <path id="bottom-arc-rc-sm" d="M 11,50 A 39,39 0 0,0 89,50" fill="transparent" />
        </defs>
        <circle cx="50" cy="50" r="48.5" stroke={color} strokeWidth="1.6" fill="none" />
        <circle cx="50" cy="50" r="46" stroke={color} strokeWidth="0.6" fill="none" />
        <circle cx="50" cy="50" r="30" stroke={color} strokeWidth="1" fill="none" />
        <text fill={color} fontSize={fs} fontWeight="bold" letterSpacing={sn.length > 35 ? "0.5" : "1"} textAnchor="middle">
          <textPath href="#top-arc-rc-sm" startOffset="50%">&#9733; {sn} &#9733;</textPath>
        </text>
        <text fill={color} fontSize="6" fontWeight="bold" letterSpacing="1.2" textAnchor="middle">
          <textPath href="#bottom-arc-rc-sm" startOffset="50%">OFFICIAL ACADEMIC REPORT</textPath>
        </text>
        <text x="50" y="44" fill={color} fontSize="4.5" fontWeight="bold" letterSpacing="1.5" textAnchor="middle" opacity="0.8">
          APPROVED &amp; ISSUED
        </text>
        <line x1="34" y1="47.5" x2="66" y2="47.5" stroke={color} strokeWidth="0.5" opacity="0.6" />
        <text x="50" y="56" fill={color} fontSize={fs === 7.8 ? 8.5 : fs === 6.5 ? 7 : 6} fontWeight="900" letterSpacing="0.8" textAnchor="middle">
          {date}
        </text>
      </svg>
    </div>
  );
};

// ─── Report Sheet ─────────────────────────────────────────────────────────────
const ReportSheet = memo(({ report, curC, attRate, schoolLogo, schoolSettings, classTeacher, linkedSignatures }: any) => {
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
    ...(tpl.showTeacherRemark ? [["teacher", "Class Teacher's Remark", "teacherSig", "teacher"] as const] : []),
    ...(tpl.showPrincipalRemark ? [["principal", "Principal's Remark", "principalSig", "principal"] as const] : []),
  ];
  return (
    <div id="report-print-area" className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg relative" style={{ fontFamily: tpl.fontFamily === 'Helvetica' ? 'Helvetica, Arial, sans-serif' : tpl.fontFamily === 'Times' ? '"Times New Roman", Times, serif' : tpl.fontFamily === 'Courier' ? 'Courier, monospace' : 'Georgia, serif' }}>
      {tpl.uploadedFile && (
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-none" style={{
          backgroundImage: `url(${tpl.uploadedFile})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }} />
      )}
      <div className="relative z-10 h-full flex flex-col">
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
      <div className="px-8 py-3.5 border-b border-slate-100" style={{ display: "grid", gridTemplateColumns: `repeat(${studentFields.length}, 1fr)`, gap: "0.75rem", backgroundColor: "rgba(248, 250, 252, 0.75)" }}>
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
                <th key={i} style={{ padding: report.records.length > 12 ? "6px 8px" : "9px 10px", textAlign: i === 0 ? "left" : "center", fontWeight:800, fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", borderRight: i < headers.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.records.map((r: any, i: number) => {
              const g = getGrade(r.total);
              const bg = tpl.tableStyle === "striped" ? (i % 2 === 0 ? "transparent" : "rgba(248,250,252,0.65)") : "transparent";
              const border = tpl.tableStyle === "minimal" ? "none" : "1px solid #e2e8f0";
              const pad = report.records.length > 12 ? "4px 8px" : "8px 10px";
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ padding: pad, borderRight: border, borderBottom: border, fontWeight:700, textTransform:"uppercase", fontSize:"10px" }}>{r.subject}</td>
                  <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.caScore}</td>
                  <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.examScore}</td>
                  <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, fontSize:"12px" }}>{r.total}</td>
                  {tpl.showGrade && <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, color:g.color }}>{g.grade}</td>}
                  {tpl.showGrade && <td style={{ padding: pad, borderBottom: border, fontStyle:"italic", color:"#64748b", fontSize:"10px" }}>{g.remark}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: tpl.headerColor }}>
              <td colSpan={tpl.showGrade ? 3 : 3} style={{ padding: report.records.length > 12 ? "6px 8px" : "9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Cumulative Total</td>
              <td style={{ padding: report.records.length > 12 ? "6px 8px" : "9px 10px", textAlign:"center", color:"#fff", fontWeight:900, fontSize:"14px" }}>{report.summary.total}<span style={{ fontSize:"9px", opacity:0.5 }}>/{report.summary.obtainable}</span></td>
              {tpl.showGrade && <td style={{ padding: report.records.length > 12 ? "6px 8px" : "9px 10px", textAlign:"center", color:"#34d399", fontWeight:900, fontSize:"12px" }}>{report.summary.avg}%</td>}
              {tpl.showGrade && <td style={{ padding: report.records.length > 12 ? "6px 8px" : "9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase" }}>Avg.</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {tpl.showAttendance && (
        <div className="px-8 pt-4 pb-3">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-1.5">Attendance</p>
          <div className="grid grid-cols-4 gap-2">
            {([
              ["Days Opened",  curC.daysOpen    || "—", "bg-slate-100 text-slate-800"],
              ["Days Present", curC.daysPresent || "—", "bg-emerald-50 text-emerald-800"],
              ["Days Absent",  curC.daysAbsent  || "—", "bg-red-50 text-red-700"],
              ["Rate", attRate !== null ? `${attRate}%` : "—", attRate === null ? "bg-slate-100 text-slate-800" : attRate >= 75 ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"],
            ] as const).map(([l, v, c]) => (
              <div key={l} className={`${c} rounded-xl p-3 text-center`}>
                <p className="text-[10px] font-black uppercase opacity-60 mb-0.5">{l}</p>
                <p className="text-xl font-black">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {tpl.showBehavioural && (
        <div className="px-8 pt-4 pb-3">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">Affective & Psychomotor Domains</p>
          <div className="grid grid-cols-4 gap-2">
            {[...AFFECTIVE_TRAITS, ...PSYCHOMOTOR_SKILLS].map(t => (
              <div key={t.key} className="flex items-center justify-between text-[10px] border border-slate-300 rounded px-2 py-1" style={{ fontFamily:tpl.fontFamily }}>
                <span className="text-slate-700 truncate mr-2">{t.label}</span>
                <span className="font-bold flex-shrink-0" style={{ color: tpl.accentColor }}>{curC[t.key] || "—"}</span>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-slate-400 mt-2 font-bold uppercase tracking-wide">Key: A = Excellent, B = Good, C = Fair, D = Poor, E = Unacceptable</p>
        </div>
      )}
      {remarkSections.length > 0 && (
        <div className={`px-8 pt-4 pb-5 grid gap-4 ${remarkSections.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {remarkSections.map(([f, l, sf, role]) => {
            const linkedTeacherSig = (sf === "teacherSig" && classTeacher && linkedSignatures) ? linkedSignatures[classTeacher.id] : null;
            const staffJsonSig = (sf === "teacherSig" && classTeacher) ? classTeacher.signature : null;
            const sigValue = curC[sf] || staffJsonSig || linkedTeacherSig || (sf === "teacherSig" ? schoolSettings.defaultTeacherSignature : schoolSettings.defaultPrincipalSignature);
            const isAutoLinked = !curC[sf] && (!!staffJsonSig || !!linkedTeacherSig);

            return (
            <div key={f} className="border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">{l}</p>
              <div className="min-h-10 text-sm text-slate-700 italic border-b border-dashed border-slate-200 pb-2 mb-3">
                {curC[f] || <span className="text-slate-300 not-italic text-[10px]">No remark entered</span>}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">
                    {role === "teacher" ? "Class Teacher" : "Principal"} {(isAutoLinked && role !== "teacher") && <span className="text-[9px] text-slate-400 italic normal-case tracking-normal ml-1">(auto-applied)</span>}
                  </p>
                  {sigValue && typeof sigValue === "string" && sigValue.startsWith("data:image") ? (
                    <img src={sigValue} alt="signature" style={{ maxHeight: "48px", maxWidth: "100%", objectFit: "contain" }} />
                  ) : sigValue ? (
                    <p className="italic text-base" style={{ fontFamily:`${tpl.fontFamily},serif`, color: tpl.accentColor }}>{sigValue}</p>
                  ) : (
                    <p className="italic text-[10px] text-slate-300">_____________________</p>
                  )}
                  {((role === "teacher" && classTeacher) || (role === "principal" && schoolSettings.principalName)) && (
                    <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wide mt-1.5">
                      {role === "teacher" ? classTeacher?.name : schoolSettings.principalName}
                    </p>
                  )}
                </div>
                {role === "principal" && tpl.showStamp && (
                  <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                    <AutoStamp schoolName={schoolSettings.name || "School"} date={new Date().toLocaleDateString('en-GB')} color={tpl.accentColor || "#1e40af"} />
                  </div>
                )}
              </div>
            </div>
            );
          })}
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
    </div>
  );
});
// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────────────────────
const AttendanceTab = memo(() => {
  const { state, dispatch, showToast, currentActor, tenantId } = useApp();
  const { attendance, classRolls, entries } = state;
  const [attTab, setAttTab] = useState<"roll" | "mark" | "history">("roll");

  // ── Class Roll ────────────────────────────────────────────────────────────
  const [rollClass, setRollClass] = useState("");
  const [rollSearch, setRollSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdmNo, setNewAdmNo] = useState("");
  const [newGender, setNewGender] = useState<"male"|"female"|"">("");
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
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: [...existing, ...newStudents], actor: currentActor });
    
    // Phase 4 Roster Cutover Dual-Write
    if (tenantId) {
      import("@/supabase/schoolService").then(({ bulkCreateStudents }) => {
        bulkCreateStudents(tenantId, newStudents.map(s => ({
          first_name: s.name.split(" ")[0] || "",
          last_name: s.name.split(" ").slice(1).join(" ") || "",
          admission_no: s.admNo,
          class_name: rollClass,
        }))).catch(console.error);
      });
    }

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
    const localId = uid();
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: localId, name: newName.trim(), admNo: newAdmNo.trim(), gender: newGender || undefined }],
      actor: currentActor,
    });

    // Phase 4 Roster Cutover Dual-Write — also patch local roll with real DB UUID
    if (tenantId) {
      import("@/supabase/schoolService").then(({ bulkCreateStudents }) => {
        bulkCreateStudents(tenantId, [{
          first_name: newName.trim().split(" ")[0] || "",
          last_name: newName.trim().split(" ").slice(1).join(" ") || "",
          admission_no: newAdmNo.trim(),
          class_name: rollClass,
          gender: newGender || undefined,
        }]).then((result) => {
          if (result?.ids?.[0]) {
            // Patch the local roll entry with the real DB UUID so token gen works
            dispatch((state: any) => {
              const roll = (state.classRolls[rollClass] || []).map((s: any) =>
                s.id === localId ? { ...s, id: result.ids[0] } : s
              );
              return { type: "SAVE_CLASS_ROLL", className: rollClass, students: roll, actor: "System" };
            });
          }
        }).catch(console.error);
      });
    }

    setNewName(""); setNewAdmNo(""); setNewGender("");
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
    const localIds = newStudents.map(s => s.id);
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: [...existing, ...newStudents], actor: currentActor });

    // Phase 4 Roster Cutover Dual-Write — patch local IDs with real DB UUIDs
    if (tenantId) {
      import("@/supabase/schoolService").then(({ bulkCreateStudents }) => {
        bulkCreateStudents(tenantId, newStudents.map(s => ({
          first_name: s.name.split(" ")[0] || "",
          last_name: s.name.split(" ").slice(1).join(" ") || "",
          admission_no: "",
          class_name: rollClass,
        }))).then((result) => {
          if (result?.ids?.length) {
            dispatch((state: any) => {
              const roll = (state.classRolls[rollClass] || []).map((s: any) => {
                const idx = localIds.indexOf(s.id);
                return idx !== -1 && result.ids[idx] ? { ...s, id: result.ids[idx] } : s;
              });
              return { type: "SAVE_CLASS_ROLL", className: rollClass, students: roll, actor: "System" };
            });
          }
        }).catch(console.error);
      });
    }

    setBulkText(""); setShowBulk(false);
    showToast(`${newStudents.length} student${newStudents.length !== 1 ? "s" : ""} added`);
  };

  const confirmStudent = (student: RollStudent) => {
    const existing = (classRolls[rollClass] || []);
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: uid(), name: student.name, admNo: student.admNo || "" }],
      actor: currentActor,
    });
    showToast(`${student.name} added to roll`);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    const roll = (classRolls[rollClass] || []).map(s =>
      s.id === id ? { ...s, name: editName.trim(), admNo: editAdmNo.trim() } : s
    );
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: roll, actor: currentActor });
    setEditingId(null);
    showToast("Student updated");
  };

  const removeStudent = (studentId: string) => {
    dispatch({ type: "DELETE_ROLL_STUDENT", className: rollClass, studentId, actor: currentActor });
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
    dispatch({ type: "BULK_SAVE_ATTENDANCE", payload: toSave, actor: currentActor });
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
          <h1 id="tour-attendance-header" className="text-2xl font-black text-slate-900 uppercase">Attendance</h1>
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
          <Card id="tour-roll-card" className="p-5 space-y-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <Inp value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Student full name"
                      onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                  </div>
                  <div className="sm:col-span-1">
                    <select value={newGender} onChange={e => setNewGender(e.target.value as any)} className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 outline-none">
                      <option value="">Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <Inp value={newAdmNo} onChange={(e: any) => setNewAdmNo(e.target.value)} placeholder="Adm No."
                      onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                  </div>
                </div>
                <Btn id="tour-add-btn" variant="primary" onClick={addStudent} disabled={!newName.trim()}>
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
                <button onClick={() => { setHSearch(""); setHClass(""); setHDate(""); setHStatus("All"); }}
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
                            <button onClick={() => dispatch({ type: "DELETE_ATTENDANCE", id: a.id, actor: currentActor })}
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
// Notification helpers
// ─────────────────────────────────────────────────────────────────────────────
function notificationVisible(n: AppNotification, isAdmin: boolean, actor: string): boolean {
  if (n.toScope === "admin") return isAdmin;
  if (n.toScope === "all-staff") return !isAdmin || isAdmin; // visible to everyone
  if (n.toScope.startsWith("staff:")) {
    const target = n.toScope.slice(6);
    return target === actor;
  }
  return false;
}

function makeNotification(args: {
  fromActor: string;
  fromRole: AppNotification["fromRole"];
  toScope: AppNotification["toScope"];
  title: string;
  body: string;
  priority?: AppNotification["priority"];
}): AppNotification {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    fromActor: args.fromActor,
    fromRole: args.fromRole,
    toScope: args.toScope,
    title: args.title,
    body: args.body,
    priority: args.priority ?? "normal",
    readBy: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timetable view
// ─────────────────────────────────────────────────────────────────────────────
// period_number (admin dashboard) → TenantApp period id
const PERIOD_NUM_TO_ID: Record<number, string> = {
  0: "asm",
  1: "p1", 2: "p2", 3: "p3", 4: "p4",
  5: "sbr",
  6: "p5", 7: "p6",
  8: "lbr",
  9: "p7", 10: "p8", 11: "p9",
  12: "cls",
};
// Supabase full day name → TenantApp short day
const SUPABASE_DAY_TO_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri",
};
// schoolSettings.term string → Supabase term enum
const TERM_LABEL_TO_SUPABASE: Record<string, string> = {
  "First Term": "first", "Second Term": "second", "Third Term": "third",
};

function TimetableView({
  isAdmin, currentActor, staffList, classRolls, timetable, dispatch, showToast,
  tenantId, schoolSettings,
}: {
  isAdmin: boolean;
  currentActor: string;
  staffList: StaffMember[];
  classRolls: Record<string, RollStudent[]>;
  timetable: TimetableState;
  dispatch: React.Dispatch<any>;
  showToast: (msg: string, type?: string) => void;
  tenantId?: string;
  schoolSettings: SchoolSettings;
}) {
  // Helper: Get subjects for a class from curriculum
  const getSubjectsForClass = (cls: string): string[] => {
    for (const cat of Object.values(CURRICULUM)) {
      if ((cat as any).classes.includes(cls)) return (cat as any).subjects;
    }
    return [];
  };



  // Get all classes - same as score entry form
  const allClasses = useMemo(() => {
    const fromRolls = Object.keys(classRolls);
    const fromCells = Object.keys(timetable.cells).map(k => {
      const parts = k.split("|");
      return parts.length > 3 ? parts[1] : parts[0];
    });
    const extra = [...new Set([...fromRolls, ...fromCells].filter(Boolean).filter(c => !ALL_CLASSES.includes(c) && !["class", "ca", "exam"].includes(c)))];
    return [...ALL_CLASSES, ...extra];
  }, [classRolls, timetable.cells]);

  const [activeClass, setActiveClass] = useState<string>(allClasses[0] || "");
  const [ttType, setTtType] = useState<"class"|"ca"|"exam">("class");
  const [editing, setEditing] = useState<{ key: string; subject: string; teacherName: string } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Helper: Generate auto-fill for a class using curriculum subjects
  const generateAutoFill = (cls: string) => {
    const subjects = getSubjectsForClass(cls);
    const periods = timetable.periods.filter(p => !["sbr","lbr","br","asm","cls"].includes(p.id) && !/break|lunch|assembly|closing/i.test(p.label));
    const days = timetable.days;
    
    const newCells = { ...timetable.cells };
    let subjectIndex = 0;
    
    periods.forEach((period) => {
      days.forEach((day) => {
        if (subjectIndex < subjects.length) {
          const key = ttType === "class" ? `class|${cls}|${day}|${period.id}` : `${ttType}|${cls}|${day}|${period.id}`;
          
          let isEmpty = false;
          if (ttType === "class") {
            const legacyKey = `${cls}|${day}|${period.id}`;
            isEmpty = !newCells[key] && !newCells[legacyKey];
          } else {
            isEmpty = !newCells[key];
          }

          if (isEmpty) { // Only fill empty slots
            newCells[key] = { subject: subjects[subjectIndex], teacherName: "" };
            if (ttType === "class") {
              subjectIndex = (subjectIndex + 1) % subjects.length;
            } else {
              subjectIndex++;
            }
          }
        }
      });
    });
    
    return newCells;
  };

  // ── Sync from Supabase on mount (admin dashboard is source of truth) ──
  useEffect(() => {
    if (!tenantId) return;
    const supabaseTerm = TERM_LABEL_TO_SUPABASE[schoolSettings.term] ?? "first";
    const academicYear = schoolSettings.session ?? "";
    if (!academicYear) return;
    setSyncLoading(true);
    import("@/supabase/schoolService")
      .then(({ getAllTimetableSlots }) =>
        getAllTimetableSlots(tenantId, supabaseTerm, academicYear)
      )
      .then((slots) => {
        if (!slots.length) return;
        const mapped: Record<string, { subject: string; teacherName: string }> = {};
        slots.forEach((s: any) => {
          if (!s.subject_name && !s.teacher_name) return;
          const periodId = PERIOD_NUM_TO_ID[s.period_number as number];
          const day = SUPABASE_DAY_TO_SHORT[s.day];
          if (!periodId || !day) return;
          const key = s.class_name ? `class|${s.class_name}|${day}|${periodId}` : `${day}|${periodId}`;
          mapped[key] = {
            subject: s.subject_name ?? "",
            teacherName: s.teacher_name ?? "",
          };
        });
        dispatch({ type: "SET_TIMETABLE_CELLS", cells: mapped });
      })
      .catch(() => { /* fail silently — app still works offline */ })
      .finally(() => setSyncLoading(false));
  }, [tenantId, schoolSettings.term, schoolSettings.session]); // eslint-disable-line
  const [myOnly, setMyOnly] = useState(false);
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [showAutoSet, setShowAutoSet] = useState(false);

  useEffect(() => {
    if (!activeClass && allClasses.length) setActiveClass(allClasses[0]);
  }, [allClasses, activeClass]);

  const cellOf = (day: string, periodId: string) => {
    if (ttType === "class") {
      return timetable.cells[`class|${activeClass}|${day}|${periodId}`] || timetable.cells[`${activeClass}|${day}|${periodId}`];
    }
    return timetable.cells[`${ttType}|${activeClass}|${day}|${periodId}`];
  };

  const handleExport = () => {
    const matrix: any[][] = [["Period", ...timetable.days]];
    timetable.periods.forEach(p => {
      const isBreak = ["sbr","lbr","br","asm","cls"].includes(p.id) || /break|lunch|assembly|closing/i.test(p.label);
      if (isBreak) {
        matrix.push([`${p.label} (${p.start}-${p.end})`, ...timetable.days.map(() => "---")]);
      } else {
        const row = [`${p.label} (${p.start}-${p.end})`];
        timetable.days.forEach(d => {
          const cell = cellOf(d, p.id);
          row.push(cell ? `${cell.subject}${cell.teacherName ? ` (${cell.teacherName})` : ""}` : "");
        });
        matrix.push(row);
      }
    });
    const { exportToCSV } = require("@/lib/exportUtils");
    exportToCSV(matrix, `${activeClass}_${ttType}_Timetable.csv`);
  };

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 id="tour-timetable-header" className="text-2xl font-black text-slate-900 uppercase">Timetable</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Weekly schedule {isAdmin ? "— tap a cell to edit" : "— read-only"}
            {syncLoading && <span className="ml-2 inline-flex items-center gap-1 text-blue-500 text-[10px] font-bold animate-pulse">↻ syncing…</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className="text-xs font-bold text-slate-600 p-1.5 rounded-lg border-2 border-slate-200 outline-none">
              <option value="">All Staff</option>
              {staffList.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}
          {!isAdmin && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)} />
              My periods
            </label>
          )}
          <button onClick={() => window.print()} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors" title="Print Timetable">
            <Printer size={16} />
          </button>
          <button onClick={handleExport} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors" title="Export CSV">
            <Download size={16} />
          </button>
        </div>
      </div>

      <Card className="p-3 sm:p-4 space-y-3 print:shadow-none print:border-none print:p-0">
        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
          {/* Class Selection */}
          <div className="flex-1 space-y-2">
            <label className="text-xs font-black uppercase text-slate-500">Select Class:</label>
            <select 
              value={activeClass} 
              onChange={e => setActiveClass(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-bold focus:border-blue-500 outline-none"
            >
              {allClasses.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
          
          {/* Timetable Type Switcher */}
          <div className="flex-1 space-y-2">
            <label className="text-xs font-black uppercase text-slate-500">Schedule Type:</label>
            <div className="flex w-full bg-slate-100 p-1 rounded-lg">
              {(["class", "ca", "exam"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTtType(t)}
                  className={`flex-1 py-1.5 text-xs font-black uppercase rounded transition-all ${ttType === t ? "bg-white shadow text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {t === "class" ? "Regular" : t === "ca" ? "CA" : "Exam"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 print:hidden">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(CURRICULUM).map(([section, data]) => (
              <div key={section} className="space-y-2">
                <p className="text-xs font-black uppercase text-slate-500 tracking-wide">{section}</p>
                <div className="flex flex-wrap gap-2">
                  {data.classes.map((cls: string) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setActiveClass(cls)}
                      className={`px-3 py-2 rounded-full text-[11px] font-black uppercase transition-all ${activeClass === cls ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auto-Set Button for Admins */}
        {isAdmin && (
          <button
            onClick={() => setShowAutoSet(true)}
            className="w-full px-3 py-2 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all"
          >
            ⚡ Auto-Set {ttType === "class" ? "Regular" : ttType === "ca" ? "CA" : "Exam"} Timetable for {activeClass}
          </button>
        )}

        {/* Timetable Grid - Mobile Responsive */}
        <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4">
          <table className="w-full text-[11px] sm:text-xs border-separate border-spacing-0.5 sm:border-spacing-1 min-w-[640px] print:min-w-0 print:border-collapse print:border-spacing-0">
            <thead>
              <tr>
                <th className="text-left text-slate-400 font-black uppercase px-1 sm:px-2 py-1">Period</th>
                {timetable.days.map(d => (
                  <th key={d} className="text-slate-500 font-black uppercase px-1 py-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timetable.periods.map(p => {
                const isShortBreak = ["sbr","br"].includes(p.id) || /short.?break/i.test(p.label);
                const isLongBreak  = p.id === "lbr" || /long.?break|lunch/i.test(p.label);
                const isBreak      = isShortBreak || isLongBreak;
                const isAssembly   = p.id === "asm" || /morning.?assembly|^assembly/i.test(p.label);
                const isClosing    = p.id === "cls" || /closing/i.test(p.label);
                const isNonAcademic = isBreak || isAssembly || isClosing;

                const bandBg: Record<string,string> = {
                  assembly:    "#DBEAFE", short_break: "#FEF9C3",
                  long_break:  "#DCFCE7", closing:     "#FEE2E2",
                };
                const bandText: Record<string,string> = {
                  assembly:    "#1E40AF", short_break: "#854D0E",
                  long_break:  "#166534", closing:     "#991B1B",
                };
                const bandBorder: Record<string,string> = {
                  assembly:    "#BFDBFE", short_break: "#FDE68A",
                  long_break:  "#BBF7D0", closing:     "#FECACA",
                };
                const bandEmoji: Record<string,string> = {
                  assembly: "🎒", short_break: "☕️", long_break: "🍽️", closing: "🏠",
                };
                const bandKey = isAssembly ? "assembly" : isShortBreak ? "short_break" : isLongBreak ? "long_break" : "closing";

                return (
                <tr key={p.id}>
                  <td
                    className="px-1 sm:px-2 py-1 align-middle"
                    style={isNonAcademic ? { background: bandBg[bandKey] } : {}}
                  >
                    <p className="font-black text-[10px] sm:text-xs" style={{ color: isNonAcademic ? bandText[bandKey] : undefined }}>{p.label}</p>
                    <p className="text-[9px]" style={{ color: isNonAcademic ? bandText[bandKey] : "#94a3b8", opacity: isNonAcademic ? 0.7 : 1 }}>{p.start}–{p.end}</p>
                  </td>
                  {isNonAcademic ? (
                    <td
                      colSpan={timetable.days.length}
                      style={{
                        background: bandBg[bandKey],
                        padding: "6px 8px",
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: bandText[bandKey],
                      }}
                    >
                      {bandEmoji[bandKey]} {p.label}
                    </td>
                  ) : timetable.days.map(d => {
                    const c = cellOf(d, p.id);
                    const mine = c?.teacherName && c.teacherName === currentActor;
                    const dim = (!isAdmin && myOnly && !mine) || (isAdmin && filterTeacher !== "" && c?.teacherName !== filterTeacher);
                    return (
                      <td key={d} className="align-top">
                        <button
                          disabled={!isAdmin}
                          onClick={() => isAdmin && setEditing({
                            key: ttType === "class" ? `class|${activeClass}|${d}|${p.id}` : `${ttType}|${activeClass}|${d}|${p.id}`,
                            subject: c?.subject || "",
                            teacherName: c?.teacherName || "",
                          })}
                          className={`w-full min-h-[48px] sm:min-h-[56px] p-1 sm:p-2 rounded-lg text-left transition-all border-2 text-[10px] sm:text-xs ${
                            dim ? "opacity-30" :
                            mine ? "bg-emerald-50 border-emerald-300" :
                            c ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-dashed border-slate-200"
                          } ${isAdmin ? "hover:border-blue-400 cursor-pointer" : "cursor-default"}`}
                        >
                          {c ? (
                            <>
                              <p className="font-black text-slate-800 leading-tight line-clamp-1">{c.subject || "—"}</p>
                              {c.teacherName && <p className="text-[9px] text-slate-500 mt-0.5 truncate">{c.teacherName}</p>}
                            </>
                          ) : (
                            <p className="text-[9px] text-slate-400 italic">{isAdmin ? "Tap to set" : "—"}</p>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Auto-Set Modal */}
      {showAutoSet && (
        <Modal onBgClick={() => setShowAutoSet(false)}>
          <MHead icon={CalendarClock} title="Auto-Set Timetable" subtitle={`Generate default schedule for ${activeClass}`} color="bg-emerald-600" onClose={() => setShowAutoSet(false)} />
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600">This will auto-fill empty slots with subjects from the curriculum for <strong>{activeClass}</strong>. You can customize individual cells afterward.</p>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded text-sm text-blue-700">
              <p className="font-semibold mb-1">ℹ Subjects will be cycled through {timetable.periods.filter(p => !["sbr","lbr","br","asm","cls"].includes(p.id) && !/break|lunch|assembly|closing/i.test(p.label)).length} academic periods.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" onClick={() => setShowAutoSet(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={() => {
                const newCells = generateAutoFill(activeClass);
                dispatch({ type: "SET_TIMETABLE_CELLS", cells: newCells });
                showToast(`Timetable auto-filled for ${activeClass}!`);
                setShowAutoSet(false);
              }}>Auto-Fill</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Cell Modal */}
      {editing && (
        <Modal onBgClick={() => setEditing(null)}>
          <MHead icon={CalendarClock} title="Edit Timetable Slot" subtitle={editing.key.replace(/\|/g, " · ")} color="bg-blue-600" onClose={() => setEditing(null)} />
          <div className="p-6 space-y-4">
            <Field label="Subject">
              <input value={editing.subject}
                onChange={e => setEditing(s => s ? { ...s, subject: e.target.value } : s)}
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 outline-none" />
            </Field>
            <Field label="Teacher">
              <select value={editing.teacherName}
                onChange={e => setEditing(s => s ? { ...s, teacherName: e.target.value } : s)}
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 outline-none">
                <option value="">— None —</option>
                {staffList.filter(s => s.status !== "revoked").map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => {
                dispatch({ type: "SET_TIMETABLE_CELL", key: editing.key, cell: null });
                showToast("Slot cleared");
                setEditing(null);
              }}>Clear</Btn>
              <Btn variant="primary" onClick={() => {
                dispatch({ type: "SET_TIMETABLE_CELL", key: editing.key,
                  cell: { subject: editing.subject.trim(), teacherName: editing.teacherName } });
                if (editing.teacherName) {
                  dispatch({ type: "ADD_NOTIFICATION", payload: makeNotification({
                    fromActor: currentActor, fromRole: "system",
                    toScope: `staff:${editing.teacherName}`,
                    title: "New timetable assignment",
                    body: `You have been assigned ${editing.subject || "a period"} (${editing.key.replace(/\|/g, " · ")}).`,
                  }) });
                }
                showToast("Slot saved — staff notified");
                setEditing(null);
              }}>Save</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox / notifications view
// ─────────────────────────────────────────────────────────────────────────────
function InboxView({
  isAdmin, currentActor, staffList, notifications, dispatch, showToast,
}: {
  isAdmin: boolean;
  currentActor: string;
  staffList: StaffMember[];
  notifications: AppNotification[];
  dispatch: React.Dispatch<any>;
  showToast: (msg: string, type?: string) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({
    toScope: isAdmin ? "all-staff" : "admin",
    title: "",
    body: "",
    priority: "normal" as "normal" | "high",
  });

  const visible = useMemo(
    () => notifications.filter(n => notificationVisible(n, isAdmin, currentActor)),
    [notifications, isAdmin, currentActor]
  );

  const send = () => {
    if (!draft.title.trim() || !draft.body.trim()) return showToast("Add a title and message.", "error");
    dispatch({ type: "ADD_NOTIFICATION", payload: makeNotification({
      fromActor: currentActor,
      fromRole: isAdmin ? "admin" : "staff",
      toScope: draft.toScope as any,
      title: draft.title.trim(),
      body: draft.body.trim(),
      priority: draft.priority,
    }) });
    showToast("Message sent");
    setDraft({ toScope: isAdmin ? "all-staff" : "admin", title: "", body: "", priority: "normal" });
    setComposing(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Inbox</h1>
          <p className="text-sm text-slate-400">{visible.length} message(s) · {visible.filter(n => !n.readBy.includes(currentActor)).length} unread</p>
        </div>
        <Btn variant="primary" onClick={() => setComposing(true)}><Send size={14} />New Message</Btn>
      </div>

      {visible.length === 0
        ? <EmptyState icon={Inbox} title="No messages" subtitle={isAdmin ? "Notify staff of updates and announcements." : "Messages from admin and the system appear here."} />
        : (
          <div className="space-y-2">
            {visible.map(n => {
              const unread = !n.readBy.includes(currentActor);
              return (
                <Card key={n.id} className={`p-4 ${unread ? "border-l-4 border-l-blue-500" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.priority === "high" ? "bg-red-100 text-red-600" : n.fromRole === "system" ? "bg-amber-100 text-amber-600" : n.fromRole === "admin" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"}`}>
                      <MessageSquare size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-slate-900">{n.title}</p>
                        {n.priority === "high" && <Pill color="red">High</Pill>}
                        {unread && <Pill color="blue">New</Pill>}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{n.body}</p>
                      <p className="text-[10px] text-slate-400 mt-2 uppercase font-bold">
                        {n.fromActor} · {new Date(n.createdAt).toLocaleString()} · to {n.toScope}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {unread && (
                        <button onClick={() => dispatch({ type: "MARK_NOTIFICATION_READ", id: n.id, actor: currentActor })}
                          className="text-[10px] font-black uppercase text-blue-600 hover:underline">Mark read</button>
                      )}
                      {(isAdmin || n.fromActor === currentActor) && (
                        <button onClick={() => dispatch({ type: "DELETE_NOTIFICATION", id: n.id })}
                          className="text-[10px] font-black uppercase text-red-500 hover:underline">Delete</button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {composing && (
        <Modal onBgClick={() => setComposing(false)}>
          <MHead icon={Send} title="New Message" subtitle={isAdmin ? "Notify staff" : "Message admin"} color="bg-blue-600" onClose={() => setComposing(false)} />
          <div className="p-6 space-y-4">
            <Field label="To">
              <select value={draft.toScope}
                onChange={e => setDraft(d => ({ ...d, toScope: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 outline-none">
                {isAdmin ? (
                  <>
                    <option value="all-staff">All staff</option>
                    <option value="admin">Admin (yourself)</option>
                    {staffList.filter(s => s.status !== "revoked").map(s => (
                      <option key={s.id} value={`staff:${s.name}`}>{s.name}</option>
                    ))}
                  </>
                ) : (
                  <option value="admin">Admin</option>
                )}
              </select>
            </Field>
            <Field label="Title">
              <input value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Short subject"
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 outline-none" />
            </Field>
            <Field label="Message">
              <textarea value={draft.body} rows={4}
                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                placeholder="Write your message…"
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium focus:border-blue-500 outline-none resize-none" />
            </Field>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={draft.priority === "high"}
                onChange={e => setDraft(d => ({ ...d, priority: e.target.checked ? "high" : "normal" }))} />
              High priority
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" onClick={() => setComposing(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={send}><Send size={13} />Send</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}



function RankingsTab({ entries, schoolSettings, can, isAdmin }: { entries: Entry[]; schoolSettings: SchoolSettings; can: (p:string)=>boolean; isAdmin: boolean }) {
  const [rankClass, setRankClass] = useState(ALL_CLASSES[0]);
  const [rankType, setRankType] = useState<"total"|"subject"|"cumulative">("total");
  const [rankSubject, setRankSubject] = useState("");

  const classTermEntries = useMemo(() => entries.filter(e => e.studentClass === rankClass && (!e.term || e.term === schoolSettings.term) && (!e.session || e.session === schoolSettings.session)), [entries, rankClass, schoolSettings]);
  const classSubjects = useMemo(() => [...new Set(classTermEntries.map(e => e.subject))].sort(), [classTermEntries]);
  
  useEffect(() => {
    if (!classSubjects.includes(rankSubject) && classSubjects.length > 0) {
      setRankSubject(classSubjects[0]);
    }
  }, [classSubjects, rankSubject]);

  const currentStandings = useMemo(() => {
    if (rankType === "total") {
      return computeStandings(
        entries, rankClass,
        e => (!e.term || e.term === schoolSettings.term) && (!e.session || e.session === schoolSettings.session),
        st => st.reduce((a, c) => a + c.total, 0)
      );
    } else if (rankType === "subject") {
      return computeStandings(
        entries, rankClass,
        e => (!e.term || e.term === schoolSettings.term) && (!e.session || e.session === schoolSettings.session) && e.subject === rankSubject,
        st => st.reduce((a, c) => a + c.total, 0)
      );
    } else if (rankType === "cumulative") {
      return computeStandings(
        entries, rankClass,
        e => (!e.session || e.session === schoolSettings.session),
        st => {
          const byTerm: Record<string, number> = {};
          st.forEach(e => {
            const t = e.term || schoolSettings.term;
            byTerm[t] = (byTerm[t] || 0) + e.total;
          });
          const terms = Object.values(byTerm);
          if (terms.length === 0) return 0;
          return terms.reduce((a, c) => a + c, 0) / terms.length;
        }
      );
    }
    return [];
  }, [entries, rankClass, rankType, rankSubject, schoolSettings]);

  const toTitleCase = (str: string) => str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Class Rankings</h1>
          <p className="text-sm text-slate-400">View student standings and academic performance</p>
        </div>
        <div className="flex gap-2 no-print">
          <Btn variant="outline" onClick={() => window.print()} title="Print / PDF">
            <Printer size={14}/> Print
          </Btn>
          <Btn variant="primary" onClick={() => {
            const isSubject = rankType === "subject";
            const headers = isSubject 
              ? ["Rank", "Student", "Subject", "Score"] 
              : ["Rank", "Student", "Score"];
              
            const rows = currentStandings.map(s => {
              const valFmt = rankType === "cumulative" ? s.value.toFixed(1) : s.value;
              return isSubject 
                ? [s.rank, s.name, rankSubject, valFmt] 
                : [s.rank, s.name, valFmt];
            });
            exportToCSV(`Rankings_${rankClass}_${rankType}`, headers, rows);
          }} title="Export Excel">
            <Download size={14}/> Export
          </Btn>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Class</label>
            <select value={rankClass} onChange={e => setRankClass(e.target.value)} className="w-48 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none">
              {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Ranking Type</label>
            <select value={rankType} onChange={e => setRankType(e.target.value as any)} className="w-56 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none">
              <option value="total">Total Score (Current Term)</option>
              <option value="subject">By Subject (Current Term)</option>
              <option value="cumulative">Cumulative (All Terms)</option>
            </select>
          </div>
          {rankType === "subject" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-400">Subject</label>
              <select value={rankSubject} onChange={e => setRankSubject(e.target.value)} className="w-48 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none">
                {classSubjects.length === 0 && <option value="">No subjects yet</option>}
                {classSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-5 py-3 font-black tracking-widest text-xs uppercase">Rank</th>
                <th className="px-5 py-3 font-black tracking-widest text-xs uppercase">Student</th>
                <th className="px-5 py-3 font-black tracking-widest text-xs uppercase text-right">
                  {rankType === "subject" ? "Subject Score" : rankType === "cumulative" ? "Avg Total / Term" : "Total Score"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentStandings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400 font-bold">No ranking data available for this selection.</td>
                </tr>
              ) : (
                currentStandings.map((s, idx) => {
                  const valFmt = rankType === "cumulative" ? s.value.toFixed(1) : s.value;
                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          {s.rank <= 3 && <Trophy size={14} className={s.rank === 1 ? "text-amber-500" : s.rank === 2 ? "text-slate-400" : "text-amber-700"} />}
                          {getOrdinal(s.rank)}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-bold text-slate-700">{toTitleCase(s.name)}</td>
                      <td className="px-5 py-3 font-black text-slate-900 text-right">{valFmt}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const TourTooltip = ({
  index,
  step,
  backProps,
  primaryProps,
  tooltipProps,
  size,
  isLastStep,
}: TooltipRenderProps) => {
  const isLast = index === size - 1 || isLastStep;
  const { children: ignored, ...cleanPrimaryProps } = primaryProps || {};
  return (
    <div {...tooltipProps} className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 max-w-sm w-80 font-sans z-[10000]">
      {step.title && <h3 className="font-black text-lg text-slate-900 mb-2">{step.title}</h3>}
      <div className="text-slate-600 text-sm mb-5 leading-relaxed">{step.content}</div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-slate-400">Step {index + 1} of {size || 'unknown'}</span>
        </div>
        <div className="flex gap-2">
          {index > 0 && (
            <button {...backProps} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition-colors">
              Back
            </button>
          )}
          <button {...cleanPrimaryProps} className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md shadow-blue-500/20">
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

function useReminderChecker(appState: AppState, dispatch: any, isAdmin: boolean, currentActor: string) {
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const currentMonth = todayStr.slice(0, 7);

      if (isAdmin && appState.schoolSettings.salaryReminderEnabled && appState.schoolSettings.salaryDay) {
        const payDay = appState.schoolSettings.salaryDay;
        const currentDay = now.getDate();
        
        // Simple 24h check: if today is payDay or payDay - 1
        if (currentDay === payDay || currentDay === payDay - 1) {
          const reminderId = `salary-${currentMonth}`;
          const alreadySent = appState.notifications.some(n => n.type === "system_salary" && n.referenceId === reminderId);
          if (!alreadySent) {
            dispatch({
              type: "ADD_NOTIFICATION",
              payload: {
                id: uid(),
                createdAt: now.toISOString(),
                fromActor: "System",
                fromRole: "system",
                toScope: "admin",
                title: "Salary Deadline Approaching",
                body: `The scheduled salary payment day (${payDay}) is approaching. Please process payroll soon.`,
                priority: "high",
                readBy: [],
                type: "system_salary",
                referenceId: reminderId
              }
            });
          }
        }
      }

      if (!isAdmin && currentActor) {
        // Teacher schedule check
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const currentDayName = dayNames[now.getDay()];
        
        appState.timetable.periods.forEach(period => {
          const cellKey = Object.keys(appState.timetable.cells).find(key => 
            key.includes(`|${currentDayName}|${period.id}`) && 
            appState.timetable.cells[key].teacherName === currentActor
          );
          
          if (cellKey) {
            const cell = appState.timetable.cells[cellKey];
            const [hours, minutes] = period.start.split(":").map(Number);
            const periodTime = new Date();
            periodTime.setHours(hours, minutes, 0, 0);
            
            const diffMinutes = (periodTime.getTime() - now.getTime()) / (1000 * 60);
            
            if (diffMinutes > 0 && diffMinutes <= 35) {
              const reminderId = `schedule-${currentDayName}-${period.id}-${todayStr}`;
              const alreadySent = appState.notifications.some(n => n.type === "system_schedule" && n.referenceId === reminderId);
              
              if (!alreadySent) {
                dispatch({
                  type: "ADD_NOTIFICATION",
                  payload: {
                    id: uid(),
                    createdAt: now.toISOString(),
                    fromActor: "System",
                    fromRole: "system",
                    toScope: `staff:${currentActor}`,
                    title: "Upcoming Class Reminder",
                    body: `You have ${cell.subject} starting in ${Math.round(diffMinutes)} minutes (${period.start}).`,
                    priority: "normal",
                    readBy: [],
                    type: "system_schedule",
                    referenceId: reminderId
                  }
                });
              }
            }
          }
        });
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [appState.schoolSettings, appState.timetable, appState.notifications, isAdmin, currentActor, dispatch]);
}

// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App({ onTenantSignOut, tenantId, tenantSchoolName, polledData, onLocalEdit, onStateChange }: { onTenantSignOut?: () => void; tenantId?: string; tenantSchoolName?: string; polledData?: any; onLocalEdit?: (state: any) => void; onStateChange?: (state: any) => void } = {}) {
  const [appState, dispatchRaw] = useReducer(appReducer, initialState);

  // Protect against stale data bleed across tenants on the same browser
  useEffect(() => { if (tenantId) localStorage.setItem("gm_last_tenant_id", tenantId); }, [tenantId]);

  const dispatch = useCallback((action: any) => {
    dispatchRaw(action);
    // Background sync to Supabase
    if (["ADD_ENTRY", "DELETE_ENTRY", "RESTORE_ENTRY", "SAVE_STAFF", "SET_STAFF_STATUS", "BULK_SAVE_ATTENDANCE", "SAVE_CLASS_ROLL"].includes(action.type)) {
      import("@/lib/activity-sync").then(({ syncActivityLog }) => {
        const actor = action.actor || action.payload?.enteredBy || action.payload?.name || "System";
        let actionStr = action.type;
        let details = "";
        switch (action.type) {
          case "ADD_ENTRY": actionStr = "Added Score"; details = `${action.payload.subject} for ${action.payload.studentName}`; break;
          case "DELETE_ENTRY": actionStr = "Deleted Score"; details = `ID: ${action.id}`; break;
          case "SAVE_STAFF": actionStr = "Updated Staff"; details = `Staff: ${action.payload.name}`; break;
          case "BULK_SAVE_ATTENDANCE": actionStr = "Saved Attendance"; details = `${action.payload.length} records`; break;
          case "SAVE_CLASS_ROLL": actionStr = "Saved Class Roll"; details = `Class: ${action.className}`; break;
        }
        syncActivityLog(null, actor, actionStr, details).catch(() => {});
      }).catch(() => {});
    }
  }, []);
  const { toast, showToast } = useToast();
  const [needsAdminSetup, setNeedsAdminSetup] = useState<boolean>(false);
  const [setupPin, setSetupPin] = useState({ nxt: "", cnf: "" });
  const [setupErr, setSetupErr] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const [showLogout, setShowLogout] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [dlg, setDlg] = useState<any>(null);
  const [showBin, setShowBin] = useState(false);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ loggedIn: boolean; user: StaffMember | null }>({ loggedIn: false, user: null });
  const [runTour, setRunTour] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);

  useEffect(() => {
    if (auth.loggedIn) {
      const isTourComplete = localStorage.getItem("app_tour_completed");
      if (!isTourComplete) {
        setActiveTab("dashboard");
        setTourIndex(0);
        setTimeout(() => setRunTour(true), 1000);
      }
    }
  }, [auth.loggedIn]);


  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotInput, setForgotInput] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [dbClass,  setDbClass]  = useState("");
  const [dbDate,   setDbDate]   = useState("");
  const [dbTerm,   setDbTerm]   = useState<string>("Current"); // "Current" | "All" | term name
  const [rpSearch, setRpSearch] = useState("");
  const [rpClass,  setRpClass]  = useState("All");
  const [activeReport, setActiveReport] = useState<any>(null);
  const [linkedSignatures, setLinkedSignatures] = useState<Record<string, string>>({});
  const classTeacher = useMemo(() => {
    if (!activeReport) return null;
    const candidates = appState.staffList.filter(s => s.assignedClasses.includes(activeReport.class));
    const exact = candidates.find(s => s.role.toLowerCase().includes("class teacher"));
    return exact || candidates[0] || null;
  }, [activeReport, appState.staffList]);

  useEffect(() => {
    if (!tenantId || !classTeacher) return;
    if (linkedSignatures[classTeacher.id] !== undefined) return; // already fetched or attempted
    
    (async () => {
      const { db: schoolDb } = await import("@/supabase/schoolService");
      const { data } = await (schoolDb()
        .from("profiles") as any)
        .select("signature")
        .eq("staff_member_id", classTeacher.id)
        .eq("school_id", tenantId)
        .maybeSingle();
        
      if ((data as any)?.signature) {
        setLinkedSignatures(prev => ({ ...prev, [classTeacher.id]: (data as any).signature }));
      } else {
        setLinkedSignatures(prev => ({ ...prev, [classTeacher.id]: "" })); // mark as attempted
      }
    })();
  }, [tenantId, classTeacher, linkedSignatures]);

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

  // ─── Dynamic App Tour Logic ────────────────────────────────────────────────
  const tourSteps = useMemo(() => {
    const steps: Step[] = [
      {
        target: '#tour-dashboard-hero',
        title: 'Welcome to School GradeFlow!',
        content: 'This is your Dashboard. Here you can see a high-level overview of your school\'s performance and quick statistics.',
        disableBeacon: true,
        placement: 'bottom',
      }
    ];

    if (isAdmin) {
      steps.push({
        target: '#tour-staff-header',
        title: 'Staff Access',
        content: 'Manage staff profiles, assign classes and subjects, and control detailed feature-level access rights.',
        placement: 'bottom',
        disableBeacon: true,
      });
    }

    if (can("scoreEntry") || isAdmin) {
      steps.push({
        target: '#tour-attendance-header',
        title: 'Attendance & Enrollment',
        content: 'This is the Attendance tab. Every workflow starts here! You use this tab to enroll students into your classes.',
        placement: 'bottom',
        disableBeacon: true,
      });
      steps.push({
        target: '#tour-roll-card',
        title: 'Class Rolls',
        content: 'Select a class here to manage its roll. You can manually type names, import hundreds of students via CSV, or export the roll to Excel.',
        placement: 'top',
        disableBeacon: true,
      });
      steps.push({
        target: '#tour-records-header',
        title: 'Grade Entry',
        content: 'Once your students are enrolled, head to the Records tab to seamlessly input continuous assessments (CA) and exam scores!',
        placement: 'bottom',
        disableBeacon: true,
      });
    }

    if (can("printReports") || isAdmin) {
      steps.push({
        target: '#tour-reports-header',
        title: 'Report Cards',
        content: 'The Reports tab automatically generates and publishes end-of-term student report cards based on the scores you entered.',
        placement: 'bottom',
        disableBeacon: true,
      });
    }

    if (isAdmin || can("fees")) {
      steps.push({
        target: '#tour-fees-header',
        title: 'Fees Tracker',
        content: 'Track fee payment records, generate receipts, and manage class structures dynamically.',
        placement: 'bottom',
        disableBeacon: true,
      });
    }

    steps.push({
      target: '#tour-timetable-header',
      title: 'School Timetable',
      content: 'Define school hours, assign teachers to subject periods, and view schedules.',
      placement: 'bottom',
      disableBeacon: true,
    });

    if (isAdmin) {
      steps.push({
        target: '#tour-resources-header',
        title: 'Curriculum Resources',
        content: 'Access curriculum e-notes, syllabus documents, and education board standards.',
        placement: 'bottom',
        disableBeacon: true,
      });
      steps.push({
        target: '#tour-settings-header',
        title: 'School Settings',
        content: 'Finally, the Settings tab lets you control your school\'s identity, grading system (e.g. WAEC standard), and academic term.',
        placement: 'bottom',
        disableBeacon: true,
      });
    }

    return steps;
  }, [can, isAdmin]);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      setTourIndex(0);
      localStorage.setItem("app_tour_completed", "true");
      setActiveTab("attendance");
    } else if (type === EVENTS.STEP_AFTER) {
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      // If we advance past the last step, finish the tour and redirect to Attendance!
      if (nextStepIndex >= tourSteps.length) {
        setRunTour(false);
        setTourIndex(0);
        localStorage.setItem("app_tour_completed", "true");
        setActiveTab("attendance");
        return;
      }

      if (nextStepIndex < 0) return;

      const targetSelector = tourSteps[nextStepIndex]?.target;
      let targetTab = "dashboard";
      
      if (typeof targetSelector === 'string') {
        if (targetSelector.includes('attendance') || targetSelector.includes('roll')) targetTab = "attendance";
        else if (targetSelector.includes('records')) targetTab = "database";
        else if (targetSelector.includes('reports')) targetTab = "reports";
        else if (targetSelector.includes('settings')) targetTab = "settings";
        else if (targetSelector.includes('staff')) targetTab = "staff";
        else if (targetSelector.includes('fees')) targetTab = "fees";
        else if (targetSelector.includes('resources')) targetTab = "resources";
        else if (targetSelector.includes('timetable')) targetTab = "timetable";
      }

      if (targetTab !== activeTab) {
        setActiveTab(targetTab);
      }
      setTourIndex(nextStepIndex);
    }
  }, [activeTab, tourSteps, setActiveTab, setRunTour, setTourIndex]);

  // Refresh score entry form whenever the active actor changes (login/logout/switch)
  const prevAuthId = useRef(auth.user?.id);
  const prevIsAdmin = useRef(isAdmin);
  useEffect(() => {
    if (prevAuthId.current !== auth.user?.id || prevIsAdmin.current !== isAdmin) {
      setScoreForm({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" });
      prevAuthId.current = auth.user?.id;
      prevIsAdmin.current = isAdmin;
    }
  }, [auth.user?.id, isAdmin]);

  const subjectList = useMemo(() => {
    const cat = Object.values(CURRICULUM).find(c => c.classes.includes(scoreForm.studentClass));
    const fromClass = cat ? cat.subjects : [];
    // Subject Teacher scoping: if staff has assignedSubjects, restrict to those that are valid for this class
    const restrict = auth.user?.assignedSubjects || [];
    if (!isAdmin && restrict.length > 0) {
      return fromClass.filter(s => restrict.includes(s));
    }
    return fromClass;
  }, [scoreForm.studentClass, auth.user, isAdmin]);

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

  const filteredEntries = useMemo(() => {
    const base = dbTerm === "Current"
      ? termEntries
      : dbTerm === "All"
        ? entries
        : entries.filter(e => (e.term || schoolSettings.term) === dbTerm &&
            (!e.session || e.session === schoolSettings.session));
    return base.filter(e =>
      (!dbSearch || e.studentName.toLowerCase().includes(dbSearch.toLowerCase())) &&
      (!dbClass  || e.studentClass === dbClass) &&
      (!dbDate   || e.createdAt.slice(0, 10) === dbDate)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [termEntries, entries, dbSearch, dbClass, dbDate, dbTerm, schoolSettings.term, schoolSettings.session]);

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
    { id:"my_profile", label:"My Profile", icon:UserCircle,       show:!isAdmin,                              primary:true },
    { id:"staff",      label:"Staff",      icon:Users,            show:isAdmin,                               primary:false },
    { id:"payroll",    label:"Payroll",    icon:Calculator,       show:isAdmin||can("payroll"),               primary:false },
    { id:"fees",       label:"Fees",       icon:DollarSign,       show:isAdmin||can("fees"),                  primary:false },
    { id:"inbox",      label:"Inbox",      icon:Inbox,            show:true,                                  primary:false },
    { id:"timetable",  label:"Timetable",  icon:CalendarClock,    show:true,                                  primary:false },
    { id:"attendance", label:"Attendance", icon:CalendarDays,     show:can("scoreEntry")||isAdmin,            primary:false },
    { id:"database",   label:"Records",    icon:Database,         show:isAdmin||can("manageRecords")||can("scoreEntry"), primary:true },
    { id:"students",   label:"Directory",  icon:Users,            show:isAdmin||can("manageRecords"), primary:true },
    { id:"reports",    label:"Reports",    icon:FileText,         show:can("viewReports"),                    primary:true },
    { id:"rankings",   label:"Rankings",   icon:Trophy,           show:isAdmin||can("rankings"),              primary:false },
    { id:"entry",      label:"Score Entry",icon:PlusCircle,       show:can("scoreEntry"),                     primary:true },
    { id:"resources",  label:"Resources",  icon:BookOpen,         show:isAdmin,                               primary:false },
    { id:"settings",   label:"Settings",   icon:Settings,         show:isAdmin,                               primary:false },
  ].filter(t => t.show), [can, isAdmin]);

  const primaryTabs = useMemo(() => TABS.filter(t => t.primary), [TABS]);
  const moreTabs    = useMemo(() => TABS.filter(t => !t.primary), [TABS]);

  const doLogin = useCallback(async () => {
    setLoginErr("");

    const expectedAdminUsername = appState.schoolSettings?.adminUsername || "admin";

    if (loginId.toLowerCase() === expectedAdminUsername.toLowerCase()) {
      if (!loginPass) return setLoginErr("Enter a password");
      
      const session = loadTenantSession();
      if (!session) return setLoginErr("Session error. Please re-login.");
      
      const ok = await verifyAdminPin(session, loginPass);
      if (!ok) return setLoginErr("Incorrect password.");
      
      setAuth({ loggedIn: true, user: null });
      setActiveTab("dashboard");
      logSignIn("Admin", "Administrator");
      
      let st = "";
      try { const r = sessionStorage.getItem("schoolapp_tenant_session_v2"); if (r) st = JSON.parse(r).sessionToken; } catch {}
      if (st) {
        import("@/integrations/supabase/client").then(async ({ supabase }) => {
          const { error } = await supabase.rpc("log_staff_session_event", { _session_token: st, _staff_member_id: "admin", _staff_name: "Admin", _role: "Administrator", _action: "login" });
          if (error) console.error("Failed to log staff session event:", error);
        });
      }
      return;
    }

    // Staff login — match by staffCode
    const s = staffList.find(st => st.staffCode?.toLowerCase() === loginId.toLowerCase());
    if (!s) return setLoginErr("Invalid Staff ID or PIN.");
    if (s.status === "revoked") return setLoginErr("Your access has been revoked. Contact admin.");

    const pinOk = await verifyPIN(loginPass, s.pin);
    if (!pinOk) return setLoginErr("Invalid name or PIN.");

    // Migrate plain PIN to hash on first successful login
    if (!s.pin.startsWith("h:") && !s.pin.startsWith("p:")) {
      const hashed = await ensureHashed(s.pin);
      dispatch({ type: "SAVE_STAFF", payload: { ...s, pin: hashed, updatedAt: new Date().toISOString() } });
    }

    setAuth({ loggedIn: true, user: s });
    setActiveTab("dashboard");
    logSignIn(s.name, s.role);
    
    let st = "";
    try { const r = sessionStorage.getItem("schoolapp_tenant_session_v2"); if (r) st = JSON.parse(r).sessionToken; } catch {}
    if (st) {
      import("@/integrations/supabase/client").then(async ({ supabase }) => {
        const { error } = await supabase.rpc("log_staff_session_event", { _session_token: st, _staff_member_id: s.id, _staff_name: s.name, _role: s.role, _action: "login" });
        if (error) console.error("Failed to log staff session event:", error);
      });
    }
    if (s.status === "restricted") showToast("Account restricted — limited access.", "warning");
  }, [loginId, loginPass, staffList, showToast, appState.schoolSettings]);

  // Record one sign-in per staff per day (admin or staff). Idempotent in reducer.
  const logSignIn = useCallback((staffName: string, role: string) => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    dispatch({
      type: "LOG_STAFF_SIGNIN",
      payload: { id: uid(), staffName, role, date, time, ts: now.toISOString() },
    });
  }, []);

  const submitScore = useCallback(() => {
    const { studentName, studentClass, subject, caScore, examScore } = scoreForm;
    if (!studentName.trim() || !studentClass || !subject || caScore === "" || examScore === "")
      return showToast("Fill in all fields.", "error");
    if (entries.some(e =>
      e.studentName.toLowerCase().trim() === studentName.toLowerCase().trim() &&
      e.studentClass === studentClass && e.subject === subject &&
      (!e.term || e.term === schoolSettings.term) &&
      (!e.session || e.session === schoolSettings.session)
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
    showToast("Score saved — form refreshed");
    // Full refresh: clear name, class, subject and scores
    setScoreForm({ studentName: "", studentClass: "", subject: "", caScore: "", examScore: "" });
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

    const standings = computeStandings(
      entries,
      student.class,
      inTerm,
      (studentEntries) => studentEntries.reduce((a, c) => a + c.total, 0)
    );
    const pos = standings.find(s => s.name === student.name.toLowerCase().trim())?.rank || 0;
    
    const total = records.reduce((a, c) => a + c.total, 0);

    // Auto-fill attendance if empty
    const curComments = appState.comments[student.id] || {};
    if (!curComments.daysOpen && !curComments.daysPresent && !curComments.daysAbsent) {
      const classAttendance = appState.attendance.filter(a => a.studentClass === student.class);
      if (classAttendance.length > 0) {
        const uniqueDates = new Set(classAttendance.map(a => a.date));
        const studentAttendance = classAttendance.filter(a => a.studentName.toLowerCase() === student.name.toLowerCase());
        const presentCount = studentAttendance.filter(a => a.status === "Present" || a.status === "Late").length;
        const absentCount = studentAttendance.filter(a => a.status === "Absent").length;
        
        dispatch({ type: "SET_COMMENT", studentId: student.id, field: "daysOpen", value: String(uniqueDates.size) });
        dispatch({ type: "SET_COMMENT", studentId: student.id, field: "daysPresent", value: String(presentCount) });
        dispatch({ type: "SET_COMMENT", studentId: student.id, field: "daysAbsent", value: String(absentCount) });
      }
    }

    setActiveReport({
      id: student.id,
      name: student.name,
      class: student.class,
      records,
      position: pos > 0 ? getOrdinal(pos) : "-",
      classCount: standings.length,
      summary: { total, obtainable: records.length * 100, avg: records.length ? (total / records.length).toFixed(1) : "0.0" },
    });
    setActiveTab("reports");
  }, [entries, showToast, schoolSettings.term, schoolSettings.session, appState.comments, appState.attendance, dispatch]);

  const saveStaff = useCallback(async (sd: StaffMember) => {
    const isEdit = appState.staffList.some(s => s.id === sd.id);
    let code = sd.staffCode;
    if (!isEdit && !code) {
      code = generateStaffCode(sd.name, appState.staffList.map(s => s.staffCode).filter(Boolean) as string[]);
    }
    // Hash PIN if it's a new raw value (not already hashed/prefixed)
    const finalPin = sd.pin ? await ensureHashed(sd.pin) : (appState.staffList.find(s => s.id === sd.id)?.pin || "");
    dispatch({ type: "SAVE_STAFF", payload: { ...sd, pin: finalPin, staffCode: code } });
    showToast(`${sd.name} ${isEdit ? "updated" : "created successfully"}`);
    setDlg(null);
  }, [appState.staffList, showToast]);

  const currentActor = isAdmin ? "Admin" : (auth.user?.name || "Staff");
  
  useReminderChecker(appState, dispatch, isAdmin, currentActor);
  const unreadInbox = useMemo(
    () => appState.notifications.filter(n => notificationVisible(n, isAdmin, currentActor) && !n.readBy.includes(currentActor)).length,
    [appState.notifications, isAdmin, currentActor]
  );
  const ctxValue = useMemo<AppCtxType>(() => ({ state: appState, dispatch, showToast, currentActor, tenantId }), [appState, showToast, currentActor, tenantId]);

  // ── Ref to distinguish local edits from remote state replacements ───────
  const isApplyingRemoteRef = useRef(false);
  const hasHydratedRef = useRef(!!localStorage.getItem(DB_KEY));

  // ── Auto-save to localStorage whenever state changes ──────────────────────
  const onLocalEditRef = useRef(onLocalEdit);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onLocalEditRef.current = onLocalEdit; }, [onLocalEdit]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  useEffect(() => {
    if (onStateChangeRef.current) onStateChangeRef.current(appState);

    if (!hasHydratedRef.current) return;

    // If this state change was triggered by receiving remote data, skip saving
    // it back out to avoid feedback loops and unnecessary writes.
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      // Ensure merged state is persisted locally to prevent data loss on reload
      debouncedSaveDB(appState, false);
      return;
    }
    debouncedSaveDB(appState);
    if (onLocalEditRef.current) onLocalEditRef.current(appState);
  }, [appState]);

  // ── Direct hydration via polling from TenantApp ────────────────────────
  // When TenantApp pulls a newer remote snapshot, it passes it down via polledData.
  // We rehydrate the reducer so the UI converges.
  const serverRevRef = useRef<number>(-1);
  useEffect(() => {
    if (!polledData) return;
    try {
      const rev = typeof polledData._rev === "number" ? polledData._rev : 0;
      if (rev <= serverRevRef.current) return;
      serverRevRef.current = rev;
      const { _rev, _updatedAt, _deviceId, ...payload } = polledData;
      isApplyingRemoteRef.current = true;
      hasHydratedRef.current = true;
      dispatch({ type: "REPLACE_ALL", payload });
    } catch { /* ignore */ }
  }, [polledData, dispatch]);

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



  // ── Forgot password ────────────────────────────────────────────────────────
  if (!auth.loggedIn && forgotOpen) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-amber-500">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-amber-100 rounded-2xl mb-3"><ShieldAlert size={28} className="text-amber-600" /></div>
          <h2 className="text-xl font-black text-slate-900">Password Recovery</h2>
        </div>
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 font-medium space-y-2">
            <p className="font-black uppercase">PIN cannot be recovered</p>
            <p>For security, admin PINs are stored as one-way hashes and cannot be retrieved. If you've lost the PIN, an authorised admin must reset the local database from another signed-in session, or you can clear browser storage to start fresh (this erases all local data).</p>
          </div>
          <Btn variant="ghost" size="lg" className="w-full" onClick={() => { setForgotOpen(false); setForgotStep(1); setForgotInput(""); }}>
            Back to Login
          </Btn>
        </div>
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── First-time admin PIN setup ─────────────────────────────────────────────
  if (!auth.loggedIn && needsAdminSetup) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-blue-600">
        <div className="text-center mb-6">
          <SchoolLogo logoUrl={appState.schoolSettings?.logoUrl || null} size="lg" className="mx-auto mb-4" />
          <h2 className="text-xl font-black text-slate-900">Set Admin PIN</h2>
          <p className="text-xs text-slate-500 mt-2">First-time setup. Choose a strong password of at least 4 characters — letters, numbers and symbols are all supported. Keep it private; it grants full administrative access and cannot be recovered.</p>
        </div>
        {/* Note: This block is technically unreachable since SchoolLock guarantees admin PIN exists. Maintained for safety. */}
        <div className="space-y-4">
          <Field label="New Admin PIN" error={setupErr}>
            <input type="text" style={{ WebkitTextSecurity: "disc" }} maxLength={32} value={setupPin.nxt}
              onChange={e => { setSetupPin(p => ({ ...p, nxt: e.target.value })); setSetupErr(""); }}
              placeholder="Min 4 characters" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none" />
          </Field>
          <Field label="Confirm PIN">
            <input type="text" style={{ WebkitTextSecurity: "disc" }} maxLength={32} value={setupPin.cnf}
              onChange={e => { setSetupPin(p => ({ ...p, cnf: e.target.value })); setSetupErr(""); }}
              placeholder="Re-enter password" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none" />
          </Field>
          <Btn variant="primary" size="lg" className="w-full" onClick={async () => {
            if (setupPin.nxt.length < 4) return setSetupErr("Password must be at least 4 characters.");
            if (setupPin.nxt !== setupPin.cnf) return setSetupErr("Passwords do not match.");
            const session = loadTenantSession();
            if (!session) return setSetupErr("Session error.");
            const ok = await setAdminPin(session, setupPin.nxt);
            if (!ok) return setSetupErr("Failed to save PIN.");
            setSetupPin({ nxt: "", cnf: "" });
            setNeedsAdminSetup(false);
            showToast("Admin PIN created. Please sign in.");
          }}>Create PIN</Btn>
        </div>
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!auth.loggedIn) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-blue-600">
        <div className="text-center mb-8">
          <SchoolLogo logoUrl={appState.schoolSettings?.logoUrl || null} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-900">{schoolSettings.name}</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Staff Authentication</p>
        </div>
        <div className="space-y-4">
          <Inp label="Staff ID / Username" value={loginId} onChange={(e: any) => { setLoginId(e.target.value); setLoginErr(""); }} placeholder="" autoComplete="off" />
          <Field label="Password / PIN" error={loginErr}>
            <input
              type="text"
              style={{ WebkitTextSecurity: "disc" }}
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
            Admin: <code className="font-black bg-slate-100 px-1 rounded">admin</code> + your private PIN · Staff: full name + assigned PIN
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
        <Joyride
          steps={tourSteps}
          run={runTour}
          stepIndex={tourIndex}
          continuous={true}
          showProgress={true}
          showSkipButton={true}
          callback={handleJoyrideCallback}
          onEvent={handleJoyrideCallback}
          tooltipComponent={TourTooltip}
          styles={{
            options: {
              primaryColor: '#2563eb',
              zIndex: 10000,
            }
          }}
        />
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 flex-shrink-0">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <SchoolLogo logoUrl={appState.schoolSettings?.logoUrl || null} size="sm" />
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
                <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "School Admin" : auth.user!.name}</p>
                <p className="text-xs text-slate-400 truncate">{isAdmin ? "Full Access" : auth.user!.role}</p>
              </div>
              {auth.user && <StatusPill status={auth.user.status} />}
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {TABS.map(t => (
              <button key={t.id} id={`tour-tab-${t.id}`} onClick={() => navigate(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                <t.icon size={18} className="flex-shrink-0" />
                <span className="text-sm font-bold">{t.label}</span>
                {t.id === "database" && bin.length > 0 && (
                  <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                )}
                {t.id === "inbox" && unreadInbox > 0 && (
                  <span className="ml-auto text-xs font-black bg-blue-600 text-white rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{unreadInbox}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100 space-y-1">
            <button onClick={() => { setActiveTab("dashboard"); setTourIndex(0); setTimeout(() => setRunTour(true), 300); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all font-bold text-sm group">
              <HelpCircle size={18} className="group-hover:rotate-12 transition-transform" />App Tour
            </button>
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
              <SchoolLogo logoUrl={appState.schoolSettings?.logoUrl || null} size="xs" />
              <p className="font-black text-sm text-slate-900 truncate max-w-[160px]">{schoolSettings.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate("inbox")} className="p-2 text-slate-500 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 relative">
                <Bell size={18} />
                {unreadInbox > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-black bg-blue-600 text-white rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{unreadInbox}</span>
                )}
              </button>
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
                  <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "School Admin" : auth.user!.name}</p>
                  <p className="text-xs text-slate-400">{isAdmin ? "Full Access" : auth.user!.role}</p>
                </div>
                {auth.user && <StatusPill status={auth.user.status} />}
              </div>
              <p className="text-xs font-black uppercase text-slate-400 tracking-wide px-2 pb-1">Navigation</p>
              {TABS.map(t => (
                <button key={t.id} id={`tour-tab-${t.id}`} onClick={() => navigate(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600 font-black" : "text-slate-600 font-bold hover:bg-slate-50"}`}>
                  <t.icon size={18} className="flex-shrink-0" />
                  <span className="text-sm">{t.label}</span>
                  {t.id === "database" && bin.length > 0 && (
                    <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                  )}
                  {t.id === "inbox" && unreadInbox > 0 && (
                    <span className="ml-auto text-xs font-black bg-blue-600 text-white rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{unreadInbox}</span>
                  )}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-100 mt-1 space-y-1">
                <button onClick={() => { setActiveTab("dashboard"); setTourIndex(0); setMenuOpen(false); setTimeout(() => setRunTour(true), 300); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all font-bold text-sm">
                  <HelpCircle size={18} />App Tour
                </button>
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
                  <div id="tour-dashboard-hero" className={`rounded-2xl p-5 ${isAdmin ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white" : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"}`}>
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
                    <Card className="p-5 border-l-4 border-l-amber-500 col-span-2 md:col-span-1">
                        <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-1">Academic Session</p>
                        <p className="text-2xl font-black text-slate-900 leading-tight">{schoolSettings.session || "Not Set"}</p>
                        <p className="text-xs text-slate-500 font-bold mt-1">{schoolSettings.term ? `${schoolSettings.term}` : "Term not set"}</p>
                      </Card>
                  </div>

                  {/* ── Fees Overview (admin-only) ─────────────────────────────── */}
                  {isAdmin && <FeesOverviewCard schoolSettings={schoolSettings} classRolls={appState.classRolls} entries={entries} setActiveTab={setActiveTab} />}

                  {/* ── Staff sign-in roll (admin-only daily presence log) ────── */}
                  {isAdmin && (() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const todays = appState.staffSignIns.filter(s => s.date === today);
                    const allStaffNames = staffList.filter(s => s.status !== "revoked").map(s => s.name);
                    const presentNames = new Set(todays.map(t => t.staffName));
                    const absent = allStaffNames.filter(n => !presentNames.has(n));
                    return (
                      <Card>
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                          <CalendarDays size={14} className="text-emerald-500" />
                          <p className="text-sm font-black uppercase text-slate-600">Staff Sign-In · Today</p>
                          <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">{todays.length} present</span>
                          {absent.length > 0 && <span className="text-xs font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{absent.length} not in</span>}
                        </div>
                        <div className="divide-y divide-slate-50 max-h-[280px] overflow-y-auto">
                          {todays.length === 0 ? (
                            <p className="px-5 py-6 text-center text-xs text-slate-400 font-bold">No staff has signed in today yet.</p>
                          ) : (
                            todays
                              .slice()
                              .sort((a, b) => a.time.localeCompare(b.time))
                              .map(t => (
                                <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                      <span className="text-xs font-black text-emerald-700">{t.staffName.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-black text-slate-900 truncate">{t.staffName}</p>
                                      <p className="text-xs text-slate-500 truncate">{t.role}</p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-black text-emerald-600">{t.time}</span>
                                </div>
                              ))
                          )}
                          {absent.length > 0 && (
                            <div className="px-5 py-3 bg-slate-50/50">
                              <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-wider">Not signed in</p>
                              <div className="flex flex-wrap gap-1.5">
                                {absent.map(n => (
                                  <span key={n} className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-500 text-[11px] font-bold">{n}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })()}

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
                          const ac = log.action === "Deleted" ? "bg-red-100 text-red-600" : log.action === "Restored" ? "bg-emerald-100 text-emerald-700" : (log.action || "").includes("Revok") ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
                          return (
                            <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 ${ac}`}>{log.action}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-slate-900 truncate">
                                    {(log.student || "").includes("Signed In") ? "User logged in" : 
                                     log.action === "Recorded" ? `Payment recorded for ${log.student}` :
                                     log.action === "Added" && log.subject ? `Grade added for ${log.student}` :
                                     log.action === "Deleted" && log.subject ? `Record deleted for ${log.student}` :
                                     log.student}
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
                        <Btn variant="ghost" onClick={() => {
                          const hasData = scoreForm.studentName.trim() || scoreForm.subject || scoreForm.caScore !== "" || scoreForm.examScore !== "";
                          const caUnsaved = scoreForm.caScore !== "" && scoreForm.examScore === "";
                          const msg = caUnsaved
                            ? "You entered a CA score but haven't saved it. Discard this CA without saving?"
                            : "Discard the current entry?";
                          if (hasData && !window.confirm(msg)) return;
                          setScoreForm({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" });
                          showToast("Form cleared");
                        }}>
                          Clear
                        </Btn>
                        <Btn variant="outline" onClick={saveCADraft} title="Save CA only — finalize when exam is ready">
                          <Save size={13} />Save CA
                        </Btn>
                        <Btn variant="primary" onClick={() => {
                          // CA completeness check: warn if exam present but CA missing/zero
                          if (scoreForm.examScore !== "" && (scoreForm.caScore === "" || parseFloat(scoreForm.caScore) === 0) && !draftMatch) {
                            if (!window.confirm("CA score is empty. Continue saving with CA = 0?")) return;
                          }
                          if (draftMatch && scoreForm.caScore === "" && scoreForm.examScore !== "") {
                            finalizeDraft(draftMatch.id, scoreForm.examScore);
                            setScoreForm({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" });
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
                      <h1 id="tour-records-header" className="text-2xl font-black text-slate-900 uppercase">Records</h1>
                      <p className="text-sm text-slate-400">{termEntries.length} in {schoolSettings.term} · {bin.length} in bin</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex gap-2 no-print">
                        <Btn variant="outline" onClick={() => window.print()} title="Print / PDF">
                          <Printer size={14}/> Print
                        </Btn>
                        <Btn variant="primary" onClick={() => {
                          const headers = ["Student", "Class", "Subject", "CA", "Exam", "Total", "Grade"];
                          const rows = filteredEntries.map(e => [
                            e.studentName, e.studentClass, e.subject, e.caScore, e.examScore, e.total, getGrade(e.total).grade
                          ]);
                          exportToCSV(`Academic_Records`, headers, rows);
                        }} title="Export Excel">
                          <Download size={14}/> Export
                        </Btn>
                      </div>
                      {(isAdmin || can("manageRecords")) && (
                        <Btn variant={showBin ? "primary" : "outline"} onClick={() => setShowBin(b => !b)}>
                          <RotateCcw size={14} />{showBin ? "View Active" : `Bin${bin.length ? ` (${bin.length})` : ""}`}
                        </Btn>
                      )}
                    </div>
                  </div>
                  {!showBin && (
                    <Card className="p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                        <select value={dbTerm} onChange={e => setDbTerm(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                          <option value="Current">Current Term ({schoolSettings.term})</option>
                          <option value="All">All Terms</option>
                          {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input type="date" value={dbDate} onChange={e => setDbDate(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
                      </div>
                      {(dbSearch || dbClass || dbDate || dbTerm !== "Current") && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {dbSearch && <Pill color="blue">Name: "{dbSearch}"</Pill>}
                          {dbClass  && <Pill color="indigo">{dbClass}</Pill>}
                          {dbTerm !== "Current" && <Pill color="amber">{dbTerm === "All" ? "All Terms" : dbTerm}</Pill>}
                          {dbDate   && <Pill color="green">{new Date(dbDate + "T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</Pill>}
                          <span className="text-xs text-slate-400 font-bold">{filteredEntries.length} result{filteredEntries.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => { setDbSearch(""); setDbClass(""); setDbDate(""); setDbTerm("Current"); }}
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

              {/* RANKINGS */}
              {activeTab === "rankings" && (isAdmin || can("rankings")) && (
                <RankingsTab entries={entries} schoolSettings={schoolSettings} can={can} isAdmin={isAdmin} />
              )}

              {/* STUDENTS DIRECTORY */}
              {activeTab === "students" && (isAdmin || can("manageRecords")) && (
                <StudentsDirectoryTab tenantId={tenantId} />
              )}

              {/* REPORTS */}
              {activeTab === "reports" && can("viewReports") && (
                !activeReport ? (
                  <>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <h1 id="tour-reports-header" className="text-2xl font-black text-slate-900 uppercase">Reports</h1>
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
                          {filteredStudents.map(s => {
                            const sc = appState.comments[s.id] || {};
                            const sCandidates = appState.staffList.filter(staff => staff.assignedClasses.includes(s.class));
                            const sClassTeacher = sCandidates.find(staff => staff.role.toLowerCase().includes("class teacher")) || sCandidates[0] || null;
                            const checks = [
                              ((s as any).records?.length || 0) > 0,
                              !!(sc.daysOpen && sc.daysPresent),
                              !!sc.teacher,
                              !!sc.principal,
                              !!sc.teacherSig || !!(sClassTeacher && sClassTeacher.signature) || !!(schoolSettings as any).defaultTeacherSignature,
                              !!sc.principalSig || !!(schoolSettings as any).defaultPrincipalSignature,
                            ];
                            const done = checks.filter(Boolean).length;
                            const pct = Math.round((done / checks.length) * 100);
                            const barColor = pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500";
                            return (
                              <button key={s.id} onClick={() => openReport(s)}
                                className="p-5 bg-white border-2 border-slate-100 rounded-2xl text-left group hover:border-blue-400 hover:shadow-md transition-all">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-black text-sm uppercase text-slate-900 truncate">{s.name}</p>
                                    <p className="text-xs font-bold text-slate-400 mt-0.5">{s.class}</p>
                                  </div>
                                  {pct === 100
                                    ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0"/>
                                    : <FileText size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className={`text-[10px] font-black ${pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-blue-600" : "text-amber-600"}`}>{pct}%</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                  </>
                ) : (
                  <div className="space-y-5 max-w-3xl mx-auto">
                    <button onClick={() => setActiveReport(null)}
                      className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors">
                      <X size={13} />Back to Students
                    </button>
                    <Card className="overflow-hidden shadow-xl">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <PenTool size={16} className="text-white/80" />
                          <p className="text-white font-black uppercase tracking-widest text-sm">Report Editor — {activeReport.name}</p>
                        </div>
                        <div className="px-3 py-1 bg-white/20 rounded-full">
                          <span className="text-white text-xs font-black uppercase">{activeReport.class}</span>
                        </div>
                      </div>
                      {(() => {
                        const staffJsonSig = classTeacher ? classTeacher.signature : null;
                        const linkedProfileSig = (classTeacher && linkedSignatures) ? linkedSignatures[classTeacher.id] : null;
                        const checks = [
                          { label: "Scores", done: (activeReport.records?.length || 0) > 0 },
                          { label: "Attendance", done: !!(curC.daysOpen && curC.daysPresent) },
                          { label: "Teacher Remark", done: !!curC.teacher },
                          { label: "Principal Remark", done: !!curC.principal },
                          { label: "Teacher Signature", done: !!curC.teacherSig || !!staffJsonSig || !!linkedProfileSig || !!(schoolSettings as any).defaultTeacherSignature },
                          { label: "Principal Signature", done: !!curC.principalSig || !!(schoolSettings as any).defaultPrincipalSignature },
                        ];
                        const completed = checks.filter(c => c.done).length;
                        const pct = Math.round((completed / checks.length) * 100);
                        const barColor = pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500";
                        return (
                          <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-100">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-black uppercase text-slate-500 tracking-wide">Report Completion</p>
                              <span className={`text-sm font-black ${pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-blue-600" : "text-amber-600"}`}>
                                {completed}/{checks.length} · {pct}%
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
                              <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {checks.map(c => (
                                <span key={c.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                                  c.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                                }`}>
                                  {c.done ? <Check size={10}/> : <X size={10}/>}
                                  {c.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="p-6 space-y-6">
                        <Card className="p-5 border-2 border-slate-100 bg-slate-50">
                          <div className="flex items-center gap-2 mb-4">
                            <CalendarDays size={16} className="text-blue-600" />
                            <p className="text-sm font-black uppercase text-slate-900">Attendance Record</p>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            {([
                              ["daysOpen",    "Days Opened",  "slate"],
                              ["daysPresent", "Days Present", "emerald"],
                              ["daysAbsent",  "Days Absent",  "red"],
                            ] as const).map(([f, l, c]) => (
                              <div key={f}>
                                <label className="block text-xs font-black uppercase text-slate-400 mb-2">{l}</label>
                                <input
                                  type="number" min="0" max="365" placeholder="0"
                                  value={curC[f] || ""}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (v === "" || (+v >= 0 && +v <= 365))
                                      dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:v });
                                  }}
                                  onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                                  className={`w-full px-4 py-4 rounded-xl border-2 font-black text-center text-xl outline-none transition-all shadow-sm ${c === "emerald" ? "bg-emerald-50 border-emerald-100 focus:border-emerald-400" : c === "red" ? "bg-red-50 border-red-100 focus:border-red-400" : "bg-slate-50 border-slate-100 focus:border-slate-400"}`}
                                />
                              </div>
                            ))}
                          </div>
                          {attRate !== null && (
                            <div className={`mt-4 p-3 rounded-xl text-center font-black ${attRate >= 75 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              Attendance Rate: {attRate}% {attRate >= 75 ? "✓ Excellent" : "⚠ Needs Attention"}
                            </div>
                          )}
                        </Card>
                        <Card className="p-5 border-2 border-slate-100 bg-slate-50">
                          <div className="flex items-center gap-2 mb-4">
                            <MessageSquare size={16} className="text-blue-600" />
                            <p className="text-sm font-black uppercase text-slate-900">Remarks & Signatures</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {([
                              ["teacher",   "Class Teacher's Remark", "teacherSig",   "Teacher Signature"],
                              ["principal", "Principal's Remark",     "principalSig", "Principal's Signature"],
                            ] as const).map(([f, l, sf, sl]) => {
                              const isTeacher = sf === "teacherSig";
                              const staffJsonSig = (isTeacher && classTeacher) ? classTeacher.signature : null;
                              const linkedProfileSig = (isTeacher && classTeacher && linkedSignatures) ? linkedSignatures[classTeacher.id] : null;
                              const globalFallbackSig = isTeacher ? (schoolSettings as any).defaultTeacherSignature : (schoolSettings as any).defaultPrincipalSignature;
                              const hasAutoSig = !!staffJsonSig || !!linkedProfileSig || !!globalFallbackSig;
                              const isOverriding = curC[sf] === "OVERRIDE";
                              const hasCustomSig = !!curC[sf] && curC[sf] !== "OVERRIDE";
                              const showPad = !hasAutoSig || hasCustomSig || isOverriding;

                              const isPrincipalField = f === "principal";
                              const canEditPrincipal = isAdmin || (auth.user?.role?.toLowerCase().includes("principal") ?? false) || (auth.user?.role?.toLowerCase().includes("admin") ?? false);
                              const disableInput = isPrincipalField && !canEditPrincipal;

                              return (
                              <div key={f} className={`space-y-3 p-4 rounded-xl border ${disableInput ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-white border-slate-200'}`}>
                                <div className="flex justify-between items-center">
                                  <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{l}</label>
                                  {disableInput && <Lock size={12} className="text-slate-400" />}
                                </div>
                                <div className="flex gap-2">
                                  <Sel
                                    value={Object.keys(BUILTIN_REMARKS).find(key => BUILTIN_REMARKS[key as keyof typeof BUILTIN_REMARKS] === curC[f]) || "custom"}
                                    onChange={(e: any) => {
                                      const selected = e.target.value;
                                      if (selected === "custom") {
                                        // Keep current text
                                      } else {
                                        dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:BUILTIN_REMARKS[selected as keyof typeof BUILTIN_REMARKS] });
                                      }
                                    }}
                                    className="flex-1"
                                    disabled={disableInput}
                                  >
                                    <option value="custom">Custom Remark</option>
                                    <option value="excellent">Excellent Performance</option>
                                    <option value="veryGood">Very Good Performance</option>
                                    <option value="good">Good Performance</option>
                                    <option value="fair">Fair Performance</option>
                                    <option value="poor">Below Average</option>
                                  </Sel>
                                </div>
                                <textarea
                                  value={curC[f] || ""}
                                  onChange={e => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:e.target.value })}
                                  rows={3} placeholder={disableInput ? "Only administrators can edit this remark." : "Enter remark…"}
                                  disabled={disableInput}
                                  className={`w-full px-4 py-3 border-2 rounded-xl text-sm font-medium outline-none transition-all resize-none ${disableInput ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-50 border-slate-100 focus:border-blue-500 text-slate-900'}`}
                                />
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{sl}</label>
                                {showPad ? (
                                  <div className="relative border-2 border-dashed border-slate-100 rounded-xl overflow-hidden bg-slate-50">
                                    <SignaturePad
                                      value={hasCustomSig ? curC[sf] : ""}
                                      onChange={(val) => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:val })}
                                      onClear={() => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:"" })}
                                    />
                                    {hasAutoSig && (
                                      <button onClick={() => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:"" })} className="absolute top-2 right-2 text-[10px] font-black uppercase tracking-wide text-slate-400 hover:text-slate-600 bg-white px-2 py-1 rounded shadow-sm border border-slate-200 z-10 transition-colors">
                                        Cancel Override
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                    <div className="flex items-center gap-2 text-indigo-700">
                                      <CheckCircle size={15} />
                                      <span className="text-sm font-bold">Auto-Applied</span>
                                    </div>
                                    {isAdmin && (
                                      <button onClick={() => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:"OVERRIDE" })} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest bg-indigo-100/50 px-3 py-1.5 rounded-lg transition-colors">
                                        Override
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )})}
                          </div>
                        </Card>
                        <Card className="p-5 border-2 border-slate-100 bg-slate-50 mt-5">
                          <div className="flex items-center gap-2 mb-4">
                            <Trophy size={16} className="text-emerald-600" />
                            <p className="text-sm font-black uppercase text-slate-900">Affective & Psychomotor Domains</p>
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[...AFFECTIVE_TRAITS, ...PSYCHOMOTOR_SKILLS].map(t => (
                              <div key={t.key} className="flex gap-2 items-center justify-between text-sm border border-slate-200 rounded-lg p-2 bg-white shadow-sm">
                                <span className="text-slate-700 font-medium truncate">{t.label}</span>
                                <select
                                  className="border border-slate-200 rounded px-2 py-1 bg-slate-50 text-xs font-bold outline-none shrink-0"
                                  value={curC[t.key] || ""}
                                  onChange={e => dispatch({ type: "SET_COMMENT", studentId: activeReport.id, field: t.key, value: e.target.value })}
                                >
                                  <option value="">-</option>
                                  <option value="A">A</option>
                                  <option value="B">B</option>
                                  <option value="C">C</option>
                                  <option value="D">D</option>
                                  <option value="E">E</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        </Card>
                        <ReportCardSupabaseActions
                          activeReport={activeReport}
                          curC={curC}
                          schoolSettings={schoolSettings}
                          tenantId={tenantId}
                          canPrint={can("printReports") || isAdmin}
                          dispatch={dispatch}
                           classTeacher={classTeacher}
                          onExportExcel={async () => {
                            if (can("printReports") || isAdmin) {
                              await exportSingleStudentExcel(activeReport, curC, attRate, schoolSettings);
                              showToast("Excel exported");
                            }
                          }}
                        />
                      </div>
                    </Card>
                    <ReportSheet report={activeReport} curC={curC} attRate={attRate} schoolLogo={appState.schoolSettings?.logoUrl || null} schoolSettings={schoolSettings} classTeacher={classTeacher} linkedSignatures={linkedSignatures} />
                  </div>
                )
              )}

              {/* ATTENDANCE */}
              {activeTab === "attendance" && (can("scoreEntry") || isAdmin) && <AttendanceTab />}

              {/* TIMETABLE */}
              {activeTab === "timetable" && (
                <TimetableView
                  isAdmin={isAdmin}
                  currentActor={currentActor}
                  staffList={staffList}
                  classRolls={classRolls}
                  timetable={appState.timetable}
                  dispatch={dispatch}
                  showToast={showToast}
                  tenantId={tenantId}
                  schoolSettings={schoolSettings}
                />
              )}

              {/* INBOX */}
              {activeTab === "inbox" && (
                <InboxView
                  isAdmin={isAdmin}
                  currentActor={currentActor}
                  staffList={staffList}
                  notifications={appState.notifications}
                  dispatch={dispatch}
                  showToast={showToast}
                />
              )}

              {/* PAYROLL */}
              {activeTab === "payroll" && (isAdmin || can("payroll")) && (
                <PayrollTab isAdmin={isAdmin} currentActor={currentActor} />
              )}

              {/* FEES */}
              {activeTab === "fees" && (isAdmin || can("fees")) && (
                <FeesTab showToast={showToast} />
              )}

              {/* RESOURCES */}
              {activeTab === "resources" && isAdmin && (
                <ResourcesTab showToast={showToast} />
              )}

              {/* MY PROFILE (For PIN-authenticated teachers) */}
              {activeTab === "my_profile" && !isAdmin && (() => {
                const myStaffRecord = appState.staffList.find(s => s.id === auth.user?.id);
                if (!myStaffRecord) return <div className="p-10 text-center text-slate-500 font-bold">Profile not found.</div>;
                return (
                  <div className="space-y-5 max-w-2xl mx-auto pb-10">
                    <div>
                      <h1 className="text-2xl font-black text-slate-900 uppercase">My Profile</h1>
                      <p className="text-sm text-slate-400 mt-0.5">Manage your personal details and default signature.</p>
                    </div>
                    <Card className="p-6 space-y-5">
                      <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-xl">
                          {myStaffRecord.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-lg font-black uppercase text-slate-800">{myStaffRecord.name}</p>
                          <p className="text-sm text-slate-500 font-bold">{myStaffRecord.role}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase text-slate-700">My Signature</p>
                        <p className="text-xs text-slate-400 mt-0.5 mb-3">Draw your signature below. This will be automatically applied to report cards for classes you manage.</p>
                        <div className="border-2 border-dashed border-slate-100 rounded-xl overflow-hidden">
                          <SignaturePad 
                            value={myStaffRecord.signature || ""}
                            onChange={(val) => {
                              const updated = { ...myStaffRecord, signature: val, updatedAt: new Date().toISOString() };
                              dispatch({ type: "SAVE_STAFF", payload: updated });
                              showToast("Signature saved successfully", "success");
                            }}
                            onClear={() => {
                              const updated = { ...myStaffRecord, signature: "", updatedAt: new Date().toISOString() };
                              dispatch({ type: "SAVE_STAFF", payload: updated });
                              showToast("Signature cleared", "info");
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })()}

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
                        <h1 id="tour-staff-header" className="text-2xl font-black text-slate-900 uppercase">Staff Access</h1>
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
                  isAdmin={isAdmin}
                  showToast={showToast}
                  tenantId={tenantId}
                />
              )}

            </div>
          </main>

          {/* Mobile bottom nav */}
          <nav className="md:hidden bg-white border-t border-slate-100 flex-shrink-0 z-40">
            <div className="flex items-stretch">
              {primaryTabs.map(t => (
                <button key={t.id} id={`tour-tab-${t.id}`} onClick={() => navigate(t.id)}
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
          schoolLogo={appState.schoolSettings?.logoUrl || null}
          curC={curC}
          attRate={attRate}
          schoolSettings={schoolSettings}
          onClose={() => setShowPrint(false)}
        />
      )}
      {dlg?.type === "staffAdd" && (
        <StaffDialog mode="add" onSave={saveStaff} onClose={() => setDlg(null)} tenantId={tenantId} />
      )}
      {dlg?.type === "staffEdit" && (
        <StaffDialog mode="edit" staff={dlg.data} onSave={saveStaff} onClose={() => setDlg(null)} tenantId={tenantId} />
      )}
      {dlg?.type === "delete" && (
        <PinAuth
          title="Delete Record"
          subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`}
          headerColor="bg-red-600"
          icon={Trash2}
          confirmLabel={<><Trash2 size={13} />Delete</>}
          confirmVariant="danger"
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
                // 1. Defensively capture the sessionToken
                let sessionToken: string | undefined;
                try {
                  const rawSession = sessionStorage.getItem("schoolapp_tenant_session_v2");
                  if (rawSession) {
                    sessionToken = JSON.parse(rawSession).sessionToken;
                  }
                } catch (err) {
                  console.warn("[AuthLogger] Failed to parse tenant session from storage", err);
                }

                // 2. Fire and forget the RPC with basic error visibility
                if (sessionToken) {
                  const sId = auth.user?.id ?? "admin";
                  const sName = auth.user?.name ?? "Admin";
                  const sRole = auth.user?.role ?? "Administrator";
                  import("@/integrations/supabase/client").then(async ({ supabase }) => {
                    const { error } = await supabase.rpc("log_staff_session_event", { _session_token: sessionToken, _staff_member_id: sId, _staff_name: sName, _role: sRole, _action: "logout" });
                    if (error) console.error("Failed to log staff session event:", error);
                  });
                }

                // 3. Destroy local state (guaranteed to run even if logger fails)
                try {
                  localStorage.removeItem("greatmind_school_db_v2");
                  localStorage.removeItem("sf_fee_structure_v2");
                  localStorage.removeItem("sf_fees_v2");
                  localStorage.removeItem("saved_resources");
                  localStorage.removeItem("gm_score_drafts_v1");
                  localStorage.removeItem("app_tour_completed");
                  localStorage.removeItem("gm_last_tenant_id");
                } catch (e) {}
                setAuth({ loggedIn:false, user:null });
                setLoginId(""); setLoginPass(""); setShowLogout(false);
                setActiveTab("dashboard"); setActiveReport(null); setMenuOpen(false);
                
                if (onTenantSignOut) onTenantSignOut();
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











