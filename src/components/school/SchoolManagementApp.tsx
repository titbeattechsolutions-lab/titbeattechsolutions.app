import { useState, useMemo, useRef, useCallback, memo, useReducer, createContext, useContext, useEffect } from "react";
import {
  GraduationCap, FileText, Printer, PlusCircle,
  Check, X, Settings, Save, LogOut, LayoutDashboard,
  Trash2, Search, PenTool, Upload, RotateCcw,
  AlertTriangle, Clock, ShieldAlert, Users, UserPlus,
  UserX, UserCheck, Eye, EyeOff, KeyRound, Shield,
  Menu, BookOpen, MoreVertical, ChevronRight,
  CalendarDays, ClipboardList, Database, Edit2,
  Download, FileSpreadsheet, UploadCloud, HardDrive,
  Activity, UserCog
} from "lucide-react";
import { exportToPDF, exportToExcel } from "@/lib/report-export";
import { parseCSV, readFileAsText } from "@/lib/csv-import";
import { hashPin, verifyPin } from "@/lib/crypto-helpers";
import emailjs from "@emailjs/browser";
import { exportAttendanceCSV, exportAttendanceExcel, exportClassResultsExcel, exportBulkPDFs, exportBackup } from "@/lib/data-export";
import { parseScoresCSV, validateBackup, readFileAsText as readFileText } from "@/lib/data-import";

// ─── Constants ────────────────────────────────────────────────────────────────
const CURRICULUM: Record<string, { classes: string[]; subjects: string[] }> = {
  "Early Years":      { classes:["Creche","Pre-Nursery","Nursery 1","Nursery 2"], subjects:["Numeracy","Literacy","Health Habits","Social Norms","Basic Science","CRS","IRS","Rhymes & Poem","Phonics","Creative Arts","Physical Development"] },
  "Lower Primary":    { classes:["Primary 1","Primary 2","Primary 3"],           subjects:["Mathematics","English Studies","Basic Science & Tech","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","Yoruba/Igbo/Hausa"] },
  "Upper Primary":    { classes:["Primary 4","Primary 5","Primary 6"],           subjects:["Mathematics","English Studies","Basic Science","ICT","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","French","Yoruba/Igbo/Hausa"] },
  "Junior Secondary": { classes:["JSS 1","JSS 2","JSS 3"],                       subjects:["Mathematics","English Language","Basic Science","Basic Technology","Social Studies","Civic Education","Agricultural Science","Home Economics","Business Studies","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","French","Nigerian Language"] },
  "Senior Secondary": { classes:["SS 1","SS 2","SS 3"],                          subjects:["Mathematics","English Language","Civic Education","Biology","Economics","Physics","Chemistry","Further Mathematics","Agricultural Science","Geography","Government","Literature-in-English","CRS","IRS","Financial Accounting","Commerce","Data Processing","Marketing","Technical Drawing"] },
};
const ALL_CLASSES = Object.values(CURRICULUM).flatMap(c => c.classes);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const todayStr = () => new Date().toISOString().slice(0,10);
const getGrade = (s: number) => {
  if(s>=75) return{grade:"A1",remark:"Excellent",color:"#059669",bg:"#d1fae5"};
  if(s>=70) return{grade:"B2",remark:"Very Good",color:"#10b981",bg:"#d1fae5"};
  if(s>=65) return{grade:"B3",remark:"Good",color:"#2563eb",bg:"#dbeafe"};
  if(s>=60) return{grade:"C4",remark:"Credit",color:"#3b82f6",bg:"#dbeafe"};
  if(s>=55) return{grade:"C5",remark:"Credit",color:"#6366f1",bg:"#e0e7ff"};
  if(s>=50) return{grade:"C6",remark:"Credit",color:"#8b5cf6",bg:"#ede9fe"};
  if(s>=45) return{grade:"D7",remark:"Pass",color:"#d97706",bg:"#fef3c7"};
  if(s>=40) return{grade:"E8",remark:"Pass",color:"#f59e0b",bg:"#fef3c7"};
  return{grade:"F9",remark:"Fail",color:"#dc2626",bg:"#fee2e2"};
};
const getOrdinal = (n: number) => { const s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
const fmtTs = (iso: string) => { const d=new Date(iso); return{ date:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}), time:d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) }; };
const fmtDate = (iso: string) => new Date(iso+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});

// ─── App State ────────────────────────────────────────────────────────────────
const initialState: any = {
  entries:[], bin:[], logs:[], comments:{},
  attendance:[], classRolls:{},
  staffList:[
    {id:"s1",name:"Mrs. Amaka Obi",role:"Class Teacher",pin:"5678",status:"active",assignedClasses:["Primary 3","Primary 4"],permissions:{scoreEntry:true,viewReports:true,printReports:true,manageRecords:false},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
    {id:"s2",name:"Mr. Chidi Eze",role:"Subject Teacher",pin:"9012",status:"active",assignedClasses:["JSS 1","JSS 2","JSS 3"],permissions:{scoreEntry:true,viewReports:true,printReports:false,manageRecords:false},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
  ],
  schoolSettings:{name:"Greatmind Academy",motto:"Excellence in every child",session:"2024/2025",term:"First Term",resumptionDate:"January 8th, 2025"},
};

// Module-level actor tracker — set by the app shell after login so reducer
// can stamp every log entry with who performed the action.
const _actor: { id: string; name: string; role: "admin" | "staff" } = { id: "system", name: "System", role: "admin" };
const setLogActor = (a: { id: string; name: string; role: "admin" | "staff" }) => { _actor.id = a.id; _actor.name = a.name; _actor.role = a.role; };
const mkLog = (action: string, student: string, subject: string, detail="") => ({
  id: uid(), action, student, subject, detail,
  ts: new Date().toISOString(),
  actorId: _actor.id, actorName: _actor.name, actorRole: _actor.role,
});

function appReducer(state: any, action: any) {
  switch(action.type) {
    case "HYDRATE": return {...state,...action.payload};
    case "ADD_ENTRY": return {...state,entries:[...state.entries,action.payload],logs:[mkLog("Added",action.payload.studentName,action.payload.subject,`Total: ${action.payload.total}`),...state.logs].slice(0,100)};
    case "DELETE_ENTRY": {const e=state.entries.find((x:any)=>x.id===action.id);if(!e)return state;return{...state,entries:state.entries.filter((x:any)=>x.id!==action.id),bin:[{...e,deletedAt:new Date().toISOString()},...state.bin],logs:[mkLog("Deleted",e.studentName,e.subject,`Score: ${e.total}`),...state.logs].slice(0,100)};}
    case "RESTORE_ENTRY": {const e=state.bin.find((x:any)=>x.id===action.id);if(!e)return state;const{deletedAt:_,...r}=e;return{...state,bin:state.bin.filter((x:any)=>x.id!==action.id),entries:[...state.entries,{...r,restoredAt:new Date().toISOString()}],logs:[mkLog("Restored",e.studentName,e.subject),...state.logs].slice(0,100)};}
    case "SAVE_STAFF": {const exists=state.staffList.find((s:any)=>s.id===action.payload.id);return{...state,staffList:exists?state.staffList.map((s:any)=>s.id===action.payload.id?action.payload:s):[...state.staffList,action.payload],logs:[mkLog(exists?"Updated":"Staff Added",action.payload.name,action.payload.role),...state.logs].slice(0,100)};}
    case "SET_STAFF_STATUS": {const s=state.staffList.find((x:any)=>x.id===action.id);if(!s)return state;return{...state,staffList:state.staffList.map((x:any)=>x.id===action.id?{...x,status:action.status,updatedAt:new Date().toISOString()}:x),logs:[mkLog(action.status==="revoked"?"Revoked":"Restored",s.name,s.role),...state.logs].slice(0,100)};}
    case "SAVE_ATTENDANCE": {const idx=state.attendance.findIndex((a:any)=>a.id===action.payload.id);return{...state,attendance:idx>=0?state.attendance.map((a:any,i:number)=>i===idx?action.payload:a):[...state.attendance,action.payload]};}
    case "BULK_SAVE_ATTENDANCE": return{...state,attendance:[...state.attendance.filter((a:any)=>!action.payload.find((p:any)=>p.studentName===a.studentName&&p.studentClass===a.studentClass&&p.date===a.date)),...action.payload]};
    case "DELETE_ATTENDANCE": return{...state,attendance:state.attendance.filter((a:any)=>a.id!==action.id)};
    case "SAVE_CLASS_ROLL": return{...state,classRolls:{...state.classRolls,[action.className]:action.students}};
    case "DELETE_ROLL_STUDENT": {const roll=state.classRolls[action.className]||[];return{...state,classRolls:{...state.classRolls,[action.className]:roll.filter((s:any)=>s.id!==action.studentId)}};}
    case "SET_COMMENT": return{...state,comments:{...state.comments,[action.studentId]:{...(state.comments[action.studentId]||{}),[action.field]:action.value}}};
    case "SET_SCHOOL_SETTINGS": return{...state,schoolSettings:{...state.schoolSettings,...action.payload}};
    default: return state;
  }
}

// ─── Context / Toast ──────────────────────────────────────────────────────────
const AppCtx = createContext<any>(null);
const useApp = () => useContext(AppCtx);

function useToastHook() {
  const [toast,setToast] = useState<any>(null);
  const t = useRef<any>(null);
  const show = useCallback((msg: string, type="success")=>{ clearTimeout(t.current); setToast({msg,type,id:uid()}); t.current=setTimeout(()=>setToast(null),3000); },[]);
  useEffect(()=>()=>clearTimeout(t.current),[]);
  return {toast,showToast:show};
}

// ─── Persistent DB (localStorage) ─────────────────────────────────────────────
const DB_KEY = "schoolapp_v1";
function loadDB() {
  try { const r=localStorage.getItem(DB_KEY); if(r) return {...initialState,...JSON.parse(r)}; } catch{}
  return initialState;
}
function saveDB(state: any, pin: string) {
  try {
    const {schoolSettings,staffList,entries,bin,logs,comments,attendance,classRolls}=state;
    localStorage.setItem(DB_KEY,JSON.stringify({schoolSettings,staffList,entries,bin,logs,comments,attendance,classRolls,adminPin:pin}));
  } catch(e){console.warn("DB save failed",e);}
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const Pill = ({children,color="slate"}: {children: React.ReactNode; color?: string}) => {
  const m: Record<string,string>={slate:"bg-slate-100 text-slate-600",blue:"bg-blue-100 text-blue-700",green:"bg-emerald-100 text-emerald-700",amber:"bg-amber-100 text-amber-700",red:"bg-red-100 text-red-700",indigo:"bg-indigo-100 text-indigo-700"};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black uppercase ${m[color]||m.slate}`}>{children}</span>;
};
const StatusPill = ({status}: {status: string}) => { const m: Record<string,{l:string;c:string}>={active:{l:"Active",c:"green"},restricted:{l:"Restricted",c:"amber"},revoked:{l:"Revoked",c:"red"}}; const s=m[status]||m.active; return <Pill color={s.c}>{s.l}</Pill>; };
const SchoolLogo = ({logoUrl,size="md",className=""}: {logoUrl?: string|null; size?: string; className?: string}) => {
  const sz: Record<string,string>={lg:"w-16 h-16",sm:"w-8 h-8",xs:"w-6 h-6",md:"w-10 h-10"};
  const ic: Record<string,number>={lg:32,sm:18,xs:14,md:22};
  if(logoUrl) return <img src={logoUrl} alt="Logo" className={`${sz[size]||sz.md} rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0 ${className}`}/>;
  return <div className={`${sz[size]||sz.md} bg-primary rounded-xl flex items-center justify-center text-primary-foreground flex-shrink-0 ${className}`}><GraduationCap size={ic[size]||22}/></div>;
};
const Field = ({label,error,children}: {label?: string; error?: string; children: React.ReactNode}) => <div className="space-y-1.5">{label&&<label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label>}{children}{error&&<p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={11}/>{error}</p>}</div>;
const Inp = ({label,error,className="",...p}: any) => <Field label={label} error={error}><input {...p} className={`w-full px-4 py-3 bg-slate-50 border-2 ${error?"border-red-300":"border-slate-100"} rounded-xl font-semibold text-sm text-slate-900 focus:border-primary focus:bg-white outline-none transition-all placeholder:text-slate-300 ${className}`}/></Field>;
const Sel = ({label,children,className="",...p}: any) => <Field label={label}><select {...p} className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-primary focus:bg-white outline-none transition-all ${className}`}>{children}</select></Field>;
const Btn = ({children,variant="primary",size="md",className="",loading=false,...p}: any) => {
  const base="inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed";
  const szMap: Record<string,string>={sm:"text-xs px-3 py-2",md:"text-xs px-4 py-3",lg:"text-sm px-6 py-4"};
  const v: Record<string,string>={primary:"bg-primary text-primary-foreground hover:opacity-90 shadow-sm",danger:"bg-destructive text-destructive-foreground hover:opacity-90",success:"bg-accent text-accent-foreground hover:opacity-90",ghost:"bg-slate-100 text-slate-700 hover:bg-slate-200",outline:"bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300"};
  return <button className={`${base} ${szMap[size]||szMap.md} ${v[variant]||v.primary} ${className}`} disabled={loading||p.disabled} {...p}>{loading?<span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"/>:children}</button>;
};
const Card = memo(({children,className=""}: {children: React.ReactNode; className?: string}) => <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>);
const EmptyState = ({icon:Icon,title,subtitle,action}: any) => <Card className="p-12 text-center"><Icon size={40} className="mx-auto text-slate-200 mb-3"/><p className="font-bold text-slate-400">{title}</p>{subtitle&&<p className="text-xs text-slate-300 mt-1">{subtitle}</p>}{action&&<div className="mt-4">{action}</div>}</Card>;

// ─── Sheet / Modal ────────────────────────────────────────────────────────────
const Sheet = ({children,maxW="max-w-md",onClose}: any) => (
  <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
       style={{background:"rgba(15,23,42,0.65)"}}
       onClick={(e: any)=>{if(e.target===e.currentTarget)onClose?.();}}>
    <div className={`bg-white w-full sm:${maxW} rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up`}
         style={{maxHeight:"92dvh"}}>
      {children}
    </div>
  </div>
);

const MHead = ({icon:Icon,title,subtitle,color="bg-primary",onClose}: any) => (
  <div className={`${color} px-5 py-4 flex items-center justify-between flex-shrink-0`}>
    <div className="flex items-center gap-3">
      {Icon&&<div className="bg-white/20 p-2 rounded-xl"><Icon size={18} className="text-white"/></div>}
      <div>
        <p className="text-white font-black uppercase tracking-widest text-xs">{title}</p>
        {subtitle&&<p className="text-white/60 text-xs mt-0.5 truncate max-w-xs">{subtitle}</p>}
      </div>
    </div>
    {onClose&&<button onClick={onClose} className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all ml-2 flex-shrink-0"><X size={18}/></button>}
  </div>
);

// ─── PIN Auth ─────────────────────────────────────────────────────────────────
const PinAuth = ({title,subtitle,headerColor="bg-primary",icon:Icon,children,confirmLabel,confirmVariant="danger",correctPin,onConfirm,onCancel}: any) => {
  const [pin,setPin]=useState(""); const [err,setErr]=useState(""); const [show,setShow]=useState(false); const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const verify=async()=>{ const match=await verifyPin(pin,correctPin); if(match){onConfirm();}else{setErr("Incorrect PIN — access denied.");setPin("");ref.current?.focus();} };
  return (
    <Sheet onClose={onCancel}>
      <MHead icon={Icon} title={title} subtitle={subtitle} color={headerColor} onClose={onCancel}/>
      <div className="p-5 space-y-4 overflow-y-auto">
        {children}
        <Field label="Admin PIN" error={err}>
          <div className="relative">
            <input ref={ref} type={show?"text":"password"} value={pin} maxLength={8} placeholder="••••••"
              onChange={(e: any)=>{setPin(e.target.value.replace(/\D/g,""));setErr("");}}
              onKeyDown={(e: any)=>e.key==="Enter"&&verify()}
              className={`w-full px-4 py-3 bg-slate-50 border-2 ${err?"border-red-300":"border-slate-100"} rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-primary outline-none transition-all`}/>
            <button type="button" onClick={()=>setShow(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>
          </div>
        </Field>
        <p className="text-xs text-slate-400 text-center">Default PIN: <span className="font-black text-slate-600">1234</span></p>
      </div>
      <div className="px-5 pb-5 grid grid-cols-2 gap-3 flex-shrink-0">
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant={confirmVariant} onClick={verify}>{confirmLabel}</Btn>
      </div>
    </Sheet>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = memo(({toast}: any) => {
  const s: Record<string,string>={success:"bg-slate-900 text-white",error:"bg-destructive text-white",warning:"bg-amber-500 text-white"};
  const ic: Record<string,React.ReactNode>={success:<Check size={12}/>,error:<X size={12}/>,warning:<AlertTriangle size={12}/>};
  const ib: Record<string,string>={success:"bg-emerald-500",error:"bg-white/20",warning:"bg-white/20"};
  return <div className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[300] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest animate-slide-up ${s[toast.type]||s.success}`}><div className={`p-1.5 rounded-full ${ib[toast.type]||ib.success}`}>{ic[toast.type]||ic.success}</div><span>{toast.msg}</span></div>;
});

// ─── Staff Dialog ─────────────────────────────────────────────────────────────
const DIALOG_STEPS = ["Identity","Status","Permissions","Classes"];
const blankStaff = () => ({name:"",role:"Teacher",pin:"",status:"active",assignedClasses:[] as string[],permissions:{scoreEntry:true,viewReports:true,printReports:false,manageRecords:false}});

const StaffDialog = memo(({staff,mode,onSave,onClose}: any) => {
  const original = useRef(staff?{...staff}:blankStaff());
  const [form,setForm] = useState<any>(()=>staff?{...staff}:blankStaff());
  const [errors,setErrors] = useState<any>({});
  const [showPin,setShowPin] = useState(false);
  const [step,setStep] = useState(0);
  const [confirmClose,setConfirmClose] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const secRefs = useRef<any>({});

  const isDirty = useMemo(()=>JSON.stringify(form)!==JSON.stringify(original.current),[form]);

  const setF = useCallback((key: string, val: any)=>{ setForm((f: any)=>({...f,[key]:val})); setErrors((e: any)=>({...e,[key]:undefined})); },[]);
  const toggleClass = useCallback((cls: string)=>setForm((f: any)=>({...f,assignedClasses:f.assignedClasses.includes(cls)?f.assignedClasses.filter((c: string)=>c!==cls):[...f.assignedClasses,cls]})),[]);
  const togglePerm  = useCallback((k: string)=>setForm((f: any)=>({...f,permissions:{...f.permissions,[k]:!f.permissions[k]}})),[]);

  const validate = () => {
    const e: any={};
    if(!form.name.trim()) e.name="Name required";
    if(mode==="add"&&form.pin.length<4) e.pin="Minimum 4 digits";
    if(mode==="edit"&&form.pin.length>0&&form.pin.length<4) e.pin="Minimum 4 digits";
    setErrors(e); return !Object.keys(e).length;
  };

  const handleSave = () => { if(!validate()) return; onSave({...form,id:staff?.id||uid(),createdAt:staff?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}); };
  const handleClose = () => { if(isDirty) setConfirmClose(true); else onClose(); };

  const onScroll = () => {
    if(!scrollRef.current) return;
    const top = scrollRef.current.scrollTop + 60;
    let active = 0;
    DIALOG_STEPS.forEach((_,i)=>{ const el=secRefs.current[i]; if(el&&el.offsetTop<=top) active=i; });
    setStep(active);
  };

  const jumpTo = (idx: number) => {
    setStep(idx);
    const el = secRefs.current[idx];
    if(el&&scrollRef.current) scrollRef.current.scrollTo({top:el.offsetTop-12,behavior:"smooth"});
  };

  const avatarBg = form.status==="active"?"bg-indigo-500":form.status==="restricted"?"bg-amber-500":"bg-slate-400";
  const initials  = form.name.trim()?form.name.trim().split(" ").map((w: string)=>w[0]).join("").slice(0,2).toUpperCase():"?";

  return (
    <>
      <Sheet maxW="max-w-2xl" onClose={handleClose}>
        <MHead icon={mode==="add"?UserPlus:KeyRound}
          title={mode==="add"?"Add New Staff":`Edit — ${staff?.name||""}`}
          subtitle={mode==="add"?"Complete all sections":"Modify access & permissions"}
          color={mode==="add"?"bg-primary":"bg-indigo-600"} onClose={handleClose}/>

        {isDirty&&<div className="bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-center gap-2 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>
          <p className="text-xs font-black uppercase text-amber-700">Unsaved changes</p>
        </div>}

        <div className="border-b border-slate-100 flex-shrink-0 overflow-x-auto" style={{scrollbarWidth:'none'}}>
          <div className="flex min-w-max px-3 pt-2 gap-1">
            {DIALOG_STEPS.map((s,i)=>(
              <button key={i} onClick={()=>jumpTo(i)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wide border-b-2 transition-all whitespace-nowrap ${step===i?"border-primary text-primary":"border-transparent text-slate-500 hover:text-slate-700"}`}>
                <span>{["👤","🔑","🛡️","📚"][i]}</span>{s}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto" style={{WebkitOverflowScrolling:"touch" as any,overscrollBehavior:"contain"}}>
          <div className="p-5 space-y-8">
            {/* IDENTITY */}
            <section ref={(el: any)=>secRefs.current[0]=el} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span>👤</span><p className="text-xs font-black uppercase text-slate-700 tracking-wide">Identity</p>
              </div>
              <Inp label="Full Name" value={form.name} onChange={(e: any)=>setF("name",e.target.value)} placeholder="e.g. Mrs. Amaka Obi" error={errors.name}/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Sel label="Role" value={form.role} onChange={(e: any)=>setF("role",e.target.value)}>
                  {ROLES.map(r=><option key={r}>{r}</option>)}
                </Sel>
                <Field label={mode==="add"?"Access PIN *":"New PIN (optional)"} error={errors.pin}>
                  <div className="relative">
                    <input type={showPin?"text":"password"} value={form.pin} maxLength={8}
                      placeholder={mode==="add"?"4–8 digits":"Leave blank to keep"}
                      onChange={(e: any)=>setF("pin",e.target.value.replace(/\D/g,"").slice(0,8))}
                      className={`w-full px-4 py-3 bg-slate-50 border-2 ${errors.pin?"border-red-300":"border-slate-100"} rounded-xl font-black text-center tracking-widest text-lg focus:border-primary outline-none transition-all pr-10`}/>
                    <button type="button" onClick={()=>setShowPin(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPin?<EyeOff size={14}/>:<Eye size={14}/>}</button>
                  </div>
                  {form.pin.length>=4&&<p className="text-xs text-emerald-600 font-bold mt-1">✓ PIN set — {form.pin.length} digits</p>}
                </Field>
              </div>
            </section>

            {/* STATUS */}
            <section ref={(el: any)=>secRefs.current[1]=el} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span>🔑</span><p className="text-xs font-black uppercase text-slate-700 tracking-wide">Account Status</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([["active","✓ Active","border-emerald-400 bg-emerald-50 text-emerald-700"],
                  ["restricted","⚠ Restricted","border-amber-400 bg-amber-50 text-amber-700"],
                  ["revoked","✗ Revoked","border-red-400 bg-red-50 text-red-700"]] as const).map(([v,l,ac])=>(
                  <button key={v} type="button" onClick={()=>setF("status",v)}
                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-wide border-2 transition-all ${form.status===v?ac:"border-slate-200 bg-white text-slate-400 hover:border-slate-300"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </section>

            {/* PERMISSIONS */}
            <section ref={(el: any)=>secRefs.current[2]=el} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span>🛡️</span><p className="text-xs font-black uppercase text-slate-700 tracking-wide">Feature Permissions</p>
              </div>
              {PERMS_META.map(({key,label,desc})=>(
                <button key={key} type="button" onClick={()=>togglePerm(key)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${form.permissions[key]?"border-blue-200 bg-blue-50":"border-slate-100 bg-slate-50 opacity-75 hover:opacity-100"}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.permissions[key]?"bg-primary border-primary":"bg-white border-slate-300"}`}>
                    {form.permissions[key]&&<Check size={11} className="text-white"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 ${form.permissions[key]?"bg-blue-100 text-blue-700":"bg-slate-100 text-slate-400"}`}>
                    {form.permissions[key]?"On":"Off"}
                  </span>
                </button>
              ))}
            </section>

            {/* CLASSES */}
            <section ref={(el: any)=>secRefs.current[3]=el} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span>📚</span>
                  <p className="text-xs font-black uppercase text-slate-700 tracking-wide">Assigned Classes</p>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{form.assignedClasses.length||"All"}</span>
                </div>
                <button type="button"
                  onClick={()=>setF("assignedClasses",form.assignedClasses.length===ALL_CLASSES.length?[]:ALL_CLASSES.slice())}
                  className="text-xs font-black uppercase text-blue-500 hover:text-blue-700 transition-colors flex-shrink-0">
                  {form.assignedClasses.length===ALL_CLASSES.length?"Clear All":"Select All"}
                </button>
              </div>
              {Object.entries(CURRICULUM).map(([cat,data])=>(
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-wide">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.classes.map(cls=>{
                      const on = form.assignedClasses.includes(cls);
                      return (
                        <button key={cls} type="button" onClick={()=>toggleClass(cls)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase transition-colors select-none ${on?"bg-primary text-primary-foreground":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {on&&<Check size={10}/>}{cls}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {form.assignedClasses.length===0&&(
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertTriangle size={13} className="text-amber-500 flex-shrink-0"/>
                  <p className="text-xs text-amber-700 font-bold">No classes selected — staff sees all classes</p>
                </div>
              )}
              <div style={{height:8}}/>
            </section>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs font-medium hidden sm:block">
            {isDirty?<span className="text-amber-600 font-black flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>Unsaved changes</span>
              :mode==="edit"?<span className="text-emerald-600 font-black">✓ No changes</span>
              :<span className="text-slate-400">Fill all sections to create account</span>}
          </div>
          <div className="flex gap-2 ml-auto w-full sm:w-auto">
            <Btn variant="ghost" onClick={handleClose} className="flex-1 sm:flex-none">Cancel</Btn>
            <Btn variant="primary" onClick={handleSave} disabled={!isDirty&&mode==="edit"} className="flex-1 sm:flex-none">
              <Save size={14}/>{mode==="add"?"Create Account":"Save Changes"}
            </Btn>
          </div>
        </div>
      </Sheet>

      {confirmClose&&(
        <Sheet maxW="max-w-sm" onClose={()=>setConfirmClose(false)}>
          <MHead icon={AlertTriangle} title="Discard Changes?" subtitle="Your changes will be lost" color="bg-amber-500" onClose={()=>setConfirmClose(false)}/>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-600">Are you sure you want to close without saving?</p>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" onClick={()=>setConfirmClose(false)}>Keep Editing</Btn>
              <Btn variant="danger" onClick={()=>{setConfirmClose(false);onClose();}}>Discard</Btn>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
});

// ─── Staff Card ───────────────────────────────────────────────────────────────
const StaffCard = memo(({s,onEdit,onRevoke,onRestore,onClick}: any) => {
  const ab=s.status==="active"?"bg-indigo-500":s.status==="restricted"?"bg-amber-500":"bg-slate-400";
  const initials=s.name.split(" ").map((w: string)=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <Card className={`p-4 flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all ${s.status==="revoked"?"opacity-55":""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${ab}`} onClick={onClick}>
        <span className="text-white font-black text-sm">{initials}</span>
      </div>
      <div className="flex-1 min-w-0" onClick={onClick}>
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="font-black text-slate-900 uppercase text-sm truncate">{s.name}</p>
          <StatusPill status={s.status}/>
        </div>
        <p className="text-xs text-slate-500 font-bold">{s.role}</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PERMS_META.filter(p=>s.permissions[p.key]).map(p=><Pill key={p.key} color="blue">{p.label.split(" ")[0]}</Pill>)}
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-300 flex-shrink-0"/>
    </Card>
  );
});

// ─── Staff Tab ────────────────────────────────────────────────────────────────
const STAFF_FILTERS = ["All","Active","Restricted","Revoked"];

const StaffTab = memo(({dispatch,showToast,setDlg,staffList}: any) => {
  const [filter,setFilter] = useState("All");
  const [search,setSearch] = useState("");
  const [detail,setDetail] = useState<any>(null);

  useEffect(()=>{ if(detail) setDetail(staffList.find((s: any)=>s.id===detail.id)||null); },[staffList,detail?.id]);

  const counts = useMemo(()=>({
    All:staffList.length,
    Active:staffList.filter((s: any)=>s.status==="active").length,
    Restricted:staffList.filter((s: any)=>s.status==="restricted").length,
    Revoked:staffList.filter((s: any)=>s.status==="revoked").length,
  }),[staffList]);

  const filtered = useMemo(()=>staffList.filter((s: any)=>{
    const mf = filter==="All"||s.status===filter.toLowerCase();
    const ms = !search||s.name.toLowerCase().includes(search.toLowerCase())||s.role.toLowerCase().includes(search.toLowerCase());
    return mf&&ms;
  }),[staffList,filter,search]);

  if(detail) {
    const s = detail;
    const avatarBg = s.status==="active"?"bg-indigo-500":s.status==="restricted"?"bg-amber-500":"bg-slate-400";
    const initials  = s.name.split(" ").map((w: string)=>w[0]).join("").slice(0,2).toUpperCase();
    const {date} = fmtTs(s.updatedAt);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={()=>setDetail(null)} className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-primary px-3 py-2 rounded-xl hover:bg-blue-50 transition-all">
            <ChevronRight size={14} className="rotate-180"/>Back
          </button>
          <div className="h-4 w-px bg-slate-200"/>
          <p className="text-xs font-black uppercase text-slate-400 truncate">{s.name}</p>
          <StatusPill status={s.status}/>
        </div>

        <Card className="overflow-hidden">
          <div className={`h-16 ${avatarBg} opacity-20`}/>
          <div className="px-5 pb-5">
            <div className="-mt-8 flex items-end justify-between mb-3">
              <div className={`w-16 h-16 rounded-2xl ${avatarBg} flex items-center justify-center border-4 border-white shadow`}>
                <span className="text-white font-black text-2xl">{initials}</span>
              </div>
              <Btn size="sm" variant="outline" onClick={()=>setDlg({type:"staffEdit",data:s})}><KeyRound size={13}/>Edit</Btn>
            </div>
            <p className="font-black text-slate-900 text-lg uppercase">{s.name}</p>
            <p className="text-sm text-slate-500 font-bold">{s.role}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusPill status={s.status}/>
              <span className="text-xs text-slate-400 font-bold">Updated: {date}</span>
            </div>
          </div>
        </Card>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase text-slate-500 tracking-wide">Permissions</p>
          <Card className="divide-y divide-slate-50">
            {PERMS_META.map(({key,label,desc})=>(
              <div key={key} className="flex items-center justify-between px-5 py-4">
                <div><p className="text-sm font-black text-slate-800 uppercase">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${s.permissions[key]?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-400"}`}>{s.permissions[key]?"Enabled":"Off"}</span>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase text-slate-500 tracking-wide">Classes ({s.assignedClasses.length===0?"All":s.assignedClasses.length})</p>
          <Card className="p-5">
            {s.assignedClasses.length===0
              ? <p className="text-sm text-slate-400 italic">Access to all classes</p>
              : <div className="flex flex-wrap gap-2">{s.assignedClasses.map((c: string)=><span key={c} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-black rounded-xl uppercase">{c}</span>)}</div>
            }
          </Card>
        </div>

        <Card className="p-4 space-y-3">
          <Btn variant="outline" className="w-full justify-start" onClick={()=>setDlg({type:"staffEdit",data:s})}>
            <KeyRound size={15} className="text-indigo-500"/>Edit Permissions & Access
          </Btn>
          {s.status!=="revoked"
            ? <Btn variant="danger" className="w-full justify-start" onClick={()=>setDlg({type:"revoke",data:s})}>
                <UserX size={15}/>Revoke Portal Access
              </Btn>
            : <Btn variant="success" className="w-full justify-start" onClick={()=>{dispatch({type:"SET_STAFF_STATUS",id:s.id,status:"active"});showToast(`${s.name} restored`);setDetail(null);}}>
                <UserCheck size={15}/>Restore Portal Access
              </Btn>
          }
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Staff Access</h1>
          <p className="text-sm text-slate-400">{counts.Active} active · {(counts as any).Restricted} restricted · {(counts as any).Revoked} revoked</p>
        </div>
        <Btn variant="primary" onClick={()=>setDlg({type:"staffAdd"})}><UserPlus size={15}/>Add Staff</Btn>
      </div>

      <div className="overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
        <div className="flex gap-2 min-w-max">
          {STAFF_FILTERS.map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide whitespace-nowrap transition-all ${filter===f?"bg-primary text-primary-foreground shadow-sm":"bg-white text-slate-500 border border-slate-200 hover:border-blue-300 hover:text-primary"}`}>
              {f}
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-black ${filter===f?"bg-white/20 text-white":"bg-slate-100 text-slate-500"}`}>{(counts as any)[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={(e: any)=>setSearch(e.target.value)} placeholder="Search by name or role…"
          className="w-full pl-9 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary focus:bg-white outline-none transition-all shadow-sm"/>
      </div>

      {filtered.length===0
        ? <EmptyState icon={Users} title={search?`No results for "${search}"`:"No staff accounts yet"} subtitle={!search?'Click "Add Staff" to create one':undefined}/>
        : <div className="space-y-2">{filtered.map((s: any)=><StaffCard key={s.id} s={s} onClick={()=>setDetail(s)} onEdit={(s: any)=>setDlg({type:"staffEdit",data:s})} onRevoke={(s: any)=>setDlg({type:"revoke",data:s})} onRestore={(s: any)=>{dispatch({type:"SET_STAFF_STATUS",id:s.id,status:"active"});showToast(`${s.name} restored`);}}/>)}</div>
      }
    </div>
  );
});

// ─── Print Dialog ─────────────────────────────────────────────────────────────
const PRINT_OPTS=[{id:"pdf",icon:"📄",label:"Export PDF",desc:"Download professional PDF report"},{id:"excel",icon:"📊",label:"Export Excel",desc:"Download editable spreadsheet"},{id:"browser",icon:"🖨️",label:"Browser Print",desc:"Print via browser dialog"},{id:"download",icon:"💾",label:"Download HTML",desc:"Save report as HTML file"},{id:"email",icon:"📧",label:"Email Summary",desc:"Send to email address"},{id:"share",icon:"📤",label:"Share",desc:"Share via apps or clipboard"}];

function buildReportHTML(studentName: string, schoolName: string): string {
  const el = document.getElementById("printable-report");
  if (!el) return "";
  const clone = el.cloneNode(true) as HTMLElement;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${studentName} - Report Sheet - ${schoolName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;background:#fff;color:#0f172a;padding:0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #cbd5e1;padding:8px 10px;font-size:11px}
thead tr{background:#0f172a;color:#fff}
thead th{border-color:#334155;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;font-size:9px}
tfoot tr{background:#0f172a}
tfoot td{color:#94a3b8;border-color:#334155}
tr:nth-child(even){background:#f8fafc}
.report-wrap{max-width:800px;margin:0 auto;background:#fff}
@media print{
  body{padding:0}
  .report-wrap{max-width:none;box-shadow:none;border:none}
  @page{size:A4 portrait;margin:10mm}
}
@media screen{
  body{padding:20px;background:#f1f5f9}
  .report-wrap{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
}
</style></head><body>
<div class="report-wrap">${clone.innerHTML}</div>
<script>window.onload=function(){if(window.opener||window.print){setTimeout(function(){window.print()},500)}}</script>
</body></html>`;
}

const PrintDialog=memo(({student,schoolName,schoolSettings:ss,curC,attRate,onClose}: any)=>{
  const[sel,setSel]=useState<string|null>(null);const[email,setEmail]=useState("");const[st,setSt]=useState("idle");
  const emailjsCfg = ss?.emailjs;
  
  const buildExportData=()=>({
    studentName:student.name,className:student.class,term:student.term||ss?.term||"",session:student.session||ss?.session||"",
    position:student.position,classCount:student.classCount,
    records:student.records||[],summary:student.summary||{total:0,obtainable:0,avg:"0"},
    schoolName:ss?.name||schoolName,motto:ss?.motto||"",resumptionDate:ss?.resumptionDate||"",
    comments:curC||{teacher:"",principal:"",teacherSig:"",principalSig:"",daysOpen:"",daysPresent:"",daysAbsent:""},
    attRate:attRate??null,
  });

  const go=async()=>{
    if(!sel)return;
    setSt("loading");
    try{
      if(sel==="pdf"){
        exportToPDF(buildExportData());
        setSt("done");
      } else if(sel==="excel"){
        exportToExcel(buildExportData());
        setSt("done");
      } else if(sel==="browser"){
        const reportHTML = buildReportHTML(student.name, ss?.name||schoolName);
        if(!reportHTML) throw new Error("no-report");
        const w = window.open("","_blank","width=800,height=900");
        if(w){w.document.write(reportHTML);w.document.close();}
        else{onClose();setTimeout(()=>window.print(),300);}
        setSt("done");
      } else if(sel==="download"){
        const reportHTML = buildReportHTML(student.name, ss?.name||schoolName);
        if(!reportHTML) throw new Error("no-report");
        const blob = new Blob([reportHTML],{type:"text/html;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = student.name.replace(/\s+/g,"_")+"_Report_Sheet.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSt("done");
      } else if(sel==="email"){
        if(!email.includes("@")) throw new Error("bad-email");
        if(!emailjsCfg?.serviceId || !emailjsCfg?.templateId || !emailjsCfg?.publicKey) throw new Error("no-emailjs");
        const sName = ss?.name||schoolName;
        const records = student.records || [];
        const scoreRows = records.map((r: any) => `${r.subject}: CA=${r.caScore}, Exam=${r.examScore}, Total=${r.total}`).join("\n");
        const message = `Dear Parent/Guardian,\n\nPlease find below the academic report summary for ${student.name}.\n\nSchool: ${sName}\nStudent: ${student.name}\nClass: ${student.class || ""}\nTerm: ${student.term || ss?.term || ""}\nSession: ${student.session || ss?.session || ""}\nPosition: ${student.position || "N/A"}\nAverage: ${student.summary?.avg || "N/A"}%\n\n--- SCORES ---\n${scoreRows || "No scores recorded"}\n\nCumulative: ${student.summary?.total || 0}/${student.summary?.obtainable || 0}\n\n--- ATTENDANCE ---\nDays Open: ${curC?.daysOpen || "—"}\nDays Present: ${curC?.daysPresent || "—"}\nDays Absent: ${curC?.daysAbsent || "—"}\nAttendance Rate: ${attRate !== null && attRate !== undefined ? attRate + "%" : "—"}\n\n--- REMARKS ---\nTeacher: ${curC?.teacher || "No remark"}\nPrincipal: ${curC?.principal || "No remark"}\n\nNext Term Resumption: ${ss?.resumptionDate || "—"}\n\nBest regards,\n${sName}`;
        const subject = `${student.name} - Academic Report Sheet - ${sName}`;
        await emailjs.send(emailjsCfg.serviceId, emailjsCfg.templateId, {
          to_email: email,
          subject,
          message,
        }, emailjsCfg.publicKey);
        setSt("done");
      } else if(sel==="share"){
        const sName = ss?.name||schoolName;
        const shareText = `📋 Academic Report Sheet\n🏫 ${sName}\n👤 Student: ${student.name}\n📊 Average: ${student.summary?.avg || "N/A"}%\n\nFull report available at the school office.`;
        if(navigator.share){
          await navigator.share({title:`${student.name} Report - ${sName}`,text:shareText});
        } else if(navigator.clipboard){
          await navigator.clipboard.writeText(shareText);
        }
        setSt("done");
      }
    }catch(e: any){
      if(e.message==="bad-email") setSt("bad-email");
      else if(e.message==="no-emailjs") setSt("no-emailjs");
      else if(e.name==="AbortError") setSt("idle");
      else setSt("error");
    }
  };

  return(
    <Sheet onClose={onClose}>
      <MHead icon={Printer} title="Print / Export Report" subtitle={student.name} color="bg-primary" onClose={onClose}/>
      <div className="p-5 space-y-3 overflow-y-auto">
        {st==="done"?(
          <div className="text-center py-10 space-y-4">
            <div className="inline-flex p-4 bg-emerald-100 rounded-full"><Check size={32} className="text-emerald-600"/></div>
            <p className="font-black uppercase text-slate-900">Done!</p>
            <p className="text-xs text-slate-500">Your report has been exported successfully.</p>
            <div className="flex gap-2 justify-center">
              <Btn variant="ghost" onClick={()=>setSt("idle")}>Export Another</Btn>
              <Btn variant="primary" onClick={onClose}>Close</Btn>
            </div>
          </div>
        ):(
          <>
            <div className="grid grid-cols-2 gap-2">
              {PRINT_OPTS.slice(0,2).map(o=>
                <button key={o.id} type="button" onClick={()=>{setSel(o.id);setSt("idle");}} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${sel===o.id?"border-primary bg-blue-50":"border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                  <span className="text-2xl">{o.icon}</span>
                  <p className={`text-sm font-black ${sel===o.id?"text-primary":"text-slate-800"}`}>{o.label}</p>
                  <p className="text-xs text-slate-400">{o.desc}</p>
                </button>
              )}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-black uppercase text-slate-400">More Options</p>
              {PRINT_OPTS.slice(2).map(o=>
                <button key={o.id} type="button" onClick={()=>{setSel(o.id);setSt("idle");}} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${sel===o.id?"border-primary bg-blue-50":"border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                  <span className="text-lg flex-shrink-0">{o.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black ${sel===o.id?"text-primary":"text-slate-800"}`}>{o.label}</p>
                    <p className="text-xs text-slate-400">{o.desc}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${sel===o.id?"border-primary bg-primary":"border-slate-300"}`}>
                    {sel===o.id&&<Check size={9} className="text-white m-auto mt-0.5"/>}
                  </div>
                </button>
              )}
            </div>
            {sel==="email"&&<>
              <Inp label="Recipient Email" type="email" placeholder="parent@example.com" value={email} onChange={(e: any)=>{setEmail(e.target.value);setSt("idle");}} error={st==="bad-email"?"Enter a valid email address":""}/>
              {!emailjsCfg?.serviceId&&<div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3"><AlertTriangle size={13} className="text-amber-500"/><p className="text-xs text-amber-700 font-medium">Configure EmailJS in Settings → Email tab first.</p></div>}
            </>}
            {sel==="pdf"&&<div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2"><Download size={13} className="text-primary flex-shrink-0 mt-0.5"/><p className="text-xs text-blue-700 font-medium">Downloads a professional A4 PDF with scores, attendance, and remarks.</p></div>}
            {sel==="excel"&&<div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2"><FileSpreadsheet size={13} className="text-primary flex-shrink-0 mt-0.5"/><p className="text-xs text-blue-700 font-medium">Downloads an editable Excel spreadsheet for end-of-term processing.</p></div>}
            {sel==="browser"&&<div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2"><Printer size={13} className="text-primary flex-shrink-0 mt-0.5"/><p className="text-xs text-blue-700 font-medium">Opens the report in a new window with print dialog.</p></div>}
            {st==="no-emailjs"&&<div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-3"><AlertTriangle size={13} className="text-red-500"/><p className="text-xs text-red-600 font-bold">EmailJS not configured. Go to Settings → Email to set it up.</p></div>}
            {st==="error"&&<div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-3"><AlertTriangle size={13} className="text-red-500"/><p className="text-xs text-red-600 font-bold">Failed to send email. Check your EmailJS settings and try again.</p></div>}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={go} loading={st==="loading"} disabled={!sel}>{sel==="pdf"?<><Download size={14}/>Export PDF</>:sel==="excel"?<><FileSpreadsheet size={14}/>Export Excel</>:<><Printer size={14}/>Proceed</>}</Btn>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
});

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const SettingsTab=memo(({logoUrl,setSchoolLogo,logoRef,showToast,adminPinRef}: any)=>{
  const{state,dispatch}=useApp();const{schoolSettings}=state;
  const[sec,setSec]=useState("info");const[draft,setDraft]=useState({...schoolSettings});const[pinF,setPinF]=useState<any>({cur:"",nxt:"",cnf:""});const[pinErr,setPinErr]=useState("");const[pinSh,setPinSh]=useState<any>({cur:false,nxt:false,cnf:false});const[saved,setSaved]=useState(false);
  useEffect(()=>setDraft({...schoolSettings}),[schoolSettings]);
  const saveInfo=()=>{dispatch({type:"SET_SCHOOL_SETTINGS",payload:draft});setSaved(true);showToast("Settings saved");setTimeout(()=>setSaved(false),2000);};
  const handleLogo=(e: any)=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith("image/"))return showToast("Invalid image","error");if(f.size>2097152)return showToast("Max 2MB","error");const r=new FileReader();r.onload=(ev: any)=>{setSchoolLogo(ev.target.result);showToast("Logo uploaded");};r.readAsDataURL(f);};
  const changePin=async()=>{setPinErr("");const curMatch=await verifyPin(pinF.cur,adminPinRef.current);if(!curMatch)return setPinErr("Current PIN incorrect.");if(pinF.nxt.length<4)return setPinErr("New PIN must be ≥ 4 digits.");if(pinF.nxt!==pinF.cnf)return setPinErr("PINs don't match.");const hashed=await hashPin(pinF.nxt);adminPinRef.current=hashed;setPinF({cur:"",nxt:"",cnf:""});showToast("Admin PIN updated & encrypted");};
  const[emailDraft,setEmailDraft]=useState<any>(schoolSettings.emailjs||{serviceId:"",templateId:"",publicKey:""});
  const SECS=[{id:"logo",label:"Logo",icon:"🖼️"},{id:"info",label:"School Info",icon:"🏫"},{id:"session",label:"Session",icon:"📅"},{id:"email",label:"Email",icon:"📧"},{id:"data",label:"Data",icon:"💾"},{id:"security",label:"Security",icon:"🔒"}];
  return(
    <div className="max-w-3xl mx-auto">
      <div className="mb-5"><h1 className="text-2xl font-black text-slate-900 uppercase">Settings</h1><p className="text-sm text-slate-400">Manage school identity, session and security</p></div>
      <div className="flex flex-col md:flex-row gap-5">
        <Card className="p-2 md:w-44 flex-shrink-0 h-fit">
          {SECS.map(s=><button key={s.id} type="button" onClick={()=>setSec(s.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-sm font-bold ${sec===s.id?"bg-blue-50 text-primary":"text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}><span>{s.icon}</span>{s.label}{sec===s.id&&<ChevronRight size={13} className="ml-auto"/>}</button>)}
        </Card>
        <div className="flex-1 space-y-4">
          {sec==="logo"&&<Card className="p-6 space-y-5"><div><p className="text-sm font-black uppercase text-slate-700">School Logo</p><p className="text-xs text-slate-400 mt-0.5">Appears on login, sidebar and reports.</p></div><div className="flex items-center gap-5"><SchoolLogo logoUrl={logoUrl} size="lg"/><div className="flex-1 space-y-2"><p className="text-xs text-slate-500">PNG, JPG or SVG · max 2MB</p><div className="flex gap-2 flex-wrap"><Btn variant="primary" size="sm" onClick={()=>logoRef.current?.click()}><Upload size={13}/>{logoUrl?"Replace":"Upload"}</Btn>{logoUrl&&<Btn variant="ghost" size="sm" onClick={()=>{setSchoolLogo(null);if(logoRef.current)logoRef.current.value="";showToast("Logo removed");}}><X size={13}/>Remove</Btn>}</div></div></div><input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo}/><div onClick={()=>logoRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-all group"><Upload size={22} className="mx-auto text-slate-300 group-hover:text-primary mb-2"/><p className="text-xs font-black uppercase text-slate-400 group-hover:text-primary">Click or drop here</p></div></Card>}
          {sec==="info"&&<Card className="p-6 space-y-4"><p className="text-sm font-black uppercase text-slate-700">School Information</p><Inp label="School Name" value={draft.name} onChange={(e: any)=>setDraft((d: any)=>({...d,name:e.target.value}))}/><Inp label="School Motto" value={draft.motto} onChange={(e: any)=>setDraft((d: any)=>({...d,motto:e.target.value}))}/><Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>{saved?<><Check size={15}/>Saved!</>:<><Save size={15}/>Save Info</>}</Btn></Card>}
          {sec==="session"&&<Card className="p-6 space-y-4"><p className="text-sm font-black uppercase text-slate-700">Session & Term</p><Inp label="Academic Session" value={draft.session} onChange={(e: any)=>setDraft((d: any)=>({...d,session:e.target.value}))} placeholder="e.g. 2024/2025"/><Sel label="Current Term" value={draft.term} onChange={(e: any)=>setDraft((d: any)=>({...d,term:e.target.value}))}>{TERMS.map(t=><option key={t}>{t}</option>)}</Sel><Inp label="Next Resumption Date" value={draft.resumptionDate} onChange={(e: any)=>setDraft((d: any)=>({...d,resumptionDate:e.target.value}))} placeholder="e.g. January 8th, 2025"/><Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>{saved?<><Check size={15}/>Saved!</>:<><Save size={15}/>Save Session</>}</Btn></Card>}
          {sec==="email"&&<Card className="p-6 space-y-4"><p className="text-sm font-black uppercase text-slate-700">EmailJS Configuration</p><p className="text-xs text-slate-400">Send report summaries directly to parents' email.</p><div className="bg-accent/50 border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground leading-relaxed">Sign up free at <a href="https://www.emailjs.com" target="_blank" rel="noopener noreferrer" className="text-primary font-bold underline">emailjs.com</a>, create an email service &amp; template, then paste your IDs below. Template variables: <code className="bg-muted px-1 rounded text-[10px]">{"{{to_email}}"}</code>, <code className="bg-muted px-1 rounded text-[10px]">{"{{subject}}"}</code>, <code className="bg-muted px-1 rounded text-[10px]">{"{{message}}"}</code>.</p></div><Inp label="Service ID" value={emailDraft.serviceId} onChange={(e: any)=>setEmailDraft((d: any)=>({...d,serviceId:e.target.value}))} placeholder="service_xxxxxxx"/><Inp label="Template ID" value={emailDraft.templateId} onChange={(e: any)=>setEmailDraft((d: any)=>({...d,templateId:e.target.value}))} placeholder="template_xxxxxxx"/><Inp label="Public Key" value={emailDraft.publicKey} onChange={(e: any)=>setEmailDraft((d: any)=>({...d,publicKey:e.target.value}))} placeholder="your_public_key"/><Btn variant="primary" size="lg" className="w-full" onClick={()=>{dispatch({type:"SET_SCHOOL_SETTINGS",payload:{emailjs:emailDraft}});showToast("Email settings saved");}}><Save size={15}/>Save Email Settings</Btn></Card>}
          {sec==="data"&&<Card className="p-6 space-y-5">
            <div><p className="text-sm font-black uppercase text-slate-700">Backup & Restore</p><p className="text-xs text-slate-400 mt-0.5">Export all data or restore from a previous backup.</p></div>
            <div className="space-y-3">
              <Btn variant="primary" size="lg" className="w-full" onClick={()=>{exportBackup(state);showToast("Backup downloaded");}}><Download size={15}/>Export Full Backup (JSON)</Btn>
              <Btn variant="outline" size="lg" className="w-full" onClick={()=>{
                const input=document.createElement("input");input.type="file";input.accept=".json";
                input.onchange=async(ev: any)=>{
                  const file=ev.target.files[0];if(!file)return;
                  try{
                    const text=await readFileText(file);const parsed=JSON.parse(text);
                    const result=validateBackup(parsed);
                    if(!result.valid)return showToast(result.error||"Invalid backup","error");
                    const d=result.data!;
                    dispatch({type:"HYDRATE",payload:{
                      ...(d.entries?{entries:d.entries}:{}),
                      ...(d.bin?{bin:d.bin}:{}),
                      ...(d.logs?{logs:d.logs}:{}),
                      ...(d.comments?{comments:d.comments}:{}),
                      ...(d.attendance?{attendance:d.attendance}:{}),
                      ...(d.classRolls?{classRolls:d.classRolls}:{}),
                      ...(d.staffList?{staffList:d.staffList}:{}),
                      ...(d.schoolSettings?{schoolSettings:d.schoolSettings}:{}),
                    }});
                    showToast(`Backup restored — ${d.entries?.length||0} scores, ${d.attendance?.length||0} attendance records`);
                  }catch{showToast("Failed to read backup file","error");}
                };input.click();
              }}><UploadCloud size={15}/>Restore from Backup</Btn>
            </div>
            <div className="border-t border-slate-100 pt-5 space-y-3">
              <p className="text-sm font-black uppercase text-slate-700">Import Scores from CSV</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3"><p className="text-xs text-blue-700 font-medium">CSV format: <code className="bg-white px-1 rounded text-[10px]">Name, Subject, CA, Exam</code> (optionally <code className="bg-white px-1 rounded text-[10px]">Class</code> as 5th column). First row can be a header.</p></div>
              <div className="grid grid-cols-2 gap-3">
                <Sel label="Default Class" id="import-class" value="" onChange={()=>{}}><option value="">Select class</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</Sel>
                <div className="flex items-end"><Btn variant="primary" className="w-full" onClick={()=>{
                  const classEl=document.getElementById("import-class") as HTMLSelectElement;
                  const defaultClass=classEl?.value||"";
                  if(!defaultClass)return showToast("Select a default class first","error");
                  const input=document.createElement("input");input.type="file";input.accept=".csv,.txt";
                  input.onchange=async(ev: any)=>{
                    const file=ev.target.files[0];if(!file)return;
                    try{
                      const text=await readFileText(file);
                      const parsed=parseScoresCSV(text,defaultClass,schoolSettings.term,schoolSettings.session);
                      if(!parsed.length)return showToast("No valid scores found","error");
                      let added=0;
                      parsed.forEach(s=>{
                        const exists=state.entries.some((e: any)=>e.studentName.toLowerCase()===s.studentName.toLowerCase()&&e.studentClass===s.studentClass&&e.subject===s.subject&&e.term===schoolSettings.term&&e.session===schoolSettings.session);
                        if(!exists){dispatch({type:"ADD_ENTRY",payload:{id:uid(),studentName:s.studentName,studentClass:s.studentClass,subject:s.subject,ca1:s.ca,ca2:0,ca3:0,exam:s.exam,caScore:s.ca,examScore:s.exam,total:s.total,term:schoolSettings.term,session:schoolSettings.session,enteredBy:"admin",createdAt:new Date().toISOString()}});added++;}
                      });
                      showToast(`${added} scores imported (${parsed.length-added} duplicates skipped)`);
                    }catch{showToast("Failed to read CSV file","error");}
                  };input.click();
                }}><Upload size={14}/>Import CSV</Btn></div>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-5 space-y-3">
              <p className="text-sm font-black uppercase text-slate-700">Export Data</p>
              <div className="grid grid-cols-2 gap-3">
                <Btn variant="outline" onClick={()=>{if(!state.attendance.length)return showToast("No attendance records","error");exportAttendanceCSV(state.attendance);showToast("Attendance CSV downloaded");}}><Download size={14}/>Attendance CSV</Btn>
                <Btn variant="outline" onClick={()=>{if(!state.attendance.length)return showToast("No attendance records","error");exportAttendanceExcel(state.attendance);showToast("Attendance Excel downloaded");}}><FileSpreadsheet size={14}/>Attendance Excel</Btn>
              </div>
            </div>
          </Card>}
          {sec==="security"&&<Card className="p-6 space-y-4"><p className="text-sm font-black uppercase text-slate-700">Security & PIN</p><div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2"><AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5"/><p className="text-xs text-amber-700 font-medium">Keep Admin PIN private. Default: <strong>1234</strong></p></div>{([["cur","Current PIN"],["nxt","New PIN (min 4 digits)"],["cnf","Confirm New PIN"]] as const).map(([fk,fl])=><Field key={fk} label={fl}><div className="relative"><input type={pinSh[fk]?"text":"password"} value={pinF[fk]} maxLength={8} placeholder="••••••" onChange={(e: any)=>setPinF((p: any)=>({...p,[fk]:e.target.value.replace(/\D/g,"")}))} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-primary outline-none transition-all pr-11"/><button type="button" onClick={()=>setPinSh((s: any)=>({...s,[fk]:!s[fk]}))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{pinSh[fk]?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></Field>)}{pinErr&&<p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={12}/>{pinErr}</p>}<Btn variant="primary" size="lg" className="w-full" onClick={changePin}><Shield size={15}/>Update Admin PIN</Btn></Card>}
        </div>
      </div>
    </div>
  );
});

// ─── Report Sheet ─────────────────────────────────────────────────────────────
const ReportSheet=memo(({report,curC,attRate,schoolLogo,schoolSettings}: any)=>(
  <div id="printable-report" className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{fontFamily:"Georgia,serif"}}>
    <div className="h-1.5 bg-primary"/>
    <div className="px-8 pt-6 pb-5 border-b-2 border-slate-900 flex items-center justify-between gap-4"><div className="flex items-center gap-4 min-w-0"><SchoolLogo logoUrl={schoolLogo} size="lg"/><div><h1 className="text-2xl font-black uppercase text-slate-900 tracking-tight leading-tight">{schoolSettings.name}</h1><p className="text-xs font-bold text-primary uppercase tracking-widest mt-1">{schoolSettings.motto}</p></div></div><div className="text-right flex-shrink-0"><span className="inline-block bg-slate-900 text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">Report Sheet</span><p className="text-xs text-slate-500 font-bold mt-1.5">{schoolSettings.session} · {schoolSettings.term}</p></div></div>
    <div className="bg-slate-50 px-8 py-3.5 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">{[["Student",report.name,"font-black text-primary"],["Class",report.class,""],["Position",report.position,"font-black text-emerald-700"],["In Class",report.classCount,""]].map(([l,v,x]: any)=><div key={l}><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-0.5">{l}</p><p className={`text-sm font-black uppercase text-slate-900 ${x}`}>{v}</p></div>)}</div>
    <div className="px-8 pt-5 pb-3"><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Academic Performance</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{borderTop:"2px solid #0f172a",borderBottom:"2px solid #0f172a"}}><thead><tr className="bg-slate-900 text-white">{["Subject","CA /40","Exam /60","Total /100","Grade","Remark"].map((h,i)=><th key={i} style={{padding:"9px 10px",textAlign:i===0?"left":"center",fontWeight:800,fontSize:"9px",letterSpacing:"0.1em",textTransform:"uppercase",borderRight:i<5?"1px solid #334155":"none"}}>{h}</th>)}</tr></thead><tbody>{report.records.map((r: any,i: number)=>{const g=getGrade(r.total);return(<tr key={i} style={{background:i%2===0?"#fff":"#f8fafc"}}><td style={{padding:"8px 10px",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",fontWeight:700,textTransform:"uppercase",fontSize:"10px"}}>{r.subject}</td><td style={{padding:"8px 10px",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",textAlign:"center",fontWeight:700}}>{r.caScore}</td><td style={{padding:"8px 10px",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",textAlign:"center",fontWeight:700}}>{r.examScore}</td><td style={{padding:"8px 10px",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",textAlign:"center",fontWeight:900,fontSize:"12px"}}>{r.total}</td><td style={{padding:"8px 10px",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",textAlign:"center",fontWeight:900,color:g.color}}>{g.grade}</td><td style={{padding:"8px 10px",borderBottom:"1px solid #e2e8f0",fontStyle:"italic",color:"#64748b",fontSize:"10px"}}>{g.remark}</td></tr>);})}</tbody>
          <tfoot><tr style={{background:"#0f172a"}}><td colSpan={3} style={{padding:"9px 10px",color:"#94a3b8",fontWeight:800,fontSize:"9px",textTransform:"uppercase"}}>Cumulative Total</td><td style={{padding:"9px 10px",textAlign:"center",color:"#fff",fontWeight:900,fontSize:"14px"}}>{report.summary.total}<span style={{fontSize:"9px",opacity:0.5}}>/{report.summary.obtainable}</span></td><td style={{padding:"9px 10px",textAlign:"center",color:"#34d399",fontWeight:900,fontSize:"12px"}}>{report.summary.avg}%</td><td style={{padding:"9px 10px",color:"#94a3b8",fontWeight:800,fontSize:"9px",textTransform:"uppercase"}}>Avg.</td></tr></tfoot></table>
      </div>
    </div>
    <div className="px-8 pt-4 pb-3"><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Attendance</p><div className="grid grid-cols-4 gap-2">{[["Days Opened",curC.daysOpen||"—","bg-slate-100 text-slate-800"],["Days Present",curC.daysPresent||"—","bg-emerald-50 text-emerald-800"],["Days Absent",curC.daysAbsent||"—","bg-red-50 text-red-700"],["Rate",attRate!==null?`${attRate}%`:"—",attRate===null?"bg-slate-100 text-slate-800":attRate>=75?"bg-emerald-100 text-emerald-900":"bg-red-100 text-red-900"]].map(([l,v,c]: any)=><div key={l} className={`${c} rounded-xl p-3 text-center`}><p className="text-xs font-black uppercase opacity-60 mb-0.5">{l}</p><p className="text-xl font-black">{v}</p></div>)}</div></div>
    <div className="px-8 pt-4 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">{([["teacher","Class Teacher's Remark","teacherSig"],["principal","Principal's Remark","principalSig"]] as const).map(([f,l,sf])=><div key={f} className="border border-slate-200 rounded-xl p-4"><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">{l}</p><div className="min-h-10 text-sm text-slate-700 italic border-b border-dashed border-slate-200 pb-2 mb-3">{curC[f]||<span className="text-slate-300 not-italic text-xs">No remark</span>}</div><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase text-slate-400 mb-0.5">Signature</p><p className="text-primary italic text-base" style={{fontFamily:"Georgia,serif"}}>{curC[sf]||"_____________________"}</p></div>{f==="principal"&&<div className="w-16 h-10 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center"><p className="text-xs text-slate-300 font-bold">Stamp</p></div>}</div></div>)}</div>
    <div className="bg-slate-900 px-8 py-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Next Term Resumption</p><p className="text-sm font-black text-white uppercase">{schoolSettings.resumptionDate}</p></div>
    <div className="h-1.5 bg-primary"/>
  </div>
));

// ─── Attendance Tab ───────────────────────────────────────────────────────────
const AttendanceTab = memo(()=>{
  const{state,dispatch,showToast}=useApp();
  const{attendance,classRolls,entries}=state;
  const[attTab,setAttTab]=useState("roll");
  const[rollClass,setRollClass]=useState("");const[rollSearch,setRollSearch]=useState("");const[newName,setNewName]=useState("");const[newAdmNo,setNewAdmNo]=useState("");const[bulkText,setBulkText]=useState("");const[showBulk,setShowBulk]=useState(false);const[editingId,setEditingId]=useState<string|null>(null);const[editName,setEditName]=useState("");const[editAdmNo,setEditAdmNo]=useState("");
  const[markClass,setMarkClass]=useState("");const[markDate,setMarkDate]=useState(todayStr());const[markRecords,setMarkRecords]=useState<any>({});const[markSearch,setMarkSearch]=useState("");
  const[hClass,setHClass]=useState("");const[hDate,setHDate]=useState(todayStr());const[hStatus,setHStatus]=useState("All");const[hSearch,setHSearch]=useState("");

  const rollStudents=useMemo(()=>{const roll=classRolls[rollClass]||[];const fromE=entries.filter((e: any)=>e.studentClass===rollClass).map((e: any)=>e.studentName);const eSet=new Set(fromE);const rSet=new Set(roll.map((r: any)=>r.name));const suggested=[...eSet].filter((n: string)=>!rSet.has(n)).map((n: string)=>({id:"suggest_"+n,name:n,admNo:"",suggested:true}));return[...roll,...suggested];},[classRolls,rollClass,entries]);
  const filteredRoll=useMemo(()=>rollStudents.filter((s: any)=>s.name.toLowerCase().includes(rollSearch.toLowerCase())||(s.admNo||"").includes(rollSearch)),[rollStudents,rollSearch]);
  const addStudent=()=>{if(!newName.trim())return showToast("Enter student name","error");if(!rollClass)return showToast("Select a class","error");const existing=classRolls[rollClass]||[];if(existing.find((s: any)=>s.name.toLowerCase()===newName.trim().toLowerCase()))return showToast("Already exists","error");dispatch({type:"SAVE_CLASS_ROLL",className:rollClass,students:[...existing,{id:uid(),name:newName.trim(),admNo:newAdmNo.trim()}]});setNewName("");setNewAdmNo("");showToast("Student added");};
  const addBulk=()=>{if(!rollClass)return showToast("Select a class","error");const lines=bulkText.split("\n").map(l=>l.trim()).filter(Boolean);const existing=classRolls[rollClass]||[];const existingNames=new Set(existing.map((s: any)=>s.name.toLowerCase()));const newStudents=lines.filter((l: string)=>!existingNames.has(l.toLowerCase())).map((l: string)=>({id:uid(),name:l,admNo:""}));if(!newStudents.length)return showToast("All already in roll","warning");dispatch({type:"SAVE_CLASS_ROLL",className:rollClass,students:[...existing,...newStudents]});setBulkText("");setShowBulk(false);showToast(`${newStudents.length} students added`);};
  const confirmStudent=(s: any)=>{const existing=(classRolls[rollClass]||[]).filter((x: any)=>x.id!==s.id);dispatch({type:"SAVE_CLASS_ROLL",className:rollClass,students:[...existing,{id:uid(),name:s.name,admNo:s.admNo||""}]});showToast(`${s.name} added to roll`);};
  const saveEdit=(id: string)=>{if(!editName.trim())return;const roll=(classRolls[rollClass]||[]).map((s: any)=>s.id===id?{...s,name:editName.trim(),admNo:editAdmNo.trim()}:s);dispatch({type:"SAVE_CLASS_ROLL",className:rollClass,students:roll});setEditingId(null);showToast("Updated");};
  const removeStudent=(studentId: string)=>{dispatch({type:"DELETE_ROLL_STUDENT",className:rollClass,studentId});showToast("Removed");};
  const markPool=useMemo(()=>{const roll=classRolls[markClass]||[];const fromE=[...new Set(entries.filter((e: any)=>e.studentClass===markClass).map((e: any)=>e.studentName))] as string[];const rNames=new Set(roll.filter((s: any)=>!s.suggested).map((s: any)=>s.name));const extra=fromE.filter((n: string)=>!rNames.has(n));return[...roll.filter((s: any)=>!s.suggested).map((s: any)=>s.name),...extra].sort();},[classRolls,markClass,entries]);
  const filteredMark=useMemo(()=>markPool.filter((n: string)=>n.toLowerCase().includes(markSearch.toLowerCase())),[markPool,markSearch]);
  const existingForDate=useMemo(()=>{const m: any={};attendance.filter((a: any)=>a.studentClass===markClass&&a.date===markDate).forEach((a: any)=>{m[a.studentName]={status:a.status,note:a.note||""};});return m;},[attendance,markClass,markDate]);
  const markSummary=useMemo(()=>{const all=attendance.filter((a: any)=>a.studentClass===markClass&&a.date===markDate);return{present:all.filter((a: any)=>a.status==="present").length,absent:all.filter((a: any)=>a.status==="absent").length,late:all.filter((a: any)=>a.status==="late").length,excused:all.filter((a: any)=>a.status==="excused").length,total:all.length};},[attendance,markClass,markDate]);
  const setStudentAtt=(name: string, field: string, val: any)=>setMarkRecords((p: any)=>({...p,[name]:{...(p[name]||{}),[field]:val}}));
  const markAll=(status: string)=>{const m: any={};filteredMark.forEach((n: string)=>{m[n]={...(markRecords[n]||{}),status};});setMarkRecords(m);};
  const saveAttendance=()=>{if(!markClass)return showToast("Select a class","error");const toSave=Object.entries(markRecords).filter(([,v]: any)=>v?.status).map(([name,v]: any)=>{const ex=attendance.find((a: any)=>a.studentName===name&&a.studentClass===markClass&&a.date===markDate);return{id:ex?.id||uid(),studentName:name,studentClass:markClass,date:markDate,status:v.status,note:v.note||"",createdAt:ex?.createdAt||new Date().toISOString()};});if(!toSave.length)return showToast("Mark at least one student","error");dispatch({type:"BULK_SAVE_ATTENDANCE",payload:toSave});setMarkRecords({});showToast(`Saved for ${toSave.length} student${toSave.length!==1?"s":""}`);};
  const unsaved=Object.values(markRecords).filter((v: any)=>v?.status).length;
  const historyData=useMemo(()=>{let d=[...attendance];if(hClass)d=d.filter((a: any)=>a.studentClass===hClass);if(hDate)d=d.filter((a: any)=>a.date===hDate);if(hStatus!=="All")d=d.filter((a: any)=>a.status===hStatus);if(hSearch)d=d.filter((a: any)=>a.studentName.toLowerCase().includes(hSearch.toLowerCase()));return d.sort((a: any,b: any)=>new Date(b.date).getTime()-new Date(a.date).getTime());},[attendance,hClass,hDate,hStatus,hSearch]);

  return(
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-slate-900 uppercase">Attendance</h1><p className="text-sm text-slate-400">{attendance.length} records · {Object.keys(classRolls).length} class rolls</p></div>
        <div className="flex gap-2">{([["roll","Rolls",ClipboardList],["mark","Mark",CalendarDays],["history","History",Database]] as const).map(([id,label,Icon])=><Btn key={id} variant={attTab===id?"primary":"outline"} size="sm" onClick={()=>setAttTab(id)}><Icon size={14}/>{label}</Btn>)}</div>
      </div>

      {attTab==="roll"&&<div className="space-y-4">
        <Card className="p-5 space-y-4">
          <Sel value={rollClass} onChange={(e: any)=>{setRollClass(e.target.value);setRollSearch("");}}><option value="">Choose a class…</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</Sel>
          {rollClass&&<div className="flex items-center justify-between flex-wrap gap-2"><div className="flex items-center gap-2"><Pill color="blue">{(classRolls[rollClass]||[]).length} registered</Pill></div><div className="flex gap-2"><Btn variant="outline" size="sm" onClick={()=>{const input=document.createElement("input");input.type="file";input.accept=".csv,.txt";input.onchange=async(ev: any)=>{const file=ev.target.files[0];if(!file)return;try{const text=await readFileAsText(file);const parsed=parseCSV(text);if(!parsed.length)return showToast("No valid names found","error");const existing=classRolls[rollClass]||[];const existingNames=new Set(existing.map((s: any)=>s.name.toLowerCase()));const newStudents=parsed.filter(s=>!existingNames.has(s.name.toLowerCase())).map(s=>({id:uid(),name:s.name,admNo:s.admNo}));if(!newStudents.length)return showToast("All already on roll","warning");dispatch({type:"SAVE_CLASS_ROLL",className:rollClass,students:[...existing,...newStudents]});showToast(`${newStudents.length} students imported from CSV`);}catch{showToast("Failed to read file","error");}};input.click();}}><Upload size={13}/>Import CSV</Btn><Btn variant="outline" size="sm" onClick={()=>setShowBulk(b=>!b)}>{showBulk?<><X size={13}/>Close</>:<><PlusCircle size={13}/>Bulk Add</>}</Btn></div></div>}
        </Card>
        {rollClass&&<>
          {showBulk&&<Card className="p-5 space-y-3 border-2 border-blue-200 bg-blue-50"><p className="text-xs font-black uppercase text-primary">Bulk Add — one name per line, or import a CSV file</p><textarea value={bulkText} onChange={(e: any)=>setBulkText(e.target.value)} rows={5} placeholder={"Adaeze Okonkwo\nEmeka Nwosu\n…"} className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-sm font-medium focus:border-primary outline-none resize-none"/><div className="flex gap-3"><Btn variant="ghost" onClick={()=>{setBulkText("");setShowBulk(false);}}>Cancel</Btn><Btn variant="primary" onClick={addBulk} disabled={!bulkText.trim()}><PlusCircle size={14}/>Add {bulkText.split("\n").filter((l: string)=>l.trim()).length}</Btn></div></Card>}
          <Card className="p-5 space-y-3"><p className="text-xs font-black uppercase text-slate-400">Add Individual</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="sm:col-span-2"><Inp value={newName} onChange={(e: any)=>setNewName(e.target.value)} placeholder="Student full name" onKeyDown={(e: any)=>e.key==="Enter"&&addStudent()}/></div><Inp value={newAdmNo} onChange={(e: any)=>setNewAdmNo(e.target.value)} placeholder="Adm No. (opt)" onKeyDown={(e: any)=>e.key==="Enter"&&addStudent()}/></div><Btn variant="primary" onClick={addStudent} disabled={!newName.trim()}><PlusCircle size={14}/>Add to Roll</Btn></Card>
          {filteredRoll.length===0&&!rollSearch?<EmptyState icon={Users} title="No students on roll" subtitle="Add above or from score entries"/>:
          <Card className="overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={rollSearch} onChange={(e: any)=>setRollSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary focus:bg-white outline-none"/></div><span className="text-xs font-black text-slate-400">{filteredRoll.length}</span></div>
          <div className="divide-y divide-slate-50">{filteredRoll.map((s: any,i: number)=><div key={s.id} className={`px-5 py-3.5 flex items-center gap-3 ${s.suggested?"bg-blue-50":""}`}><span className="text-xs font-black text-slate-400 w-6 text-center">{i+1}</span><div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.suggested?"bg-blue-200":"bg-slate-200"}`}><span className={`font-black text-sm ${s.suggested?"text-primary":"text-slate-600"}`}>{s.name.split(" ").map((w: string)=>w[0]).join("").slice(0,2).toUpperCase()}</span></div>
          {editingId===s.id?<div className="flex-1 flex gap-2"><input value={editName} onChange={(e: any)=>setEditName(e.target.value)} className="flex-1 px-3 py-1.5 bg-white border-2 border-primary rounded-lg text-sm font-bold outline-none"/><Btn size="sm" variant="primary" onClick={()=>saveEdit(s.id)}><Check size={12}/></Btn><Btn size="sm" variant="ghost" onClick={()=>setEditingId(null)}><X size={12}/></Btn></div>
          :<><p className="font-black text-sm text-slate-900 flex-1 min-w-0 truncate">{s.name}</p>{s.suggested?<Btn size="sm" variant="primary" onClick={()=>confirmStudent(s)}><Check size={12}/>Add</Btn>:<div className="flex gap-1"><button onClick={()=>{setEditingId(s.id);setEditName(s.name);setEditAdmNo(s.admNo||"");}} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-blue-50"><Edit2 size={13}/></button><button onClick={()=>removeStudent(s.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={13}/></button></div>}</>}
          </div>)}</div></Card>}
        </>}
      </div>}

      {attTab==="mark"&&<div className="space-y-4">
        <Card className="p-5 space-y-4"><Sel value={markClass} onChange={(e: any)=>{setMarkClass(e.target.value);setMarkRecords({});}}><option value="">Select class…</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</Sel><Inp type="date" value={markDate} onChange={(e: any)=>{setMarkDate(e.target.value);setMarkRecords({});}} max={todayStr()}/>
        {markClass&&markDate&&<div className="grid grid-cols-4 gap-2">{([["Present",markSummary.present,"bg-emerald-50 text-emerald-700"],["Absent",markSummary.absent,"bg-red-50 text-red-700"],["Late",markSummary.late,"bg-amber-50 text-amber-700"],["Excused",markSummary.excused,"bg-indigo-50 text-indigo-700"]] as const).map(([l,v,c])=><div key={l} className={`${c} rounded-xl p-3 text-center`}><p className="text-2xl font-black">{v}</p><p className="text-xs font-black uppercase opacity-70">{l}</p></div>)}</div>}
        </Card>
        {markClass?markPool.length===0?<EmptyState icon={Users} title="No students in this class" action={<Btn variant="primary" size="sm" onClick={()=>setAttTab("roll")}><ClipboardList size={14}/>Go to Rolls</Btn>}/>:
        <Card className="overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={markSearch} onChange={(e: any)=>setMarkSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary focus:bg-white outline-none"/></div><div className="flex gap-1.5 flex-wrap">{ATT_STATUSES.map(({key,label,icon,color})=><button key={key} onClick={()=>markAll(key)} className={`text-xs font-black uppercase px-3 py-2 rounded-xl ${color==="emerald"?"bg-emerald-500 text-white":color==="red"?"bg-red-500 text-white":color==="amber"?"bg-amber-500 text-white":"bg-indigo-500 text-white"}`}>{icon} {label}</button>)}</div></div>
        <div className="divide-y divide-slate-50">{filteredMark.map((name: string,i: number)=>{const saved=existingForDate[name];const cur=markRecords[name];const status=cur?.status||saved?.status||null;const note=cur?.note!==undefined?cur.note:(saved?.note||"");const rowBg=status==="present"?"bg-emerald-50":status==="absent"?"bg-red-50":status==="late"?"bg-amber-50":status==="excused"?"bg-indigo-50":"hover:bg-slate-50";
        return<div key={name} className={`px-5 py-3.5 transition-colors ${rowBg}`}><div className="flex items-center gap-3 flex-wrap"><span className="text-xs font-black text-slate-400 w-6 text-center">{i+1}</span><div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center"><span className="text-slate-600 font-black text-sm">{name.split(" ").map((w: string)=>w[0]).join("").slice(0,2).toUpperCase()}</span></div><p className="font-black text-sm text-slate-900 flex-1 min-w-0 truncate">{name}</p><div className="flex gap-1.5">{ATT_STATUSES.map(({key,icon,color})=>{const active=status===key;const bg=active?(color==="emerald"?"bg-emerald-500 border-emerald-500":color==="red"?"bg-red-500 border-red-500":color==="amber"?"bg-amber-500 border-amber-500":"bg-indigo-500 border-indigo-500"):"bg-white border-slate-200 text-slate-400";return<button key={key} onClick={()=>setStudentAtt(name,"status",status===key?null:key)} className={`w-9 h-9 rounded-xl text-sm font-black border-2 transition-all ${bg} ${active?"text-white":""}`}>{icon}</button>;})}{saved&&!cur&&<span className="text-xs font-black text-slate-400">Saved</span>}</div></div>
        {status&&<div className="mt-2 ml-16"><input value={note} onChange={(e: any)=>setStudentAtt(name,"note",e.target.value)} placeholder="Note (optional)…" className="w-full px-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-xs font-medium focus:border-primary outline-none"/></div>}
        </div>;})}
        </div><div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between"><p className="text-xs text-slate-500 font-bold">{unsaved} unsaved</p><Btn variant="primary" onClick={saveAttendance} disabled={unsaved===0}><Save size={14}/>Save Attendance</Btn></div></Card>:
        <EmptyState icon={CalendarDays} title="Select a class to mark attendance" action={<Btn variant="outline" size="sm" onClick={()=>setAttTab("roll")}><ClipboardList size={14}/>Manage Rolls</Btn>}/>}
      </div>}

      {attTab==="history"&&<div className="space-y-4">
        <Card className="p-4 space-y-3"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative col-span-2 md:col-span-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={hSearch} onChange={(e: any)=>setHSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"/></div>
          <select value={hClass} onChange={(e: any)=>setHClass(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"><option value="">All Classes</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</select>
          <input type="date" value={hDate} onChange={(e: any)=>setHDate(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"/>
          <select value={hStatus} onChange={(e: any)=>setHStatus(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"><option value="All">All Statuses</option>{ATT_STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </div></Card>
        {historyData.length===0?<EmptyState icon={Clock} title="No records found"/>:
        <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr>{["Student","Class","Date","Status","Note",""].map((h,i)=><th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-50">{historyData.map((a: any)=>{const sc: Record<string,string>={present:"bg-emerald-100 text-emerald-700",absent:"bg-red-100 text-red-700",late:"bg-amber-100 text-amber-700",excused:"bg-indigo-100 text-indigo-700"};return<tr key={a.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-black text-sm text-slate-900">{a.studentName}</td><td className="px-4 py-3 text-xs font-bold text-slate-600">{a.studentClass}</td><td className="px-4 py-3 text-xs font-bold text-slate-600">{fmtDate(a.date)}</td><td className="px-4 py-3"><span className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${sc[a.status]||"bg-slate-100 text-slate-600"}`}>{a.status}</span></td><td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{a.note||<span className="text-slate-300 italic">—</span>}</td><td className="px-4 py-3"><button onClick={()=>dispatch({type:"DELETE_ATTENDANCE",id:a.id})} className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all"><Trash2 size={13}/></button></td></tr>;})}</tbody></table></div></Card>}
      </div>}
    </div>
  );
});

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function SchoolManagementApp() {
  const [appState,dispatch] = useReducer(appReducer,initialState);
  const [dbReady,setDbReady] = useState(false);
  const {toast,showToast} = useToastHook();
  const adminPinRef = useRef(DEFAULT_PIN);
  const logoRef = useRef<HTMLInputElement>(null);
  const [schoolLogo,setSchoolLogo] = useState<string|null>(null);
  const [activeTab,setActiveTab] = useState("dashboard");
  const [menuOpen,setMenuOpen] = useState(false);
  const [showLogout,setShowLogout] = useState(false);
  const [showPrint,setShowPrint] = useState(false);
  const [dlg,setDlg] = useState<any>(null);
  const [showBin,setShowBin] = useState(false);
  const [auth,setAuth] = useState<any>({loggedIn:false,user:null});
  const [loginId,setLoginId] = useState("admin");
  const [loginPass,setLoginPass] = useState("");
  const [loginErr,setLoginErr] = useState("");
  const [forgotOpen,setForgotOpen] = useState(false);
  const [forgotStep,setForgotStep] = useState(1);
  const [forgotInput,setForgotInput] = useState("");
  const [dbSearch,setDbSearch] = useState(""); const [dbClass,setDbClass] = useState(""); const [dbDate,setDbDate] = useState(""); const [dbTerm,setDbTerm] = useState("current"); const [dbSession,setDbSession] = useState("current");
  const [rpSearch,setRpSearch] = useState(""); const [rpClass,setRpClass] = useState("All"); const [rpTerm,setRpTerm] = useState("current"); const [rpSession,setRpSession] = useState("current");
  const [activeReport,setActiveReport] = useState<any>(null);
  const [scoreForm,setScoreForm] = useState({studentName:"",studentClass:"",subject:"",caScore:"",examScore:""});

  const {entries,bin,logs,attendance,classRolls,staffList,schoolSettings} = appState;
  const isAdmin = !auth.user;
  const can = useCallback((p: string)=>isAdmin||(auth.user?.permissions?.[p]??false),[isAdmin,auth.user]);

  // DB load
  useEffect(()=>{
    const saved = loadDB();
    if(saved!==initialState){ 
      dispatch({type:"HYDRATE",payload:saved}); 
      if(saved.adminPin) {
        adminPinRef.current=saved.adminPin;
        // Auto-migrate plain-text PIN to hashed
        if(saved.adminPin.length<=8 && /^\d+$/.test(saved.adminPin)){
          hashPin(saved.adminPin).then(h=>{adminPinRef.current=h;});
        }
      }
    }
    setDbReady(true);
  },[]);

  // DB save
  useEffect(()=>{ if(dbReady) saveDB(appState,adminPinRef.current); },[appState,dbReady]);

  const subjectList = useMemo(()=>{ const cat=Object.values(CURRICULUM).find(c=>c.classes.includes(scoreForm.studentClass)); return cat?cat.subjects:[]; },[scoreForm.studentClass]);
  const allKnownStudents = useMemo(()=>{ const fromRolls=Object.entries(classRolls).flatMap(([cls,students]: any)=>students.filter((s: any)=>!s.suggested).map((s: any)=>({name:s.name,class:cls}))); const fromEntries=entries.map((e: any)=>({name:e.studentName,class:e.studentClass})); const map: any={}; [...fromRolls,...fromEntries].forEach((s: any)=>{map[`${s.name}||${s.class}`]=s;}); return Object.values(map); },[classRolls,entries]);
  const classSuggestions = useMemo(()=>{ if(!scoreForm.studentClass) return []; return (allKnownStudents as any[]).filter((s: any)=>s.class===scoreForm.studentClass).map((s: any)=>s.name).sort(); },[allKnownStudents,scoreForm.studentClass]);
  const allSessions = useMemo(()=>[...new Set(entries.map((e: any)=>e.session as string).filter(Boolean))] as string[]  ,[entries]);
  const activeTermEntries = useMemo(()=>{
    const t = rpTerm==="current"?schoolSettings.term:rpTerm==="all"?"":rpTerm;
    const s = rpSession==="current"?schoolSettings.session:rpSession==="all"?"":rpSession;
    return entries.filter((e: any)=>(!t||e.term===t)&&(!s||e.session===s));
  },[entries,rpTerm,rpSession,schoolSettings]);
  const studentList = useMemo(()=>{ const m: any={}; activeTermEntries.forEach((e: any)=>{const k=`${e.studentName}||${e.studentClass}`; if(!m[k])m[k]={name:e.studentName,class:e.studentClass,id:k};}); return Object.values(m) as any[]; },[activeTermEntries]);
  const filteredStudents = useMemo(()=>studentList.filter((s: any)=>s.name.toLowerCase().includes(rpSearch.toLowerCase())&&(rpClass==="All"||s.class===rpClass)),[studentList,rpSearch,rpClass]);
  const filteredEntries = useMemo(()=>{
    const t = dbTerm==="current"?schoolSettings.term:dbTerm==="all"?"":dbTerm;
    const s = dbSession==="current"?schoolSettings.session:dbSession==="all"?"":dbSession;
    return entries.filter((e: any)=>(!dbSearch||e.studentName.toLowerCase().includes(dbSearch.toLowerCase()))&&(!dbClass||e.studentClass===dbClass)&&(!dbDate||e.createdAt.slice(0,10)===dbDate)&&(!t||e.term===t)&&(!s||e.session===s));
  },[entries,dbSearch,dbClass,dbDate,dbTerm,dbSession,schoolSettings]);
  const curC = useMemo(()=>activeReport?(appState.comments[activeReport.id]||{teacher:"",principal:"",teacherSig:"",principalSig:"",daysOpen:"",daysPresent:"",daysAbsent:""}):{teacher:"",principal:"",teacherSig:"",principalSig:"",daysOpen:"",daysPresent:"",daysAbsent:""},[activeReport,appState.comments]);
  const attRate = useMemo(()=>{ const o=parseInt(curC.daysOpen)||0,p=parseInt(curC.daysPresent)||0; return o>0?Math.round(p/o*100):null; },[curC]);

  const navigate = useCallback((id: string)=>{setActiveTab(id);setMenuOpen(false);},[]);

  const TABS = useMemo(()=>[
    {id:"dashboard",label:"Dashboard",icon:LayoutDashboard,show:true,primary:true},
    {id:"entry",label:"Score Entry",icon:PlusCircle,show:can("scoreEntry"),primary:true},
    {id:"database",label:"Records",icon:Database,show:isAdmin||can("manageRecords")||can("scoreEntry"),primary:true},
    {id:"reports",label:"Reports",icon:FileText,show:can("viewReports"),primary:true},
    {id:"attendance",label:"Attendance",icon:CalendarDays,show:can("scoreEntry")||isAdmin,primary:false},
    {id:"staff",label:"Staff",icon:Users,show:isAdmin,primary:false},
    {id:"settings",label:"Settings",icon:Settings,show:isAdmin,primary:false},
  ].filter(t=>t.show),[can,isAdmin]);
  const primaryTabs = useMemo(()=>TABS.filter(t=>t.primary),[TABS]);
  const moreTabs    = useMemo(()=>TABS.filter(t=>!t.primary),[TABS]);

  const doLogin = useCallback(async()=>{
    setLoginErr("");
    if(loginId.toLowerCase()==="admin"){if(!loginPass)return setLoginErr("Enter a password");setAuth({loggedIn:true,user:null});return;}
    // Check staff with async PIN verification
    for(const st of staffList){
      if(st.name.toLowerCase()===loginId.toLowerCase()){
        const pinMatch=await verifyPin(loginPass,st.pin);
        if(pinMatch){
          if(st.status==="revoked")return setLoginErr("Your access has been revoked.");
          setAuth({loggedIn:true,user:st});
          if(st.status==="restricted")showToast("Account restricted — limited access.","warning");
          return;
        }
      }
    }
    setLoginErr("Invalid name or PIN");
  },[loginId,loginPass,staffList,showToast]);

  const submitScore = useCallback(()=>{
    const{studentName,studentClass,subject,caScore,examScore}=scoreForm;
    if(!studentName.trim()||!studentClass||!subject||caScore===""||examScore==="")return showToast("Fill in all fields.","error");
    if(entries.some((e: any)=>e.studentName.toLowerCase().trim()===studentName.toLowerCase().trim()&&e.studentClass===studentClass&&e.subject===subject&&e.term===schoolSettings.term&&e.session===schoolSettings.session))return showToast(`${subject} already exists for ${studentName} this term.`,"error");
    const ca=parseFloat(caScore)||0,ex=parseFloat(examScore)||0;
    if(ca<0||ca>40)return showToast("CA must be 0–40","error");
    if(ex<0||ex>60)return showToast("Exam must be 0–60","error");
    dispatch({type:"ADD_ENTRY",payload:{studentName:studentName.trim(),studentClass,subject,caScore:ca,examScore:ex,id:uid(),total:ca+ex,term:schoolSettings.term,session:schoolSettings.session,createdAt:new Date().toISOString()}});
    showToast("Score saved");
    setScoreForm(f=>({...f,caScore:"",examScore:""}));
  },[scoreForm,entries,showToast,schoolSettings]);

  const openReport = useCallback((student: any)=>{
    const t = rpTerm==="current"?schoolSettings.term:rpTerm==="all"?"":rpTerm;
    const s = rpSession==="current"?schoolSettings.session:rpSession==="all"?"":rpSession;
    const scopedEntries = entries.filter((e: any)=>(!t||e.term===t)&&(!s||e.session===s));
    const records=scopedEntries.filter((e: any)=>e.studentName.toLowerCase()===student.name.toLowerCase()&&e.studentClass===student.class);
    if(!records.length)return showToast("No records found","error");
    const names=[...new Set(scopedEntries.filter((e: any)=>e.studentClass===student.class).map((e: any)=>e.studentName.toLowerCase().trim()))];
    const standings=names.map(n=>({name:n,total:scopedEntries.filter((e: any)=>e.studentName.toLowerCase().trim()===n&&e.studentClass===student.class).reduce((a: number,c: any)=>a+c.total,0)})).sort((a,b)=>b.total-a.total);
    const pos=standings.findIndex(s=>s.name===student.name.toLowerCase().trim())+1;
    const total=records.reduce((a: number,c: any)=>a+c.total,0);
    const termLabel = t||schoolSettings.term; const sessionLabel = s||schoolSettings.session;
    setActiveReport({id:student.id,name:student.name,class:student.class,records,position:getOrdinal(pos),classCount:names.length,term:termLabel,session:sessionLabel,summary:{total,obtainable:records.length*100,avg:records.length?(total/records.length).toFixed(1):"0.0"}});
    setActiveTab("reports");
  },[entries,showToast,rpTerm,rpSession,schoolSettings]);

  const saveStaff = useCallback(async(sd: any)=>{
    const isEdit=appState.staffList.some((s: any)=>s.id===sd.id);
    // Hash the PIN if it's a new plain-text PIN
    let staffData = {...sd};
    if(staffData.pin && staffData.pin.length>=4 && staffData.pin.length<=8 && /^\d+$/.test(staffData.pin)){
      staffData.pin = await hashPin(staffData.pin);
    }
    dispatch({type:"SAVE_STAFF",payload:staffData});
    showToast(`${sd.name} ${isEdit?"updated":"created"}`);
    setDlg(null);
  },[appState.staffList,showToast]);

  const ctxValue = useMemo(()=>({state:appState,dispatch,showToast}),[appState,showToast]);

  // Loading screen
  if(!dbReady) return(
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4">
      <SchoolLogo logoUrl={schoolLogo} size="lg"/>
      <div className="flex items-center gap-2 text-slate-500">
        <span className="w-4 h-4 border-2 border-slate-400 border-t-primary rounded-full animate-spin"/>
        <p className="text-sm font-bold uppercase tracking-widest">Loading…</p>
      </div>
    </div>
  );

  // Forgot password
  if(!auth.loggedIn&&forgotOpen) return(
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-amber-500">
        <div className="text-center mb-6"><div className="inline-flex p-3 bg-amber-100 rounded-2xl mb-3"><ShieldAlert size={28} className="text-amber-600"/></div><h2 className="text-xl font-black text-slate-900">Password Recovery</h2></div>
        {forgotStep===1?<div className="space-y-4"><div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 font-medium">Enter the school name to verify identity.</div><Inp label="Registered School Name" value={forgotInput} onChange={(e: any)=>setForgotInput(e.target.value)} placeholder={schoolSettings.name} onKeyDown={(e: any)=>e.key==="Enter"&&(forgotInput.toLowerCase()===schoolSettings.name.toLowerCase()?setForgotStep(2):showToast("Name doesn't match","error"))}/><Btn variant="primary" size="lg" className="w-full" onClick={()=>forgotInput.toLowerCase()===schoolSettings.name.toLowerCase()?setForgotStep(2):showToast("Name doesn't match","error")}>Verify</Btn><button onClick={()=>{setForgotOpen(false);setForgotStep(1);setForgotInput("");}} className="w-full text-xs font-black uppercase text-slate-400 hover:text-slate-600 py-2">← Back to Login</button></div>:
        <div className="space-y-4"><div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-3"><Check size={28} className="text-emerald-500 mx-auto"/><p className="text-xs font-black uppercase text-emerald-700">Verified</p><p className="text-xs text-slate-500">Admin accepts any non-empty password. Staff: full name + PIN.</p><div className="bg-white border border-emerald-200 rounded-lg p-3"><p className="text-xs text-slate-400 font-bold uppercase mb-1">Admin Action PIN</p><p className="text-3xl font-black text-slate-900 tracking-widest">1234</p></div></div><Btn variant="ghost" size="lg" className="w-full" onClick={()=>{setForgotOpen(false);setForgotStep(1);setForgotInput("");}}>Back to Login</Btn></div>}
      </Card>
      {toast&&<Toast toast={toast}/>}
    </div>
  );

  // Login
  if(!auth.loggedIn) return(
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-primary">
        <div className="text-center mb-8"><SchoolLogo logoUrl={schoolLogo} size="lg" className="mx-auto mb-4"/><h1 className="text-xl font-black text-slate-900">{schoolSettings.name}</h1><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Staff Authentication</p></div>
        <div className="space-y-4">
          <Inp label="Name / Username" value={loginId} onChange={(e: any)=>{setLoginId(e.target.value);setLoginErr("");}} placeholder="admin or staff full name"/>
          <Field label="Password / PIN" error={loginErr}><input type="password" value={loginPass} onChange={(e: any)=>{setLoginPass(e.target.value);setLoginErr("");}} onKeyDown={(e: any)=>e.key==="Enter"&&doLogin()} placeholder="••••••••" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm focus:border-primary focus:bg-white outline-none transition-all"/></Field>
          <div className="text-right -mt-1"><button onClick={()=>setForgotOpen(true)} className="text-xs font-black uppercase text-primary hover:opacity-80">Forgot Password?</button></div>
          <Btn variant="primary" size="lg" className="w-full" onClick={doLogin}>Launch Portal</Btn>
          <p className="text-xs text-slate-400 text-center">Admin: <code className="font-black bg-slate-100 px-1 rounded">admin</code> + any password · Staff: full name + PIN</p>
        </div>
      </Card>
      {toast&&<Toast toast={toast}/>}
    </div>
  );

  return(
    <AppCtx.Provider value={ctxValue}>
      <div className="flex h-screen overflow-hidden bg-slate-100">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 flex-shrink-0">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3"><SchoolLogo logoUrl={schoolLogo} size="sm"/><div className="min-w-0"><p className="font-black text-sm text-slate-900 truncate">{schoolSettings.name}</p><p className="text-xs text-slate-400">{schoolSettings.term}</p></div></div>
          <div className="px-4 py-3 border-b border-slate-100"><div className={`flex items-center gap-2.5 p-2.5 rounded-xl ${isAdmin?"bg-blue-50":"bg-slate-50"}`}><div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin?"bg-primary":"bg-indigo-500"}`}>{isAdmin?<Shield size={14}/>:<span className="font-black text-xs">{auth.user.name[0]}</span>}</div><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-900 truncate">{isAdmin?"Super Admin":auth.user.name}</p><p className="text-xs text-slate-400 truncate">{isAdmin?"Full Access":auth.user.role}</p></div>{auth.user&&<StatusPill status={auth.user.status}/>}</div></div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {TABS.map(t=><button key={t.id} onClick={()=>navigate(t.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab===t.id?"bg-blue-50 text-primary":"text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}><t.icon size={18} className="flex-shrink-0"/><span className="text-sm font-bold">{t.label}</span>{t.id==="database"&&bin.length>0&&<span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>}</button>)}
          </nav>
          <div className="p-3 border-t border-slate-100"><button onClick={()=>setShowLogout(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-sm group"><LogOut size={18} className="group-hover:translate-x-0.5 transition-transform"/>Sign Out</button></div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0 z-40 relative">
            <div className="flex items-center gap-2.5"><SchoolLogo logoUrl={schoolLogo} size="xs"/><p className="font-black text-sm text-slate-900 truncate max-w-[160px]">{schoolSettings.name}</p></div>
            <div className="flex items-center gap-1">
              <button onClick={()=>setShowLogout(true)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"><LogOut size={18}/></button>
              <button onClick={()=>setMenuOpen(o=>!o)} className={`p-2 rounded-lg transition-all ${menuOpen?"bg-primary text-white":"text-slate-500 hover:bg-slate-100"}`}><Menu size={20}/></button>
            </div>
          </header>

          {/* Mobile dropdown */}
          {menuOpen&&<div className="md:hidden absolute top-[57px] left-0 right-0 bg-white border-b border-slate-100 shadow-xl z-50 px-4 py-3 space-y-1">
            <div className={`flex items-center gap-2.5 p-3 rounded-xl mb-3 ${isAdmin?"bg-blue-50":"bg-slate-50"}`}><div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin?"bg-primary":"bg-indigo-500"}`}>{isAdmin?<Shield size={14}/>:<span className="font-black text-xs">{auth.user.name[0]}</span>}</div><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-900 truncate">{isAdmin?"Super Admin":auth.user.name}</p><p className="text-xs text-slate-400">{isAdmin?"Full Access":auth.user.role}</p></div>{auth.user&&<StatusPill status={auth.user.status}/>}</div>
            {TABS.map(t=><button key={t.id} onClick={()=>navigate(t.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab===t.id?"bg-blue-50 text-primary font-black":"text-slate-600 font-bold hover:bg-slate-50"}`}><t.icon size={18} className="flex-shrink-0"/><span className="text-sm">{t.label}</span></button>)}
            <div className="pt-2 border-t border-slate-100"><button onClick={()=>{setShowLogout(true);setMenuOpen(false);}} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"><LogOut size={18}/>Sign Out</button></div>
          </div>}

          {/* Main */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8" onClick={()=>menuOpen&&setMenuOpen(false)}>
            <div className="max-w-5xl mx-auto space-y-6 pb-8">

              {/* DASHBOARD */}
              {activeTab==="dashboard"&&<>
                <div><h1 className="text-2xl font-black text-slate-900 uppercase">Dashboard</h1><p className="text-sm text-slate-400 mt-0.5">{schoolSettings.term} · {schoolSettings.session}</p></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([["Students (Term)",activeTermEntries.length>0?studentList.length:0,"border-l-blue-500"],["Records (Term)",activeTermEntries.length,"border-l-emerald-500"],["Active Staff",`${staffList.filter((s: any)=>s.status==="active").length}/${staffList.length}`,"border-l-indigo-500"]] as const).map(([l,v,a])=><Card key={l} className={`p-5 border-l-4 ${a}`}><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-1">{l}</p><p className="text-2xl font-black text-slate-900">{v}</p></Card>)}
                  <Card className="p-5 bg-slate-900 border-slate-900 col-span-2 md:col-span-1"><p className="text-xs font-black uppercase text-blue-400 tracking-wide mb-1">Session</p><p className="text-lg font-black text-white leading-tight">{schoolSettings.session||"—"}</p><p className="text-xs text-slate-400 mt-1 font-bold">{schoolSettings.term||"—"}</p></Card>
                </div>
                {logs.length>0&&<Card><div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2"><Clock size={14} className="text-slate-400"/><p className="text-sm font-black uppercase text-slate-600">Activity Log</p></div><div className="divide-y divide-slate-50">{logs.slice(0,8).map((log: any)=>{const{date,time}=fmtTs(log.ts);const ac=log.action==="Deleted"?"bg-red-100 text-red-600":log.action==="Restored"?"bg-emerald-100 text-emerald-700":log.action.includes("Revok")?"bg-orange-100 text-orange-700":"bg-blue-100 text-blue-700";return<div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="flex items-center gap-3 min-w-0"><span className={`text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 ${ac}`}>{log.action}</span><div className="min-w-0"><p className="text-xs font-black text-slate-900 truncate">{log.student}</p><p className="text-xs text-slate-500 truncate">{log.subject}{log.detail&&` · ${log.detail}`}</p></div></div><div className="text-right flex-shrink-0"><p className="text-xs font-bold text-slate-500">{time}</p><p className="text-xs text-slate-400">{date}</p></div></div>; })}</div></Card>}
              </>}

              {/* SCORE ENTRY */}
              {activeTab==="entry"&&can("scoreEntry")&&<div className="max-w-xl mx-auto">
                <Card className="overflow-hidden">
                  <div className="bg-primary px-6 py-4 flex items-center gap-3"><BookOpen size={18} className="text-white/80"/><div><p className="text-white font-black uppercase tracking-widest text-sm">Score Submission</p><p className="text-white/60 text-xs">{schoolSettings.term} · {schoolSettings.session}</p></div></div>
                  <div className="p-6 space-y-5">
                    <div className="space-y-1.5"><label className="block text-xs font-black uppercase text-slate-400 tracking-wide">Student Name</label><input list="student-suggestions" value={scoreForm.studentName} onChange={(e: any)=>setScoreForm(f=>({...f,studentName:e.target.value}))} placeholder="Student full name" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-primary focus:bg-white outline-none transition-all"/><datalist id="student-suggestions">{classSuggestions.map((n: string)=><option key={n} value={n}/>)}</datalist>{classSuggestions.length>0&&<p className="text-xs text-primary font-bold">{classSuggestions.length} students on roll</p>}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <Sel label="Class" value={scoreForm.studentClass} onChange={(e: any)=>setScoreForm(f=>({...f,studentClass:e.target.value,subject:""}))}><option value="">Select class</option>{(auth.user?.assignedClasses?.length?auth.user.assignedClasses:ALL_CLASSES).map((c: string)=><option key={c}>{c}</option>)}</Sel>
                      <Sel label="Subject" value={scoreForm.subject} onChange={(e: any)=>setScoreForm(f=>({...f,subject:e.target.value}))} disabled={!scoreForm.studentClass}><option value="">Select subject</option>{subjectList.map(s=><option key={s}>{s}</option>)}</Sel>
                    </div>
                    <div className="grid grid-cols-2 gap-4">{([["caScore","CA Score (max 40)",40],["examScore","Exam Score (max 60)",60]] as const).map(([field,label,max])=><div key={field} className="space-y-1.5"><label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label><input type="number" min="0" max={max} step="0.5" value={(scoreForm as any)[field]} placeholder={`0–${max}`} onChange={(e: any)=>{const v=e.target.value;if(v===""||( +v>=0&& +v<=max))setScoreForm(f=>({...f,[field]:v}));}} onKeyDown={(e: any)=>["-","e","E","+"].includes(e.key)&&e.preventDefault()} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-lg focus:border-primary focus:bg-white outline-none transition-all"/></div>)}</div>
                    {(scoreForm.caScore!==""||scoreForm.examScore!=="")&&(()=>{const t=(+scoreForm.caScore||0)+(+scoreForm.examScore||0);const g=getGrade(t);return<div className="bg-slate-50 rounded-xl p-4 text-center border-2 border-slate-100"><p className="text-xs font-black uppercase text-slate-400 mb-1">Total Preview</p><p className="text-4xl font-black text-slate-900">{t}<span className="text-lg text-slate-400">/100</span></p><span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-black uppercase" style={{background:g.bg,color:g.color}}>{g.grade} — {g.remark}</span></div>; })()}
                    <div className="grid grid-cols-2 gap-3 pt-1"><Btn variant="ghost" onClick={()=>{setScoreForm({studentName:"",studentClass:"",subject:"",caScore:"",examScore:""});showToast("Form cleared");}}>Clear</Btn><Btn variant="primary" onClick={submitScore}><Check size={14}/>Save Grade</Btn></div>
                  </div>
                </Card>
              </div>}

              {/* RECORDS */}
              {activeTab==="database"&&<>
                <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-black text-slate-900 uppercase">Records</h1><p className="text-sm text-slate-400">{filteredEntries.length} shown · {bin.length} in bin</p></div>{(isAdmin||can("manageRecords"))&&<Btn variant={showBin?"primary":"outline"} onClick={()=>setShowBin(b=>!b)}><RotateCcw size={14}/>{showBin?"View Active":`Bin${bin.length?` (${bin.length})`:""}`}</Btn>}</div>
                {!showBin&&<Card className="p-4 space-y-3"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={dbSearch} onChange={(e: any)=>setDbSearch(e.target.value)} placeholder="Search by name…" className="w-full pl-9 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary focus:bg-white outline-none"/></div><select value={dbClass} onChange={(e: any)=>setDbClass(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"><option value="">All Classes</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</select><input type="date" value={dbDate} onChange={(e: any)=>setDbDate(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"/></div>
                <div className="grid grid-cols-2 gap-3"><select value={dbTerm} onChange={(e: any)=>setDbTerm(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"><option value="current">Current Term ({schoolSettings.term})</option><option value="all">All Terms</option>{TERMS.map(t=><option key={t} value={t}>{t}</option>)}</select><select value={dbSession} onChange={(e: any)=>setDbSession(e.target.value)} className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none"><option value="current">Current Session ({schoolSettings.session})</option><option value="all">All Sessions</option>{allSessions.map(s=><option key={s} value={s}>{s}</option>)}</select></div></Card>}
                {!showBin&&(filteredEntries.length===0?<EmptyState icon={Database} title="No records for this term" subtitle="Switch term filter or add scores" action={<Btn variant="ghost" size="sm" onClick={()=>{setDbSearch("");setDbClass("");setDbDate("");setDbTerm("all");setDbSession("all");}}>Show All</Btn>}/>:
                <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr>{["Student","Class","Subject","CA","Exam","Total","Grade","Term","Logged"].map((h,i)=><th key={i} className={`px-4 py-3 text-xs font-black uppercase text-slate-400 ${[3,4,5,6].includes(i)?"text-center":""}`}>{h}</th>)}{(isAdmin||can("manageRecords"))&&<th className="px-4 py-3"/>}</tr></thead><tbody className="divide-y divide-slate-50">{filteredEntries.map((e: any)=>{const g=getGrade(e.total);const{date,time}=fmtTs(e.createdAt);return<tr key={e.id} className="hover:bg-slate-50 transition-colors"><td className="px-4 py-3 font-black text-sm text-slate-900">{e.studentName}</td><td className="px-4 py-3 text-xs font-bold text-slate-600">{e.studentClass}</td><td className="px-4 py-3 text-xs font-bold text-primary">{e.subject}</td><td className="px-4 py-3 text-xs font-bold text-center">{e.caScore}</td><td className="px-4 py-3 text-xs font-bold text-center">{e.examScore}</td><td className="px-4 py-3 text-sm font-black text-center">{e.total}</td><td className="px-4 py-3 text-center"><span className="text-xs font-black px-2 py-0.5 rounded-md" style={{background:g.bg,color:g.color}}>{g.grade}</span></td><td className="px-4 py-3"><span className="text-xs font-bold text-slate-500">{e.term||"—"}</span></td><td className="px-4 py-3"><p className="text-xs font-bold text-slate-600">{time}</p><p className="text-xs text-slate-400">{date}</p></td>{(isAdmin||can("manageRecords"))&&<td className="px-4 py-3 text-center"><button onClick={()=>setDlg({type:"delete",data:e})} className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all"><Trash2 size={14}/></button></td>}</tr>; })}</tbody></table></div></Card>)}
                {showBin&&(bin.length===0?<EmptyState icon={RotateCcw} title="Recycle bin is empty"/>:
                <Card className="overflow-hidden border-amber-200"><div className="bg-amber-50 px-5 py-3 border-b border-amber-100 flex items-center gap-2"><AlertTriangle size={13} className="text-amber-500"/><p className="text-xs font-black uppercase text-amber-700">Recycle Bin — {bin.length} item{bin.length!==1?"s":""}</p></div><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr>{["Student","Class","Subject","Total","Created","Deleted",""].map((h,i)=><th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-50">{bin.map((e: any)=>{const g=getGrade(e.total);const cr=fmtTs(e.createdAt);const dl=fmtTs(e.deletedAt);return<tr key={e.id} className="hover:bg-amber-50 transition-colors"><td className="px-4 py-3 font-black text-sm text-slate-700">{e.studentName}</td><td className="px-4 py-3 text-xs font-bold text-slate-500">{e.studentClass}</td><td className="px-4 py-3 text-xs font-bold text-slate-400 line-through">{e.subject}</td><td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-md" style={{background:g.bg,color:g.color}}>{e.total} · {g.grade}</span></td><td className="px-4 py-3"><p className="text-xs font-bold text-slate-500">{cr.time}</p><p className="text-xs text-slate-400">{cr.date}</p></td><td className="px-4 py-3"><p className="text-xs font-bold text-red-400">{dl.time}</p><p className="text-xs text-red-300">{dl.date}</p></td><td className="px-4 py-3"><button onClick={()=>setDlg({type:"restore",data:e})} className="p-1.5 rounded-lg text-emerald-500 hover:text-white hover:bg-emerald-500 transition-all"><RotateCcw size={14}/></button></td></tr>; })}</tbody></table></div></Card>)}
              </>}

              {/* REPORTS */}
              {activeTab==="reports"&&can("viewReports")&&(!activeReport?<>
                <div><h1 className="text-2xl font-black text-slate-900 uppercase">Reports</h1><p className="text-sm text-slate-400">{filteredStudents.length} students · {rpTerm==="current"?schoolSettings.term:rpTerm==="all"?"All Terms":rpTerm}</p></div>
                <div className="flex flex-col sm:flex-row gap-3 flex-wrap"><div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={rpSearch} onChange={(e: any)=>setRpSearch(e.target.value)} placeholder="Search student…" className="w-full pl-9 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none shadow-sm"/></div><select value={rpClass} onChange={(e: any)=>setRpClass(e.target.value)} className="px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none shadow-sm"><option value="All">All Classes</option>{ALL_CLASSES.map(c=><option key={c}>{c}</option>)}</select><select value={rpTerm} onChange={(e: any)=>setRpTerm(e.target.value)} className="px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none shadow-sm"><option value="current">Current Term</option><option value="all">All Terms</option>{TERMS.map(t=><option key={t} value={t}>{t}</option>)}</select><select value={rpSession} onChange={(e: any)=>setRpSession(e.target.value)} className="px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-primary outline-none shadow-sm"><option value="current">Current Session</option><option value="all">All Sessions</option>{allSessions.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                {rpClass!=="All"&&filteredStudents.length>0&&<Card className="p-4"><div className="flex items-center justify-between flex-wrap gap-3"><p className="text-xs font-black uppercase text-slate-500">Bulk Export — {rpClass}</p><div className="flex gap-2 flex-wrap">
                  <Btn variant="outline" size="sm" onClick={()=>{const t=rpTerm==="current"?schoolSettings.term:rpTerm;const s=rpSession==="current"?schoolSettings.session:rpSession;const r=exportClassResultsExcel(entries,rpClass,t,s,schoolSettings.name);if(r)showToast("Class results Excel downloaded");else showToast("No records for this class/term","error");}}><FileSpreadsheet size={13}/>Class Results Excel</Btn>
                  <Btn variant="outline" size="sm" onClick={()=>{const t=rpTerm==="current"?schoolSettings.term:rpTerm;const s=rpSession==="current"?schoolSettings.session:rpSession;const count=exportBulkPDFs(entries,rpClass,t,s,schoolSettings,appState.comments,attendance);if(count)showToast(`${count} PDF reports downloaded`);else showToast("No records found","error");}}><Download size={13}/>All PDFs ({filteredStudents.filter((st: any)=>st.class===rpClass).length})</Btn>
                </div></div></Card>}
                {filteredStudents.length===0?<EmptyState icon={FileText} title="No students found for this term" subtitle="Switch term or add scores" action={<Btn variant="ghost" size="sm" onClick={()=>{setRpTerm("all");setRpSession("all");}}>Show All Terms</Btn>}/>:<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filteredStudents.map((s: any)=><button key={s.id} onClick={()=>openReport(s)} className="p-5 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-between text-left group hover:border-blue-400 hover:shadow-md transition-all"><div><p className="font-black text-sm uppercase text-slate-900">{s.name}</p><p className="text-xs font-bold text-slate-400 mt-0.5">{s.class}</p></div><FileText size={18} className="text-slate-300 group-hover:text-primary transition-colors"/></button>)}</div>}
              </>:
              <div className="space-y-5 max-w-3xl mx-auto">
                <button onClick={()=>setActiveReport(null)} className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors"><X size={13}/>Back to Students</button>
                <Card className="overflow-hidden"><div className="bg-primary px-6 py-4 flex items-center gap-3"><PenTool size={16} className="text-white/80"/><p className="text-white font-black uppercase tracking-widest text-sm">Report Editor — {activeReport.name}</p></div>
                <div className="p-6 space-y-5">
                  <div><p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Attendance</p><div className="grid grid-cols-3 gap-3">{([["daysOpen","Days Opened","slate"],["daysPresent","Days Present","emerald"],["daysAbsent","Days Absent","red"]] as const).map(([f,l,c])=><div key={f}><label className="block text-xs font-black uppercase text-slate-400 mb-1.5">{l}</label><input type="number" min="0" max="365" placeholder="0" value={curC[f]||""} onChange={(e: any)=>{const v=e.target.value;if(v===""||( +v>=0&& +v<=365))dispatch({type:"SET_COMMENT",studentId:activeReport.id,field:f,value:v});}} onKeyDown={(e: any)=>["-","e","E","+"].includes(e.key)&&e.preventDefault()} className={`w-full px-3 py-3 rounded-xl border-2 font-black text-center text-xl outline-none transition-all ${c==="emerald"?"bg-emerald-50 border-emerald-100 focus:border-emerald-400":c==="red"?"bg-red-50 border-red-100 focus:border-red-400":"bg-slate-50 border-slate-100 focus:border-slate-400"}`}/></div>)}</div>{attRate!==null&&<p className={`mt-2 text-center text-sm font-black ${attRate>=75?"text-emerald-600":"text-red-500"}`}>Attendance Rate: {attRate}% {attRate>=75?"✓":"⚠"}</p>}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{([["teacher","Class Teacher's Remark","teacherSig","Teacher Signature"],["principal","Principal's Remark","principalSig","Principal's Signature"]] as const).map(([f,l,sf,sl])=><div key={f} className="space-y-2"><label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{l}</label><textarea value={curC[f]||""} onChange={(e: any)=>dispatch({type:"SET_COMMENT",studentId:activeReport.id,field:f,value:e.target.value})} rows={3} placeholder="Enter remark…" className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium focus:border-primary outline-none resize-none"/><input value={curC[sf]||""} onChange={(e: any)=>dispatch({type:"SET_COMMENT",studentId:activeReport.id,field:sf,value:e.target.value})} placeholder={sl} className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black uppercase tracking-wide focus:border-primary outline-none"/></div>)}</div>
                  {can("printReports")&&<Btn variant="primary" size="lg" className="w-full" onClick={()=>setShowPrint(true)}><Printer size={16}/>Print / Export Report</Btn>}
                </div></Card>
                <ReportSheet report={activeReport} curC={curC} attRate={attRate} schoolLogo={schoolLogo} schoolSettings={schoolSettings}/>
              </div>)}

              {/* ATTENDANCE */}
              {activeTab==="attendance"&&(can("scoreEntry")||isAdmin)&&<AttendanceTab/>}

              {/* STAFF */}
              {activeTab==="staff"&&isAdmin&&<StaffTab dispatch={dispatch} showToast={showToast} setDlg={setDlg} staffList={staffList}/>}

              {/* SETTINGS */}
              {activeTab==="settings"&&isAdmin&&<SettingsTab logoUrl={schoolLogo} setSchoolLogo={setSchoolLogo} logoRef={logoRef} showToast={showToast} adminPinRef={adminPinRef}/>}

            </div>
          </main>

          {/* Mobile bottom nav */}
          <nav className="md:hidden bg-white border-t border-slate-100 flex-shrink-0 z-40" style={{paddingBottom:"env(safe-area-inset-bottom)"}}>
            <div className="flex items-stretch">
              {primaryTabs.map(t=><button key={t.id} onClick={()=>navigate(t.id)} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-all ${activeTab===t.id?"text-primary":"text-slate-400"}`}><div className={`p-1.5 rounded-xl ${activeTab===t.id?"bg-blue-50":""}`}><t.icon size={20}/></div><span className="text-xs font-bold">{t.label.split(" ")[0]}</span></button>)}
              {moreTabs.length>0&&<button onClick={()=>setMenuOpen(o=>!o)} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-all ${moreTabs.some(t=>t.id===activeTab)||menuOpen?"text-primary":"text-slate-400"}`}><div className={`p-1.5 rounded-xl ${moreTabs.some(t=>t.id===activeTab)||menuOpen?"bg-blue-50":""}`}><MoreVertical size={20}/></div><span className="text-xs font-bold">More</span></button>}
            </div>
          </nav>
        </div>
      </div>

      {/* Modals */}
      {showPrint&&activeReport&&<PrintDialog student={activeReport} schoolName={schoolSettings.name} schoolSettings={schoolSettings} curC={curC} attRate={attRate} onClose={()=>setShowPrint(false)}/>}
      {dlg?.type==="staffAdd"&&<StaffDialog mode="add" onSave={saveStaff} onClose={()=>setDlg(null)}/>}
      {dlg?.type==="staffEdit"&&<StaffDialog mode="edit" staff={dlg.data} onSave={saveStaff} onClose={()=>setDlg(null)}/>}
      {dlg?.type==="delete"&&<PinAuth title="Delete Record" subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`} headerColor="bg-destructive" icon={Trash2} confirmLabel={<><Trash2 size={13}/>Delete</>} confirmVariant="danger" correctPin={adminPinRef.current} onConfirm={()=>{dispatch({type:"DELETE_ENTRY",id:dlg.data.id});showToast("Moved to bin");setDlg(null);}} onCancel={()=>setDlg(null)}><div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3"><AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5"/><div className="text-xs text-red-700"><p className="font-black uppercase mb-1">Deleting:</p><p className="font-bold">{dlg.data.subject} — {dlg.data.studentName}</p><p className="text-red-400">Score: {dlg.data.caScore}+{dlg.data.examScore}={dlg.data.total}</p></div></div></PinAuth>}
      {dlg?.type==="restore"&&<PinAuth title="Restore Record" subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`} headerColor="bg-emerald-600" icon={RotateCcw} confirmLabel={<><RotateCcw size={13}/>Restore</>} confirmVariant="success" correctPin={adminPinRef.current} onConfirm={()=>{dispatch({type:"RESTORE_ENTRY",id:dlg.data.id});showToast("Restored");setDlg(null);}} onCancel={()=>setDlg(null)}><div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3"><RotateCcw size={15} className="text-emerald-500 flex-shrink-0 mt-0.5"/><p className="text-xs text-emerald-700"><strong>{dlg.data.subject}</strong> — {dlg.data.studentName} will be restored.</p></div></PinAuth>}
      {dlg?.type==="revoke"&&<PinAuth title="Revoke Access" subtitle={dlg.data.name} headerColor="bg-destructive" icon={UserX} confirmLabel={<><UserX size={13}/>Revoke</>} confirmVariant="danger" correctPin={adminPinRef.current} onConfirm={()=>{dispatch({type:"SET_STAFF_STATUS",id:dlg.data.id,status:"revoked"});showToast(`${dlg.data.name}'s access revoked`);setDlg(null);}} onCancel={()=>setDlg(null)}><div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3"><AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5"/><p className="text-xs text-red-700 font-medium"><strong>{dlg.data.name}</strong> will lose access immediately.</p></div></PinAuth>}
      {showLogout&&<Sheet onClose={()=>setShowLogout(false)}><MHead icon={LogOut} title="Sign Out" subtitle="You are about to leave the portal" color="bg-slate-900" onClose={()=>setShowLogout(false)}/><div className="p-5 space-y-4"><div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3"><AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5"/><p className="text-sm text-slate-600 font-medium">Unsaved changes will be lost. Are you sure?</p></div><div className="grid grid-cols-2 gap-3"><Btn variant="ghost" size="lg" onClick={()=>setShowLogout(false)}>Stay</Btn><Btn variant="danger" size="lg" onClick={()=>{setAuth({loggedIn:false,user:null});setLoginId("admin");setLoginPass("");setShowLogout(false);setActiveTab("dashboard");setActiveReport(null);setMenuOpen(false);}}><LogOut size={15}/>Sign Out</Btn></div></div></Sheet>}

      {toast&&<Toast toast={toast}/>}
      <style>{`@media print{aside,nav,header{display:none!important;}main{padding:0!important;overflow:visible!important;height:auto!important;}#printable-report{box-shadow:none!important;border-radius:0!important;}@page{size:A4 portrait;margin:12mm;}}`}</style>
    </AppCtx.Provider>
  );
}
