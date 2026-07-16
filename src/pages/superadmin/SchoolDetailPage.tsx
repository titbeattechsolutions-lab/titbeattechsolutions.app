import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, RotateCcw, KeyRound, Activity } from "lucide-react";
import TenantActivityAudit from "@/components/TenantActivityAudit";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogHeader } from "@/components/ui/dialog";

function generatePin(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "SCH-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

interface SchoolDetail {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_country: string;
  logo: string | null;
  timezone: string;
  academic_year: string;
  current_term: string;
  features: Record<string, boolean>;
  max_students: number;
  current_students: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface BillingDetail {
  plan: string;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

const PLAN_FEATURES: Record<string, Record<string, boolean>> = {
  starter:    { attendance: true, results: true, fees: false, library: false, events: true },
  pro:        { attendance: true, results: true, fees: true,  library: false, events: true },
  enterprise: { attendance: true, results: true, fees: true,  library: true,  events: true },
};

const PLAN_LIMITS: Record<string, number> = {
  starter: 500, pro: 2000, enterprise: 10000,
};

export default function SchoolDetailPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [billing, setBilling] = useState<BillingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [payOpen, setPayOpen] = useState<boolean>(false);

  const resetSchoolPin = async () => {
    if (!school?.tenant_id) return;
    if (!confirm(`Reset school PIN for ${school.name}? A new PIN will be issued and all current sessions will be revoked.`)) return;
    
    const newPin = generatePin();
    const { error } = await (supabase as any).rpc("reset_school_pin", { 
      _tenant_id: school.tenant_id, 
      _new_pin: newPin 
    });
    
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    
    await navigator.clipboard.writeText(newPin).catch(() => {});
    toast({
      title: "School PIN reset",
      description: `New PIN: ${newPin} (copied to clipboard)`,
      duration: 10000,
    });
  };

  const resetAdminPin = async () => {
    if (!school?.tenant_id) return;
    if (!confirm(`Reset admin PIN for ${school.name}? They'll set a new one on next login.`)) return;
    
    const { error } = await (supabase as any).from("tenants")
      .update({ admin_pin_hash: null })
      .eq("id", school.tenant_id);
      
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin PIN reset successfully" });
    }
  };

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [schoolRes, billingRes, countsRes] = await Promise.all([
      (supabase as any).from("schools").select("*").eq("id", schoolId).single(),
      (supabase as any).from("billing").select("plan,status,trial_ends_at,current_period_start,current_period_end").eq("school_id", schoolId).maybeSingle(),
      (supabase as any).rpc("get_student_counts_by_school")
    ]);
    setLoading(false);
    if (schoolRes.error) {
      toast({ title: "Error", description: schoolRes.error.message, variant: "destructive" }); return;
    }
    
    const schoolData = schoolRes.data;
    if (schoolData && countsRes.data) {
      const countMatch = countsRes.data.find((c: any) => c.school_id === schoolId);
      schoolData.current_students = countMatch ? countMatch.student_count : 0;
    }
    setSchool(schoolData as SchoolDetail);
    setSelectedPlan(billingRes.data?.plan ?? "starter");
    setBilling(billingRes.data as BillingDetail | null);
  };

  useEffect(() => { load(); }, [schoolId]); // eslint-disable-line


  const handlePlanChange = async () => {
    if (!schoolId) return;
    setSavingPlan(true);
    try {
      // Atomically update school features + max_students to match plan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: schoolErr } = await (supabase as any)
        .from("schools")
        .update({
          features: PLAN_FEATURES[selectedPlan],
          max_students: PLAN_LIMITS[selectedPlan],
        })
        .eq("id", schoolId);
      if (schoolErr) throw new Error(schoolErr.message);

      // Update billing plan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: billingErr } = await (supabase as any)
        .from("billing")
        .update({ plan: selectedPlan })
        .eq("school_id", schoolId);
      if (billingErr) throw new Error(billingErr.message);

      toast({ title: "Plan updated", description: `Switched to ${selectedPlan}` });
      load();
    } catch (e) {
      toast({ title: "Plan update failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSavingPlan(false); }
  };

  const setStatus = async (status: "active" | "suspended") => {
    if (!schoolId || !school?.tenant_id) return;
    setSavingStatus(true);
    
    // 1. Update authoritative tenants table (this actually locks/unlocks login)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: tenantErr } = await (supabase as any)
      .from("tenants")
      .update({ status })
      .eq("id", school.tenant_id);
      
    if (tenantErr) {
      setSavingStatus(false);
      toast({ title: "Tenant update failed", description: tenantErr.message, variant: "destructive" }); return;
    }

    // 2. Update schools table for UI consistency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: schoolErr } = await (supabase as any)
      .from("schools")
      .update({ status })
      .eq("id", schoolId);
      
    setSavingStatus(false);
    if (schoolErr) {
      toast({ title: "School update failed", description: schoolErr.message, variant: "destructive" }); return;
    }
    
    toast({ title: `School ${status === "suspended" ? "suspended" : "reactivated"}` });
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!school) return <p className="text-slate-400 text-center py-16">School not found</p>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/superadmin/schools")}>
          <ArrowLeft size={14} className="mr-1" /> Schools
        </Button>
        <h1 className="text-xl font-bold text-slate-800">{school.name}</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${school.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
          {school.status}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* School profile */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">School Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Code" value={school.code} mono />
            <Row label="Email" value={school.email ?? "—"} />
            <Row label="Phone" value={school.phone ?? "—"} />
            <Row label="City" value={[school.address_city, school.address_state].filter(Boolean).join(", ") || "—"} />
            <Row label="Country" value={school.address_country} />
            <Row label="Timezone" value={school.timezone} />
            <Row label="Academic Year" value={school.academic_year} />
            <Row label="Current Term" value={school.current_term} />
            <Row label="Created" value={new Date(school.created_at).toLocaleDateString()} />
          </CardContent>
        </Card>

        {/* Students + status */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Capacity & Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Students</p>
              <p className="text-2xl font-bold text-slate-800">{school.current_students} <span className="text-sm font-normal text-slate-400">/ {school.max_students}</span></p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full"
                  style={{ width: `${Math.min((school.current_students / school.max_students) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1">Enabled Features</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(school.features ?? {}).map(([k, v]) => (
                  <Badge key={k} variant={v ? "default" : "outline"} className="text-xs">
                    {v ? "✓" : "✗"} {k}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              {school.status !== "suspended" ? (
                <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" disabled={savingStatus} onClick={() => setStatus("suspended")}>
                  {savingStatus ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldOff size={12} className="mr-1" />} Suspend
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" disabled={savingStatus} onClick={() => setStatus("active")}>
                  {savingStatus ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldCheck size={12} className="mr-1" />} Reactivate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Billing & Plan</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {billing ? (
              <>
                <Row label="Plan" value={billing.plan} />
                <Row label="Status" value={billing.status} />
                <Row label="Trial Ends" value={billing.trial_ends_at ? new Date(billing.trial_ends_at).toLocaleDateString() : "—"} />
                <Row label="Period Start" value={billing.current_period_start ? new Date(billing.current_period_start).toLocaleDateString() : "—"} />
                <Row label="Period End" value={billing.current_period_end ? new Date(billing.current_period_end).toLocaleDateString() : "—"} />
              </>
            ) : (
              <p className="text-slate-400 text-xs">No billing record found</p>
            )}

            <div className="pt-2 space-y-2">
              {/* NOTE: This plan change writes to public.billing and public.schools. 
                  However, verify_school_pin_v2 still reads plan/dates from public.tenants. 
                  Thus, this does NOT currently affect the tenant's actual login session.
                  This is a known issue for a future fix. */}
              <p className="text-xs font-medium text-slate-500">Change Plan</p>
              <div className="flex gap-2">
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger className="h-8 flex-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter (500 students)</SelectItem>
                    <SelectItem value="pro">Pro (2,000 students)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (10,000 students)</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handlePlanChange} disabled={savingPlan}>
                  {savingPlan ? <Loader2 size={12} className="animate-spin" /> : "Apply"}
                </Button>
              </div>
              <p className="text-xs text-slate-400">Updates features JSONB + max_students atomically</p>
            </div>

            <div className="pt-4 space-y-2 border-t mt-4">
              <p className="text-xs font-medium text-slate-500">Record Payment & Renew</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setPayOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 flex-1">
                  Record Payment...
                </Button>
              </div>
              <p className="text-xs text-slate-400">Logs financial entry and unlocks tenant sessions atomically.</p>
            </div>
          </CardContent>
        </Card>

        {/* Security & Access */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Security & Access</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">School PIN</p>
              <Button size="sm" variant="outline" onClick={resetSchoolPin} className="w-full justify-start text-slate-700">
                <RotateCcw size={14} className="mr-2" /> Reset School PIN
              </Button>
              <p className="text-[11px] text-slate-400">Revokes all active sessions and issues a new PIN.</p>
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500">Admin PIN</p>
              <Button size="sm" variant="outline" onClick={resetAdminPin} className="w-full justify-start text-slate-700">
                <KeyRound size={14} className="mr-2" /> Reset Admin PIN
              </Button>
              <p className="text-[11px] text-slate-400">Forces admin to create a new PIN on next login.</p>
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500">Activity Logs</p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="w-full justify-start text-slate-700">
                    <Activity size={14} className="mr-2" /> View Detailed Audit Log
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Activity Audit: {school.name}</DialogTitle>
                  </DialogHeader>
                  <TenantActivityAudit schoolId={school.id} />
                </DialogContent>
              </Dialog>
              <p className="text-[11px] text-slate-400">View detailed cryptographic and session logs.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {payOpen && school && billing && (
        <PaymentDialog
          school={school}
          billing={billing}
          onClose={() => setPayOpen(false)}
          onRecorded={() => { setPayOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-800 text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function PaymentDialog({ school, billing, onClose, onRecorded }: { school: SchoolDetail; billing: BillingDetail; onClose: () => void; onRecorded: () => void }) {
  const { toast } = useToast();
  const [duration, setDuration] = useState<"termly" | "yearly">("termly");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school.tenant_id) return;
    setSaving(true);
    
    const days = duration === "termly" ? 90 : 365;
    const now = new Date();
    // Extend from current end if still active, else from now
    const currentEnd = billing.current_period_end ? new Date(billing.current_period_end) : null;
    const startFrom = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = new Date(startFrom.getTime() + days * 86400_000);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Insert into subscription_payments for financial audit (with explicit tier and plan=duration)
      const { error: payErr } = await supabase.from("subscription_payments").insert({
        tenant_id: school.tenant_id,
        amount: Number(amount),
        plan: duration, // Legacy enum ('termly', 'yearly')
        tier: billing.plan, // New column ('starter', 'pro', etc.)
        period_start: startFrom.toISOString(),
        period_end: newEnd.toISOString(),
        reference: reference || null,
        notes: notes || null,
        recorded_by: user?.id,
      });
      if (payErr) throw payErr;

      toast({ title: "Subscription extended", description: `Active until ${newEnd.toLocaleDateString()}` });
      onRecorded();
    } catch (err) {
      toast({ title: "Payment failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Record Payment — {school.name}</CardTitle>
          <p className="text-sm text-slate-500">Log a bank transfer and extend this school's subscription.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Current Tier</label>
              <div className="p-2 border rounded bg-slate-50 text-sm capitalize">{billing.plan}</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Duration (Cycle)</label>
              <Select value={duration} onValueChange={(v) => setDuration(v as "termly" | "yearly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="termly">Termly (90 days)</SelectItem>
                  <SelectItem value="yearly">Yearly (365 days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="amt">Amount (₦)</label>
              <input id="amt" type="number" step="0.01" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ref">Reference (bank txn ID)</label>
              <input id="ref" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="pn">Notes</label>
              <textarea id="pn" className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={saving}>
                {saving ? "Saving..." : `Record & Extend`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
