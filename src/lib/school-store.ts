import { createContext, useContext } from "react";
import { uid } from "./school-helpers";

// ─── Types ────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin: string;
  status: "active" | "restricted" | "revoked";
  assignedClasses: string[];
  permissions: Record<string, boolean>;
  signature?: string; // Base64 encoded signature
  createdAt: string;
  updatedAt: string;
}

export interface ScoreEntry {
  id: string;
  studentName: string;
  studentClass: string;
  subject: string;
  ca1: number;
  ca2: number;
  ca3: number;
  exam: number;
  total: number;
  term: string;
  session: string;
  enteredBy: string;
  createdAt: string;
  restoredAt?: string;
}

export interface AttendanceRecord {
  id: string;
  studentName: string;
  studentClass: string;
  date: string;
  status: string;
  note?: string;
}

export interface LogEntry {
  id: string;
  action: string;
  student: string;
  subject: string;
  detail: string;
  ts: string;
}

export interface ActivityLog {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  event: "login" | "logout";
  timestamp: string;
  ip?: string;
  device?: string;
}

export interface EmailJSConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
}

export interface SchoolSettings {
  name: string;
  motto: string;
  session: string;
  term: string;
  resumptionDate: string;
  emailjs?: EmailJSConfig;
}

export interface AppState {
  entries: ScoreEntry[];
  bin: (ScoreEntry & { deletedAt: string })[];
  logs: LogEntry[];
  activityLogs: ActivityLog[];
  comments: Record<string, Record<string, string>>;
  attendance: AttendanceRecord[];
  classRolls: Record<string, { id: string; name: string }[]>;
  staffList: StaffMember[];
  schoolSettings: SchoolSettings;
  adminPin: string;
}

// ─── Initial State ────────────────────────────────────────────
export const initialState: AppState = {
  entries: [],
  bin: [],
  logs: [],
  activityLogs: [],
  comments: {},
  attendance: [],
  classRolls: {},
  staffList: [
    {
      id: "s1",
      name: "Mrs. Amaka Obi",
      role: "Class Teacher",
      pin: "5678",
      status: "active",
      assignedClasses: ["Primary 3", "Primary 4"],
      permissions: { scoreEntry: true, viewReports: true, printReports: true, manageRecords: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "s2",
      name: "Mr. Chidi Eze",
      role: "Subject Teacher",
      pin: "9012",
      status: "active",
      assignedClasses: ["JSS 1", "JSS 2", "JSS 3"],
      permissions: { scoreEntry: true, viewReports: true, printReports: false, manageRecords: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  schoolSettings: {
    name: "Greatmind Academy",
    motto: "Excellence in every child",
    session: "2024/2025",
    term: "First Term",
    resumptionDate: "January 8th, 2025",
  },
  adminPin: "1234",
};

// ─── Actions ──────────────────────────────────────────────────
export type AppAction =
  | { type: "HYDRATE"; payload: Partial<AppState> }
  | { type: "ADD_ENTRY"; payload: ScoreEntry }
  | { type: "DELETE_ENTRY"; id: string }
  | { type: "RESTORE_ENTRY"; id: string }
  | { type: "SAVE_STAFF"; payload: StaffMember }
  | { type: "SET_STAFF_STATUS"; id: string; status: "active" | "restricted" | "revoked" }
  | { type: "SAVE_ATTENDANCE"; payload: AttendanceRecord }
  | { type: "BULK_SAVE_ATTENDANCE"; payload: AttendanceRecord[] }
  | { type: "DELETE_ATTENDANCE"; id: string }
  | { type: "SAVE_CLASS_ROLL"; className: string; students: { id: string; name: string }[] }
  | { type: "DELETE_ROLL_STUDENT"; className: string; studentId: string }
  | { type: "SET_COMMENT"; studentId: string; field: string; value: string }
  | { type: "SET_SCHOOL_SETTINGS"; payload: Partial<SchoolSettings> }
  | { type: "SET_ADMIN_PIN"; pin: string }
  | { type: "TRACK_LOGIN"; payload: Omit<ActivityLog, "id"> }
  | { type: "TRACK_LOGOUT"; payload: Omit<ActivityLog, "id"> };

function mkLog(action: string, student: string, subject: string, detail = ""): LogEntry {
  return { id: uid(), action, student, subject, detail, ts: new Date().toISOString() };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload };
    case "ADD_ENTRY":
      return {
        ...state,
        entries: [...state.entries, action.payload],
        logs: [mkLog("Added", action.payload.studentName, action.payload.subject, `Total: ${action.payload.total}`), ...state.logs].slice(0, 100),
      };
    case "DELETE_ENTRY": {
      const e = state.entries.find((x) => x.id === action.id);
      if (!e) return state;
      return {
        ...state,
        entries: state.entries.filter((x) => x.id !== action.id),
        bin: [{ ...e, deletedAt: new Date().toISOString() }, ...state.bin],
        logs: [mkLog("Deleted", e.studentName, e.subject, `Score: ${e.total}`), ...state.logs].slice(0, 100),
      };
    }
    case "RESTORE_ENTRY": {
      const e = state.bin.find((x) => x.id === action.id);
      if (!e) return state;
      const { deletedAt: _, ...r } = e;
      return {
        ...state,
        bin: state.bin.filter((x) => x.id !== action.id),
        entries: [...state.entries, { ...r, restoredAt: new Date().toISOString() }],
        logs: [mkLog("Restored", e.studentName, e.subject), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_STAFF": {
      const exists = state.staffList.find((s) => s.id === action.payload.id);
      return {
        ...state,
        staffList: exists ? state.staffList.map((s) => (s.id === action.payload.id ? action.payload : s)) : [...state.staffList, action.payload],
        logs: [mkLog(exists ? "Updated" : "Staff Added", action.payload.name, action.payload.role), ...state.logs].slice(0, 100),
      };
    }
    case "SET_STAFF_STATUS": {
      const s = state.staffList.find((x) => x.id === action.id);
      if (!s) return state;
      return {
        ...state,
        staffList: state.staffList.map((x) => (x.id === action.id ? { ...x, status: action.status, updatedAt: new Date().toISOString() } : x)),
        logs: [mkLog(action.status === "revoked" ? "Revoked" : "Restored", s.name, s.role), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_ATTENDANCE": {
      const idx = state.attendance.findIndex((a) => a.id === action.payload.id);
      return {
        ...state,
        attendance: idx >= 0 ? state.attendance.map((a, i) => (i === idx ? action.payload : a)) : [...state.attendance, action.payload],
      };
    }
    case "BULK_SAVE_ATTENDANCE":
      return {
        ...state,
        attendance: [
          ...state.attendance.filter((a) => !action.payload.find((p) => p.studentName === a.studentName && p.studentClass === a.studentClass && p.date === a.date)),
          ...action.payload,
        ],
      };
    case "DELETE_ATTENDANCE":
      return { ...state, attendance: state.attendance.filter((a) => a.id !== action.id) };
    case "SAVE_CLASS_ROLL":
      return { ...state, classRolls: { ...state.classRolls, [action.className]: action.students } };
    case "DELETE_ROLL_STUDENT": {
      const roll = state.classRolls[action.className] || [];
      return { ...state, classRolls: { ...state.classRolls, [action.className]: roll.filter((s) => s.id !== action.studentId) } };
    }
    case "SET_COMMENT":
      return { ...state, comments: { ...state.comments, [action.studentId]: { ...(state.comments[action.studentId] || {}), [action.field]: action.value } } };
    case "SET_SCHOOL_SETTINGS":
      return { ...state, schoolSettings: { ...state.schoolSettings, ...action.payload } };
    case "SET_ADMIN_PIN":
      return { ...state, adminPin: action.pin };
    case "TRACK_LOGIN":
    case "TRACK_LOGOUT":
      return {
        ...state,
        activityLogs: [{ id: uid(), ...action.payload }, ...state.activityLogs].slice(0, 500),
      };
    default:
      return state;
  }
}

// ─── Persistence ──────────────────────────────────────────────
const DB_KEY = "schoolapp_v1";

export function loadFromStorage(): AppState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { ...initialState, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return initialState;
}

export function saveToStorage(state: AppState) {
  try {
    const { schoolSettings, staffList, entries, bin, logs, activityLogs, comments, attendance, classRolls, adminPin } = state;
    localStorage.setItem(DB_KEY, JSON.stringify({ schoolSettings, staffList, entries, bin, logs, activityLogs, comments, attendance, classRolls, adminPin }));
  } catch (e) {
    console.warn("Save failed", e);
  }
}

// ─── Context ──────────────────────────────────────────────────
export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  showToast: (msg: string, type?: "success" | "error" | "warning") => void;
}

export const AppCtx = createContext<AppContextType | null>(null);
export const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be inside AppCtx.Provider");
  return ctx;
};
