import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportTemplateConfig {
  uploadedFile: string | null;
  uploadedFileName: string | null;
  headerColor: string;
  accentColor: string;
  fontFamily: string;
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
  stampUrl?: string | null;
}

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
  stampUrl: null,
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

interface ResultData {
  school: { name: string; code: string; logo: string | null; address: string; email: string | null; report_settings?: any };
  student: { name: string; admission_no: string; class: string; gender: string | null; photo: string | null };
  term: string;
  academic_year: string;
  results: { subject: string; ca1: number | null; ca2: number | null; exam: number | null; total: number | null; grade: string | null; remark: string | null; comment: string | null }[];
  summary: { average: string; total_subjects: number; position_in_class: number | null; total_score: number | null };
  report_card: { teacher_remark: string | null; principal_remark: string | null; days_open: number | null; days_present: number | null; days_absent: number | null; signature: string | null; traits?: any } | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const termLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1) + " Term";

const gradeColor = (g: string | null) => {
  if (!g) return "#64748b";
  if (g === "A1" || g === "A") return "#16a34a";
  if (g === "B2" || g === "B3" || g === "B") return "#2563eb";
  if (g === "C4" || g === "C5" || g === "C6" || g === "C") return "#d97706";
  return "#dc2626";
};

// ── Main Component ─────────────────────────────────────────────────────────────
//  AutoStamp Component 
const AutoStamp = ({ schoolName, date, color = "#1e40af" }: { schoolName: string; date: string; color?: string }) => {
  const sn = (schoolName || "SCHOOL NAME").toUpperCase();
  const fs = sn.length > 45 ? 3.5 : sn.length > 35 ? 4.2 : sn.length > 28 ? 5.2 : sn.length > 20 ? 6.5 : 7.8;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-6deg)', opacity: 0.85, mixBlendMode: 'multiply' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <path id="top-arc-rc" d="M 11,50 A 39,39 0 1,1 89,50" fill="transparent" />
          <path id="bottom-arc-rc" d="M 11,50 A 39,39 0 0,0 89,50" fill="transparent" />
        </defs>
        
        {/* Concentric Borders */}
        <circle cx="50" cy="50" r="48.5" stroke={color} strokeWidth="1.6" fill="none" />
        <circle cx="50" cy="50" r="46" stroke={color} strokeWidth="0.6" fill="none" />
        <circle cx="50" cy="50" r="30" stroke={color} strokeWidth="1" fill="none" />

        {/* Dynamic Upper School Name Arc */}
        <text fill={color} fontSize={fs} fontWeight="bold" letterSpacing={sn.length > 35 ? "0.5" : "1"} textAnchor="middle">
          <textPath href="#top-arc-rc" startOffset="50%">&#9733; {sn} &#9733;</textPath>
        </text>

        {/* Lower Institutional Descriptor Arc */}
        <text fill={color} fontSize="6" fontWeight="bold" letterSpacing="1.2" textAnchor="middle">
          <textPath href="#bottom-arc-rc" startOffset="50%">OFFICIAL ACADEMIC REPORT</textPath>
        </text>

        {/* Center Inner Core: Status & Date */}
        <text x="50" y="44" fill={color} fontSize="4.5" fontWeight="bold" letterSpacing="1.5" textAnchor="middle" opacity="0.8">
          APPROVED &amp; ISSUED
        </text>
        <line x1="34" y1="47.5" x2="66" y2="47.5" stroke={color} strokeWidth="0.5" opacity="0.6" />
        <text x="50" y="56" fill={color} fontSize="8.5" fontWeight="900" letterSpacing="0.8" textAnchor="middle">
          {date}
        </text>
      </svg>
    </div>
  );
};

export default function ResultChecker() {
  const { schoolCode } = useParams<{ schoolCode: string }>();
  const [searchParams] = useSearchParams();

  const [admissionNo, setAdmissionNo] = useState(searchParams.get("exam") ?? "");
  const [token, setToken]             = useState(searchParams.get("token") ?? "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [result, setResult]           = useState<ResultData | null>(null);
  const [alreadyUsed, setAlreadyUsed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const checkResult = useCallback(async (adm: string, tok: string) => {
    if (!adm.trim() || !tok.trim() || !schoolCode) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAlreadyUsed(false);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/check-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          school_code:  schoolCode.toUpperCase(),
          admission_no: adm.trim(),
          token:        tok.trim().toUpperCase(),
        }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        if (data.already_used) setAlreadyUsed(true);
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => {
    const urlExam  = searchParams.get("exam");
    const urlToken = searchParams.get("token");
    if (urlExam && urlToken && schoolCode) {
      checkResult(urlExam, urlToken);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkResult(admissionNo, token);
  };

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    const element = document.getElementById('report-print-area');
    if (!element || !result) return;
    
    try {
      setDownloading(true);
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Result_${result.student.name.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error("Failed to generate PDF", e);
    } finally {
      setDownloading(false);
    }
  };

  // Extract settings if available
  let tpl: ReportTemplateConfig = DEFAULT_REPORT_TEMPLATE;
  let schoolSettings: any = {};
  if (result?.school?.report_settings) {
    schoolSettings = result.school.report_settings;
    if (schoolSettings.reportTemplate) {
      tpl = { ...DEFAULT_REPORT_TEMPLATE, ...schoolSettings.reportTemplate };
    }
  }

  const traits = result?.report_card?.traits || {};
  const headers = tpl.showGrade
    ? ["Subject", "CA1", "CA2", "Exam", "Total", "Grade", "Remark"]
    : ["Subject", "CA1", "CA2", "Exam", "Total"];

  const studentFields = [
    ["Student", result?.student.name || "", "font-black text-blue-700"],
    ["Class", result?.student.class || "", ""],
    ...(tpl.showPosition ? [
      ["Position", result?.summary.position_in_class ? `${result.summary.position_in_class}` : "—", "font-black text-emerald-700"], 
      ["Average", result?.summary.average ? `${result.summary.average}%` : "—", "font-black text-blue-700"]
    ] : []),
  ];

  const remarkSections = [
    ...(tpl.showTeacherRemark ? [["teacher", "Class Teacher's Remark", "teacherSig", "teacher"] as const] : []),
    ...(tpl.showPrincipalRemark ? [["principal", "Principal's Remark", "principalSig", "principal"] as const] : []),
  ];

  const attRate = result?.report_card?.days_open && result?.report_card?.days_present 
    ? Math.round((result.report_card.days_present / result.report_card.days_open) * 100) 
    : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #0f172a; min-height: 100vh; }
        .rc-page { min-height: 100vh; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%); padding: 24px 16px; display: flex; flex-direction: column; align-items: center; }
        .rc-header { text-align: center; margin-bottom: 32px; }
        .rc-logo-ring { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; box-shadow: 0 0 32px rgba(99,102,241,0.4); font-size: 32px; }
        .rc-title { font-size: 28px; font-weight: 900; color: #fff; letter-spacing: -0.5px; }
        .rc-subtitle { font-size: 14px; color: #94a3b8; margin-top: 6px; font-weight: 500; }
        .rc-card { background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 32px; width: 100%; max-width: 520px; }
        .rc-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px; }
        .rc-input { width: 100%; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px; font-size: 15px; font-weight: 600; color: #f1f5f9; outline: none; transition: border-color 0.2s; font-family: 'Inter', sans-serif; }
        .rc-input:focus { border-color: #6366f1; background: rgba(99,102,241,0.08); }
        .rc-btn { width: 100%; padding: 15px; border: none; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: 'Inter', sans-serif; }
        .rc-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
        .rc-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .rc-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 14px 16px; color: #fca5a5; font-size: 14px; font-weight: 600; text-align: center; }
        .rc-used { background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); border-radius: 12px; padding: 14px 16px; color: #fde68a; font-size: 14px; font-weight: 600; text-align: center; }
        .rc-spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .print-btn { background: #1e3a5f; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: 'Inter', sans-serif; }
        .print-btn:hover { background: #2563eb; }
        
        @media print {
          body { background: #fff !important; }
          .rc-page { background: #fff !important; padding: 0 !important; }
          .rc-header, .rc-card, .print-btn, .rc-back-btn, #top-bar { display: none !important; }
          #report-print-area { box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; border: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="rc-page">
        {/* Header */}
        {!result && (
          <div className="rc-header">
            <div className="rc-logo-ring">📋</div>
            <h1 className="rc-title">Result Checker</h1>
            <p className="rc-subtitle">Enter your access token to view your child's result</p>
          </div>
        )}

        {/* Input form */}
        {!result && (
          <div className="rc-card" style={{ marginBottom: 24 }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label className="rc-label">Exam / Admission Number</label>
                <input
                  id="rc-exam-input"
                  className="rc-input"
                  type="text"
                  placeholder="e.g. GMS/2024/001"
                  value={admissionNo}
                  onChange={e => setAdmissionNo(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="rc-label">Access Token (from email or school)</label>
                <input
                  id="rc-token-input"
                  className="rc-input"
                  type="text"
                  placeholder="e.g. RC-7X4K-9P2A-QZ38"
                  value={token}
                  onChange={e => setToken(e.target.value.toUpperCase())}
                  required
                  disabled={loading}
                  autoComplete="off"
                  style={{ letterSpacing: "2px", fontWeight: 700 }}
                />
              </div>

              {error && (
                <div className={alreadyUsed ? "rc-used" : "rc-error"}>
                  {alreadyUsed ? "⚠️ " : "❌ "}{error}
                </div>
              )}

              <button id="rc-submit-btn" className="rc-btn" type="submit" disabled={loading || !admissionNo.trim() || !token.trim()}>
                {loading ? (
                  <><div className="rc-spinner" /> Verifying…</>
                ) : (
                  <>🔍 View Result</>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Powered By Footer for Landing Page */}
        {!result && (
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.8 }}>
            <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 600 }}>Powered by</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/logo.png" alt="Titbeattechsolutions Logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.2px', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Titbeattechsolutions LTD</p>
            </div>
          </div>
        )}

        {/* Top actions bar when result shows */}
        {result && (
          <div id="top-bar" style={{ display: 'flex', width: '100%', maxWidth: '800px', justifyContent: 'space-between', marginBottom: 16 }}>
            <button
              className="rc-back-btn"
              onClick={() => setResult(null)}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 16px", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}
            >
              ← Back
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="print-btn" onClick={handlePrint}>🖨️ Print Result</button>
              <button className="print-btn" style={{ background: '#2563eb' }} onClick={handleDownloadPdf} disabled={downloading}>
                {downloading ? "⏳ Generating..." : "📥 Download PDF"}
              </button>
            </div>
          </div>
        )}

        {/* Report Sheet Mirror */}
        {result && (
          <div id="report-print-area" className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg relative w-full" style={{ maxWidth: '800px', fontFamily: tpl.fontFamily === 'Helvetica' ? 'Helvetica, Arial, sans-serif' : tpl.fontFamily === 'Times' ? '"Times New Roman", Times, serif' : tpl.fontFamily === 'Courier' ? 'Courier, monospace' : 'Georgia, serif' }}>
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
              
              {/* Header */}
              <div className="px-8 pt-7 pb-5 flex items-center justify-between gap-4" style={{ borderColor: tpl.headerColor, borderBottomWidth: '2px', paddingLeft: 32, paddingRight: 32, paddingTop: 28, paddingBottom: 20, display: 'flex' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {tpl.showLogo && result.school.logo && (
                    <img src={result.school.logo} alt="Logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
                  )}
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', color: tpl.headerColor, lineHeight: 1.1, margin: 0 }}>
                      {result.school.name}
                    </h1>
                    {tpl.showMotto && schoolSettings.motto && (
                      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4, color: tpl.accentColor }}>
                        {schoolSettings.motto}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-block', color: '#fff', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 16px', borderRadius: 9999, backgroundColor: tpl.headerColor }}>
                    Report Sheet
                  </span>
                  <p style={{ fontSize: 12, color: '#64748b', fontWeight: 700, marginTop: 6 }}>
                    {result.academic_year} · {termLabel(result.term)}
                  </p>
                </div>
              </div>

              {/* Student Fields */}
              <div style={{ padding: '14px 32px', borderBottom: '1px solid #f1f5f9', display: "grid", gridTemplateColumns: `repeat(${studentFields.length}, 1fr)`, gap: "12px", backgroundColor: "rgba(248, 250, 252, 0.75)" }}>
                {studentFields.map(([l, v, _x], i) => (
                  <div key={i}>
                    <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: 2 }}>{l}</p>
                    <p style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a' }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Grades Table */}
              <div style={{ padding: '20px 32px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: 8 }}>Academic Performance</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, borderTop: `2px solid ${tpl.headerColor}`, borderBottom: `2px solid ${tpl.headerColor}` }}>
                  <thead>
                    <tr style={{ backgroundColor: tpl.headerColor, color: "#fff" }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{ padding: "9px 10px", textAlign: i === 0 ? "left" : "center", fontWeight:800, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", borderRight: i < headers.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => {
                      const bg = tpl.tableStyle === "striped" ? (i % 2 === 0 ? "transparent" : "rgba(248,250,252,0.65)") : "transparent";
                      const border = tpl.tableStyle === "minimal" ? "none" : "1px solid #e2e8f0";
                      const pad = result.results.length > 12 ? "4px 8px" : "8px 10px";
                      return (
                        <tr key={i} style={{ background: bg }}>
                          <td style={{ padding: pad, borderRight: border, borderBottom: border, fontWeight:700, textTransform:"uppercase", fontSize:10 }}>{r.subject}</td>
                          <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.ca1 ?? "—"}</td>
                          <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.ca2 ?? "—"}</td>
                          <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:700 }}>{r.exam ?? "—"}</td>
                          <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, fontSize:12 }}>{r.total ?? "—"}</td>
                          {tpl.showGrade && <td style={{ padding: pad, borderRight: border, borderBottom: border, textAlign:"center", fontWeight:900, color:gradeColor(r.grade) }}>{r.grade ?? "—"}</td>}
                          {tpl.showGrade && <td style={{ padding: pad, borderBottom: border, fontStyle:"italic", color:"#64748b", fontSize:10 }}>{r.remark ?? "—"}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: tpl.headerColor }}>
                      <td colSpan={tpl.showGrade ? 4 : 4} style={{ padding: "9px 10px", color:"#94a3b8", fontWeight:800, fontSize:9, textTransform:"uppercase", letterSpacing:"0.1em" }}>Cumulative Total</td>
                      <td style={{ padding: "9px 10px", textAlign:"center", color:"#fff", fontWeight:900, fontSize:14 }}>{result.summary.total_score ?? "—"}</td>
                      {tpl.showGrade && <td style={{ padding: "9px 10px", textAlign:"center", color:"#34d399", fontWeight:900, fontSize:12 }}>{result.summary.average}%</td>}
                      {tpl.showGrade && <td style={{ padding: "9px 10px", color:"#94a3b8", fontWeight:800, fontSize:9, textTransform:"uppercase" }}>Avg.</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Attendance */}
              {tpl.showAttendance && (
                <div style={{ padding: '16px 32px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: 6 }}>Attendance</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      ["Days Opened",  result.report_card?.days_open    || "—", "background: #f1f5f9; color: #1e293b;"],
                      ["Days Present", result.report_card?.days_present || "—", "background: #ecfdf5; color: #065f46;"],
                      ["Days Absent",  result.report_card?.days_absent  || "—", "background: #fef2f2; color: #991b1b;"],
                      ["Rate", attRate !== null ? `${attRate}%` : "—", attRate === null ? "background: #f1f5f9; color: #1e293b;" : attRate >= 75 ? "background: #d1fae5; color: #064e3b;" : "background: #fee2e2; color: #7f1d1d;"],
                    ].map(([l, v, styleStr], i) => (
                      <div key={i} style={{ borderRadius: 12, padding: 12, textAlign: 'center', ...parseInlineStyle(styleStr as string) }}>
                        <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', opacity: 0.6, marginBottom: 2 }}>{l}</p>
                        <p style={{ fontSize: 20, fontWeight: 900 }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Behavioural */}
              {tpl.showBehavioural && (
                <div style={{ padding: '16px 32px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: 8 }}>Affective & Psychomotor Domains</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[...AFFECTIVE_TRAITS, ...PSYCHOMOTOR_SKILLS].map(t => (
                      <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 8px' }}>
                        <span style={{ color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>{t.label}</span>
                        <span style={{ fontWeight: 700, color: tpl.accentColor, flexShrink: 0 }}>{traits[t.key] || "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 8, color: '#94a3b8', marginTop: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key: A = Excellent, B = Good, C = Fair, D = Poor, E = Unacceptable</p>
                </div>
              )}

              {/* Remarks */}
              {remarkSections.length > 0 && (
                <div style={{ padding: '16px 32px 20px', display: 'grid', gap: 16, gridTemplateColumns: remarkSections.length === 2 ? '1fr 1fr' : '1fr' }}>
                  {remarkSections.map(([f, l, sf, role]) => {
                    const remarkText = f === 'teacher' ? result.report_card?.teacher_remark : result.report_card?.principal_remark;
                    const sigValue = sf === 'teacherSig' 
                      ? (result.report_card?.traits?.teacherSig || result.report_card?.signature || schoolSettings.defaultTeacherSignature)
                      : (result.report_card?.traits?.principalSig || schoolSettings.defaultPrincipalSignature);

                    const signatoryName = role === "teacher" 
                      ? (result.report_card?.traits?.teacherName) 
                      : (result.report_card?.traits?.principalName || schoolSettings.principalName);

                    return (
                      <div key={f} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', marginBottom: 8 }}>{l}</p>
                        <div style={{ minHeight: 40, fontSize: 14, color: '#334155', fontStyle: 'italic', borderBottom: '1px dashed #e2e8f0', paddingBottom: 8, marginBottom: 12 }}>
                          {remarkText || <span style={{ color: '#cbd5e1', fontStyle: 'normal', fontSize: 10 }}>No remark entered</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>
                              {role === "teacher" ? "Class Teacher" : "Principal"}
                            </p>
                            {sigValue && typeof sigValue === "string" && sigValue.startsWith("data:image") ? (
                              <img src={sigValue} alt="signature" style={{ maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }} />
                            ) : sigValue ? (
                              <p style={{ fontStyle: 'italic', fontSize: 16, fontFamily: `${tpl.fontFamily},serif`, color: tpl.accentColor }}>{sigValue}</p>
                            ) : (
                              <p style={{ fontStyle: 'italic', fontSize: 10, color: '#cbd5e1' }}>_____________________</p>
                            )}
                            {signatoryName && (
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 6 }}>
                                {signatoryName}
                              </p>
                            )}
                          </div>
                                                                              {role === "principal" && tpl.showStamp && (
                            <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {tpl.stampUrl ? (
                                <img src={tpl.stampUrl} alt="Stamp" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                              ) : (
                                <AutoStamp schoolName={schoolSettings.name || "School"} date={new Date().toLocaleDateString('en-GB')} color={tpl.accentColor || "#1e40af"} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Resumption */}
              {tpl.showResumptionDate && schoolSettings.resumptionDate && (
                <div style={{ padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tpl.headerColor }}>
                  <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>Next Term Resumption</p>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', textTransform: 'uppercase' }}>{schoolSettings.resumptionDate}</p>
                </div>
              )}

              <div className="h-1.5" style={{ backgroundColor: tpl.accentColor, height: 6 }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Simple helper to parse inline style strings to objects
function parseInlineStyle(styleStr: string) {
  const obj: any = {};
  styleStr.split(';').forEach(rule => {
    if (!rule.trim()) return;
    const [key, value] = rule.split(':');
    const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
    obj[camelKey] = value.trim();
  });
  return obj;
}
