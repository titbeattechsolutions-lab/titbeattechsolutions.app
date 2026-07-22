/**
 * ReportCardSupabaseActions
 *
 * Adds three capabilities on top of the existing School_Management_App report editor
 * without modifying that component's internal logic:
 *   1. Save to Supabase report_cards table (incl. e-signature)
 *   2. Print Report button → window.print()
 *   3. Send to Parent button → confirmation modal → send-report-card Edge Function
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Printer, Mail, CheckCheck, Loader2, AlertTriangle, UserPen, ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

interface ReportCardActionsProps {
  /** activeReport from School_Management_App state */
  activeReport: {
    id: string;
    name: string;
    class: string;
    records: any[];
    summary: { total: number; obtainable: number; avg: string };
  } | null;
  /** curC from School_Management_App (comments + attendance + sigs) */
  curC: {
    teacher?: string;
    principal?: string;
    teacherSig?: string;
    principalSig?: string;
    daysOpen?: string;
    daysPresent?: string;
    daysAbsent?: string;
  };
  schoolSettings: {
    term: string;
    session: string;
    name?: string;
  };
  /** Optional tenant UUID — used to look up the Supabase school_id */
  tenantId?: string | null;
}

export default function ReportCardSupabaseActions({
  activeReport,
  curC,
  schoolSettings,
  tenantId,
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
  const [guardianEmail, setGuardianEmail]       = useState<string | null>(null);
  const [showEmailEditor, setShowEmailEditor]   = useState(false);
  const [emailDraft, setEmailDraft]             = useState("");
  const [savingEmail, setSavingEmail]           = useState(false);
  const [studentDbId, setStudentDbId]           = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Look up schoolId from tenantId once on mount
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
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
    setShowEmailEditor(false);
    setEmailDraft("");
    if (!activeReport || !schoolId) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("students")
          .select("id, guardian_email")
          .eq("school_id", schoolId)
          .ilike("first_name || ' ' || last_name", `%${activeReport.name}%`)
          .limit(1)
          .maybeSingle();
        setGuardianEmail(data?.guardian_email ?? null);
        setStudentDbId(data?.id ?? null);
      } catch { /* non-critical */ }
    })();
  }, [activeReport?.id, schoolId]); // eslint-disable-line

  // ─── Set guardian email locally ──────────────────────────────────────────
  const handleSaveGuardianEmail = useCallback(async () => {
    const trimmed = emailDraft.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" });
      return;
    }
    // We strictly avoid inserting into the students table to respect RLS rules.
    // Instead, we just keep the email in state and pass it dynamically to the Edge Function!
    setGuardianEmail(trimmed);
    setShowEmailEditor(false);
    toast({ title: "Email verified for sending", description: trimmed });
  }, [emailDraft, toast]);

  // ─── Normalise term value ─────────────────────────────────────────────────
  const normaliseTerm = (t: string): "first" | "second" | "third" => {
    const lower = t.toLowerCase();
    if (lower.includes("second")) return "second";
    if (lower.includes("third"))  return "third";
    return "first";
  };

  // ─── Save to Supabase ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeReport || !schoolId) return;
    setSaving(true);
    try {
      // Pick the principal signature (prefer principalSig, fallback teacherSig)
      const signature = curC.principalSig || curC.teacherSig || null;

      const payload = {
        school_id:       schoolId,
        student_name:    activeReport.name,
        student_class:   activeReport.class,
        term:            normaliseTerm(schoolSettings.term),
        academic_year:   schoolSettings.session,
        teacher_remark:  curC.teacher   || null,
        principal_remark:curC.principal || null,
        days_open:       curC.daysOpen    ? parseInt(curC.daysOpen)    : null,
        days_present:    curC.daysPresent ? parseInt(curC.daysPresent) : null,
        days_absent:     curC.daysAbsent  ? parseInt(curC.daysAbsent)  : null,
        signature,
        status: "ready" as const,
      };

      // Upsert by school_id + student_name + class + term + year
      // (student_id is nullable since this app uses names not UUIDs)
      const { data, error } = await (supabase as any)
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
        const { data: existing } = await (supabase as any)
          .from("report_cards")
          .select("id")
          .eq("school_id", schoolId)
          .eq("student_name", activeReport.name)
          .eq("student_class", activeReport.class)
          .eq("term", normaliseTerm(schoolSettings.term))
          .eq("academic_year", schoolSettings.session)
          .maybeSingle();

        if (existing?.id) {
          await (supabase as any)
            .from("report_cards")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          setSavedId(existing.id);
        } else {
          const { data: inserted, error: insertErr } = await (supabase as any)
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

      toast({ title: "Report card saved", description: `${activeReport.name} — ${schoolSettings.term}` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [activeReport, curC, schoolId, schoolSettings, toast]);

  // ─── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

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
        const { data: rc } = await (supabase as any)
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

      const { data, error } = await supabase.functions.invoke("send-report-card", {
        body: { reportCardId: rcId, schoolId, overrideEmail: guardianEmail },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const sentEmail = data?.sentTo ?? guardianEmail ?? "parent";
      const now = new Date().toLocaleString();
      setSentTo(sentEmail);
      setSentAt(now);
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
          body * { visibility: hidden; }
          #report-print-area, #report-print-area * { visibility: visible; }
          #report-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 no-print">
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

        {/* Print */}
        <Button
          variant="outline"
          size="sm"
          className="h-10 text-xs font-black uppercase"
          onClick={handlePrint}
        >
          <Printer size={14} className="mr-1.5" />
          Print Report
        </Button>

        {/* Send to Parent */}
        {role !== "teacher" && (
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
            {sending ? "Sending…" : sentTo ? "Resend to Parent" : "Send to Parent"}
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
    </>
  );
}
