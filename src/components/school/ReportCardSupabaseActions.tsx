/**
 * ReportCardSupabaseActions
 *
 * Adds three capabilities on top of the existing School_Management_App report editor
 * without modifying that component's internal logic:
 *   1. Save to Supabase report_cards table (incl. e-signature, traits, position)
 *   2. Print Report button → window.print()
 *   3. Send to Parent button → confirmation modal → send-report-card Edge Function
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/supabase/schoolService";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { syncActivityLog } from "@/lib/activity-sync";
import { Printer, Mail, CheckCheck, Loader2, AlertTriangle, UserPen, ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

// ─── Normalise term value ─────────────────────────────────────────────────
const normaliseTerm = (t: string): "first" | "second" | "third" => {
  const lower = t.toLowerCase();
  if (lower.includes("second")) return "second";
  if (lower.includes("third"))  return "third";
  return "first";
};

export default function ReportCardSupabaseActions({
  activeReport,
  curC,
  schoolSettings,
  tenantId,
  classTeacher,
  canPrint = true,
  dispatch,
  onExportExcel,
}: {
  activeReport: any;
  curC: any;
  schoolSettings: any;
  tenantId: string | null;
  classTeacher?: any;
  canPrint?: boolean;
  dispatch?: any;
  onExportExcel?: () => void;
}) {
  const { toast } = useToast();
  const { role } = useAuth();

  const [schoolId, setSchoolId]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savedId, setSavedId]           = useState<string | null>(null);
  const [sending, setSending]           = useState(false);
  const [sentTo, setSentTo]             = useState<string | null>(null);
  const [sentAt, setSentAt]             = useState<string | null>(null);
  const [showModal, setShowModal]             = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [guardianEmail, setGuardianEmail]       = useState<string | null>(null);
  const [showEmailEditor, setShowEmailEditor]   = useState(false);
  const [emailDraft, setEmailDraft]             = useState("");
  const [savingEmail, setSavingEmail]           = useState(false);
  const [studentDbId, setStudentDbId]           = useState<string | null>(null);
  const [studentAdmissionNo, setStudentAdmissionNo] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState<string | null>(null);
  const [classErrorMsg, setClassErrorMsg] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Look up schoolId from tenantId once on mount
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await db()
          .from("schools")
          .select("id")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        setSchoolId(data?.id ?? null);
      } catch { /* non-critical */ }
    })();
  }, [tenantId]);

  // Reset state and fetch guardian email + student db id when active report changes
  useEffect(() => {
    setSavedId(null);
    setSentTo(null);
    setSentAt(null);
    setGuardianEmail(null);
    setStudentDbId(null);
    setStudentAdmissionNo(null);
    setStudentClassId(null);
    setClassErrorMsg(null);
    setShowEmailEditor(false);
    setEmailDraft("");
    if (!activeReport || !schoolId) return;
    (async () => {
      try {
        // Resolve Student
        let studentDbId = activeReport.studentId || "";
        let studentAdmissionNo = activeReport.admissionNo || "";

        if (!studentDbId) {
          // Fallback: try to find the student by name and class in the database
          const { data: foundStudents } = await db()
            .from("students")
            .select("id, admission_no")
            .eq("school_id", schoolId)
            .ilike("first_name", `%${activeReport.name.split(" ")[0]}%`);
          
          // simple heuristic: if we find exactly one match, use it.
          if (foundStudents && foundStudents.length === 1) {
            studentDbId = foundStudents[0].id;
            studentAdmissionNo = foundStudents[0].admission_no;
          }
        }

        if (!studentDbId) {
          console.warn(`Could not link report to a student database record for "${activeReport.name}".`);
        }

        const { data } = await db()
          .from("students")
          .select("id, guardian_email, first_name, last_name, other_names, admission_no, class_id")
          .eq("school_id", schoolId)
          .eq("id", studentDbId);
          
        let foundClassId: string | null = null;

        if (data && data.length > 0) {
          const target = (activeReport.name || "").toLowerCase().trim();
          const match = data.find((s: any) => {
            const first = (s.first_name || "").toLowerCase();
            const last = (s.last_name || "").toLowerCase();
            const other = (s.other_names || "").toLowerCase();
            const f1 = `${first} ${last}`.trim();
            const f2 = `${first} ${other} ${last}`.replace(/\s+/g, ' ').trim();
            return f1 === target || f2 === target || (first && target.includes(first));
          });
          setGuardianEmail(match?.guardian_email ?? null);
          setStudentDbId(match?.id ?? null);
          setStudentAdmissionNo(match?.admission_no ?? null);
          foundClassId = match?.class_id ?? null;
        } else {
          setGuardianEmail(null);
          setStudentDbId(null);
          setStudentAdmissionNo(null);
        }

        if (!foundClassId) {
          const { data: classData } = await db()
            .from("classes")
            .select("id")
            .eq("school_id", schoolId)
            .ilike("name", activeReport.class)
            .maybeSingle();
          foundClassId = classData?.id ?? null;

          if (!foundClassId) {
            // Auto-create class if it does not exist
            const { data: newClass, error: classErr } = await db()
              .from("classes")
              .insert({
                school_id: schoolId,
                name: activeReport.class,
                academic_year: schoolSettings.session,
                term: normaliseTerm(schoolSettings.term)
              })
              .select("id")
              .single();
            if (classErr) {
               console.error("Class auto-creation failed:", classErr);
               setClassErrorMsg(classErr.message || JSON.stringify(classErr));
            } else if (newClass?.id) {
              foundClassId = newClass.id;
            } else {
               setClassErrorMsg("Insert succeeded but no ID returned (RLS SELECT blocked it)");
            }
          }
        }
        
        setStudentClassId(foundClassId);
      } catch (err: any) {
        console.error("Lookup error:", err);
        setClassErrorMsg(err.message || String(err));
      }
    })();
  }, [activeReport?.id, schoolId]); // eslint-disable-line

  // ─── Set guardian email locally ──────────────────────────────────────────
  const handleSaveGuardianEmail = useCallback(async () => {
    const trimmed = emailDraft.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    setSavingEmail(true);
    try {
      // 1. Save locally to appState (syncs to offline JSON blob)
      if (dispatch && activeReport) {
        dispatch({ type: "SET_COMMENT", studentId: activeReport.id, field: "guardianEmail", value: trimmed });
      }
      
      // 2. Attempt Supabase update (RLS might block this for teachers, but we try anyway)
      if (studentDbId) {
        await db().from("students").update({ guardian_email: trimmed }).eq("id", studentDbId);
      }
      
      setGuardianEmail(trimmed);
      setShowEmailEditor(false);
      toast({ title: "Email verified & saved", description: trimmed });
    } catch (err: any) {
      // Even if Supabase fails (e.g. RLS block), local appState already caught it.
      setGuardianEmail(trimmed);
      setShowEmailEditor(false);
      toast({ title: "Email verified locally", description: trimmed });
    } finally {
      setSavingEmail(false);
    }
  }, [emailDraft, toast, dispatch, activeReport, studentDbId]);

  // ─── Save to Supabase ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeReport || !schoolId) return;
    setSaving(true);
    try {
      if (!studentDbId) {
        throw new Error("Student must be migrated to the relational database before a report card can be saved.");
      }
      
      // Resolve class_id synchronously here to avoid race conditions with useEffect
      let finalClassId = studentClassId;
      if (!finalClassId) {
         // Attempt to find it
         const { data: classData } = await db()
           .from("classes")
           .select("id")
           .eq("school_id", schoolId)
           .ilike("name", activeReport.class)
           .maybeSingle();
           
         if (classData?.id) {
           finalClassId = classData.id;
         } else {
           // Auto-create
           const { data: newClass, error: classErr } = await db()
             .from("classes")
             .insert({
               school_id: schoolId,
               name: activeReport.class,
               academic_year: schoolSettings.session,
               term: normaliseTerm(schoolSettings.term)
             })
             .select("id")
             .single();
             
           if (classErr) {
             throw new Error("Class auto-creation failed: " + (classErr.message || JSON.stringify(classErr)));
           } else if (newClass?.id) {
             finalClassId = newClass.id;
           } else {
             throw new Error("Insert succeeded but no Class ID was returned (RLS SELECT blocked it).");
           }
         }
      }

      if (!finalClassId) {
        throw new Error("Could not resolve a valid Class ID for '" + activeReport.class + "'. Ensure it exists or check permissions.");
      }

      // ── Build traits: ALL curC keys except the standard attendance/remark text fields.
      // This captures bh_* (behavioural), ps_* (psychomotor), and any other custom fields.
      const standardTextKeys = new Set(["teacher", "principal", "daysOpen", "daysPresent", "daysAbsent"]);
      const traits: Record<string, any> = {};
      for (const key of Object.keys(curC || {})) {
        // Include everything except the standard text-only fields (retain signature fields too)
        if (!standardTextKeys.has(key) && curC[key] !== undefined && curC[key] !== "") {
          traits[key] = curC[key];
        }
      }
      // Always ensure these critical fields are present (even if empty string was falsy)
      traits.teacherSig    = curC.teacherSig    || null;
      traits.principalSig  = curC.principalSig  || null;
      traits.teacherName   = classTeacher?.name  || null;
      traits.principalName = (schoolSettings as any).principalName || null;

      // Pick the principal signature (prefer principalSig, fallback teacherSig)
      const signature = curC.principalSig || curC.teacherSig || null;

      // ── Compute summary fields from activeReport ──
      const totalScore    = activeReport.summary?.total ?? null;
      const totalSubjects = activeReport.records?.length ?? null;
      const averageScore  = activeReport.summary?.avg ? parseFloat(activeReport.summary.avg) : null;
      // Position: strip ordinal suffix ("3rd" → 3)
      const positionRaw   = activeReport.position;
      const positionNum   = positionRaw
        ? (parseInt(String(positionRaw).replace(/\D/g, ""), 10) || null)
        : null;

      const payload = {
        school_id:         schoolId,
        student_id:        studentDbId,
        student_name:      activeReport.name,
        student_class:     activeReport.class,
        term:              normaliseTerm(schoolSettings.term),
        academic_year:     schoolSettings.session,
        teacher_remark:    curC.teacher    || null,
        principal_remark:  curC.principal  || null,
        days_open:         curC.daysOpen    ? parseInt(curC.daysOpen)    : null,
        days_present:      curC.daysPresent ? parseInt(curC.daysPresent) : null,
        days_absent:       curC.daysAbsent  ? parseInt(curC.daysAbsent)  : null,
        total_score:       totalScore,
        total_subjects:    totalSubjects,
        average_score:     averageScore,
        position_in_class: positionNum,
        signature,
        traits,
      };

      // Upsert by school_id + student_id + term + year
      const { data, error } = await db()
        .from("report_cards")
        .upsert(payload, {
          onConflict: "school_id,student_id,term,academic_year",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();

      if (error) {
        // Conflict key uses student_id which is null — fall back to insert+update
        // by selecting first then updating
        const { data: existing } = await db()
          .from("report_cards")
          .select("id")
          .eq("school_id", schoolId)
          .eq("student_name", activeReport.name)
          .eq("student_class", activeReport.class)
          .eq("term", normaliseTerm(schoolSettings.term))
          .eq("academic_year", schoolSettings.session)
          .maybeSingle();

        if (existing?.id) {
          await db()
            .from("report_cards")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          setSavedId(existing.id);
        } else {
          const { data: inserted, error: insertErr } = await db()
            .from("report_cards")
            .insert(payload)
            .select("id")
            .single();
          if (insertErr) throw insertErr;
          setSavedId(inserted.id);
        }
      } else {
        setSavedId(data?.id ?? null);
      }
      
      // Save results
      if (activeReport.records && activeReport.records.length > 0) {
        // Resolve subjects first
        const existingSubjectMap: Record<string, string> = {};
        const { data: dbSubjects } = await db().from("subjects").select("id, name").eq("school_id", schoolId);
        dbSubjects?.forEach((s: any) => {
          existingSubjectMap[s.name.toLowerCase().trim()] = s.id;
        });

        const resultsPayload = [];
        for (const r of activeReport.records) {
          if (!r.subject) continue;
          const subjKey = r.subject.toLowerCase().trim();
          let subjId = existingSubjectMap[subjKey];

          if (!subjId) {
            // Auto-create subject
            const { data: newSubj, error: subjErr } = await db()
              .from("subjects")
              .insert({ school_id: schoolId, name: r.subject })
              .select("id")
              .single();
            if (!subjErr && newSubj?.id) {
              subjId = newSubj.id;
              existingSubjectMap[subjKey] = subjId;
            }
          }

          const getGrade = (total: number) => {
            if (total >= 70) return { grade: "A", remark: "Excellent" };
            if (total >= 60) return { grade: "B", remark: "Very Good" };
            if (total >= 50) return { grade: "C", remark: "Credit" };
            if (total >= 40) return { grade: "D", remark: "Pass" };
            return { grade: "F", remark: "Fail" };
          };

          const { grade, remark } = r.grade && r.remark ? { grade: r.grade, remark: r.remark } : getGrade(r.total);
          
          let ca1: number | null = null;
          let ca2: number | null = null;
          if (r.caScore != null && r.caScore !== "") {
            const caNum = Number(r.caScore);
            if (!isNaN(caNum)) {
              ca1 = Math.min(caNum, 20);
              ca2 = Math.max(0, caNum - 20);
            }
          }

          let ex: number | null = null;
          if (r.examScore != null && r.examScore !== "") {
            const exNum = Number(r.examScore);
            if (!isNaN(exNum)) ex = exNum;
          }

          let tot: number | null = null;
          if (r.total != null && r.total !== "") {
            const totNum = Number(r.total);
            if (!isNaN(totNum)) tot = totNum;
          }

          resultsPayload.push({
            school_id: schoolId,
            student_id: studentDbId || null,
            subject_id: subjId || null,
            student_name: activeReport.name,
            admission_no: studentAdmissionNo || "N/A",
            class_id: finalClassId,
            class_name: activeReport.class,
            subject_name: r.subject,
            term: normaliseTerm(schoolSettings.term),
            academic_year: schoolSettings.session,
            score_ca1: ca1,
            score_ca2: ca2,
            score_exam: ex,
            score_total: tot,
            grade,
            remark
          });
        }

        await db().from("results")
          .delete()
          .eq("school_id", schoolId)
          .eq("student_name", activeReport.name)
          .eq("term", normaliseTerm(schoolSettings.term))
          .eq("academic_year", schoolSettings.session);

        if (resultsPayload.length > 0) {
          const { error: resErr } = await db().from("results").insert(resultsPayload);
          if (resErr) {
            console.error("Failed to save results:", resErr);
            throw new Error("Failed to save subject scores to database: " + (resErr.message || JSON.stringify(resErr)));
          }
        }
      }
      
      // Hook into activity tracking
      syncActivityLog(tenantId ?? null, role || "Staff", "Saved Report Card", `Saved report card to cloud for ${activeReport.name}`).catch(() => {});

      setShowReceiptModal(true);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [activeReport, curC, schoolId, schoolSettings, studentDbId, classTeacher, toast]);

  // ─── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ─── WhatsApp Share ───────────────────────────────────────────────────────
  const handleWhatsAppShare = () => {
    const text = `Hello! The End of Term Report Card for ${activeReport?.name} is now available for ${schoolSettings.session} (${schoolSettings.term} term).`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // ─── Send to Parent ───────────────────────────────────────────────────────
  const handleSendConfirm = useCallback(async () => {
    if (!savedId && !activeReport) return;
    setSending(true);
    setShowModal(false);
    try {
      // Ensure saved first
      let rcId = savedId;
      if (!rcId) {
        await handleSave();
        // Re-fetch id
        const { data: rc } = await db()
          .from("report_cards")
          .select("id")
          .eq("school_id", schoolId)
          .eq("student_name", activeReport!.name)
          .eq("student_class", activeReport!.class)
          .eq("term", normaliseTerm(schoolSettings.term))
          .eq("academic_year", schoolSettings.session)
          .maybeSingle();
        rcId = rc?.id ?? null;
      }

      if (!rcId) throw new Error("Report card not saved — please save first.");

      const raw = sessionStorage.getItem("schoolapp_tenant_session_v2");
      const token = raw ? JSON.parse(raw).sessionToken : null;
      const headers: Record<string, string> = {};
      if (token) headers["x-tenant-session"] = token;

      const { data, error } = await supabase.functions.invoke("send-report-card", {
        body: { reportCardId: rcId, schoolId, overrideEmail: guardianEmail, appUrl: window.location.origin },
        headers
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const sentEmail = data?.sentTo ?? guardianEmail ?? "parent";
      const now = new Date().toLocaleString();
      setSentTo(sentEmail);
      setSentAt(now);
      
      // Hook into activity tracking
      syncActivityLog(tenantId ?? null, role || "Staff", "Emailed Report Card", `Emailed report card for ${activeReport.name} to ${sentEmail}`).catch(() => {});
      
      toast({ title: `Report card sent to ${sentEmail}` });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [savedId, activeReport, schoolId, schoolSettings, guardianEmail, handleSave, toast]);

  if (!activeReport) return null;

  const noEmail = !guardianEmail;

  return (
    <>
      {/* ── Print styles ─────────────────────────────────────────── */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; }
          html, body, main { overflow: visible !important; height: auto !important; margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #report-print-area, #report-print-area * { visibility: visible; }
          #report-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className={`grid gap-3 no-print ${canPrint ? (role !== 'teacher' ? 'grid-cols-4' : 'grid-cols-3') : 'grid-cols-1'}`}>
        {/* Save to Supabase */}
        <Button
          variant="outline"
          size="sm"
          className="h-10 text-xs font-black uppercase"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? <Loader2 size={14} className="animate-spin mr-1.5" />
            : <CheckCheck size={14} className="mr-1.5" />
          }
          {saving ? "Saving…" : savedId ? "Saved ✓" : "Save to Cloud"}
        </Button>

        {/* Export Excel */}
        {canPrint && onExportExcel && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs font-black uppercase"
            onClick={onExportExcel}
          >
            📊 Export Excel
          </Button>
        )}

        {/* Print */}
        {canPrint && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs font-black uppercase"
            onClick={handlePrint}
          >
            <Printer size={14} className="mr-1.5" />
            Print Report
          </Button>
        )}

        {/* Send to Parent */}
        {canPrint && ["school_admin", "principal", "head_teacher"].includes(role || "") && (
          <Button
            variant="default"
            size="sm"
            className="h-10 text-xs font-black uppercase bg-indigo-600 hover:bg-indigo-700"
            onClick={() => setShowModal(true)}
            disabled={sending}
          >
            {sending
              ? <Loader2 size={14} className="animate-spin mr-1.5" />
              : sentTo
              ? <CheckCheck size={14} className="mr-1.5 text-emerald-300" />
              : <Mail size={14} className="mr-1.5" />
            }
            {sending ? "Sending…" : sentTo ? "Resend" : "Send"}
          </Button>
        )}
      </div>

      {/* Last sent timestamp */}
      {sentAt && sentTo && (
        <p className="text-[11px] text-slate-400 mt-1 no-print">
          Last sent: {sentAt} → <span className="font-medium text-slate-600">{sentTo}</span>
        </p>
      )}

      {/* ── Send Confirmation Modal ───────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase">Send Report Card</DialogTitle>
            <DialogDescription className="sr-only">Confirm sending the report card to the parent's email address.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Student</span>
                <span className="font-bold text-slate-800">{activeReport.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Class</span>
                <span className="font-bold text-slate-800">{activeReport.class}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Term</span>
                <span className="font-bold text-slate-800">{schoolSettings.term}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Year</span>
                <span className="font-bold text-slate-800">{schoolSettings.session}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Parent Email</span>
                <span className={`font-bold ${noEmail ? "text-red-600" : "text-slate-800"}`}>
                  {guardianEmail ?? "—"}
                </span>
              </div>
            </div>

            {noEmail && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 overflow-hidden">
                {/* Warning header */}
                <div className="flex items-start gap-2.5 p-3">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
                  <p className="text-sm text-amber-800">
                    No parent email on file for this student.
                  </p>
                </div>

                {/* Inline email editor */}
                {!showEmailEditor ? (
                  <div className="px-3 pb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailEditor(true);
                        setEmailDraft("");
                        setTimeout(() => emailInputRef.current?.focus(), 60);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase rounded-lg transition-colors"
                    >
                      <UserPen size={13} />
                      Verify Parent Email
                      <ArrowRight size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="px-3 pb-3 space-y-2">
                    <label className="block text-xs font-black uppercase text-amber-700 tracking-wide">
                      Parent / Guardian Email
                    </label>
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={emailDraft}
                      onChange={e => setEmailDraft(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSaveGuardianEmail()}
                      placeholder="parent@example.com"
                      className="w-full px-3 py-2 text-sm border-2 border-amber-300 rounded-lg bg-white outline-none focus:border-amber-500 transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowEmailEditor(false); setEmailDraft(""); }}
                        className="flex-1 py-1.5 text-xs font-bold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveGuardianEmail}
                        disabled={savingEmail || !emailDraft.includes("@")}
                        className="flex-1 py-1.5 text-xs font-black uppercase text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {savingEmail
                          ? <Loader2 size={12} className="animate-spin" />
                          : <CheckCheck size={12} />
                        }
                        {savingEmail ? "Verifying…" : "Verify Email"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSendConfirm}
              disabled={noEmail || sending}
            >
              <Mail size={14} className="mr-1.5" />
              Confirm &amp; Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Celebration / WhatsApp Receipt Modal */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="sm:max-w-md text-center p-8 border-0 shadow-2xl rounded-2xl bg-white no-print">
          <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-black text-slate-800 mb-2">Success!</h2>
          <p className="text-slate-500 text-lg mb-8">
            Report card for <span className="font-bold text-slate-800">{activeReport.name}</span> has been securely saved to the cloud.
          </p>
          <div className="flex flex-col gap-3">
            {["school_admin", "principal", "head_teacher"].includes(role || "") && (
              <Button 
                className="w-full h-14 text-lg font-bold bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-xl shadow-lg"
                onClick={handleWhatsAppShare}
              >
                <MessageCircle className="mr-2 h-6 w-6" />
                Share via WhatsApp
              </Button>
            )}
            <Button 
              variant="outline"
              className="w-full h-14 text-lg font-bold text-slate-600 rounded-xl"
              onClick={() => setShowReceiptModal(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
