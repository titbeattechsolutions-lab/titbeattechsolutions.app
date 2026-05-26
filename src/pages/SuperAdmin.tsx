import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth-logger";
import LoginActivityDashboard from "@/components/LoginActivityDashboard";
import TenantActivityAudit from "@/components/TenantActivityAudit";
import ProviderActivityDashboard from "@/components/ProviderActivityDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
// hashPin no longer needed — server-side bcrypt via create_tenant_v2 RPC
import { Plus, LogOut, Copy, RefreshCw, ShieldCheck, ShieldOff, KeyRound, DollarSign, History, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Eye, EyeOff, Ban, ShieldAlert, Activity } from "lucide-react";

interface Tenant {
  id: string;
  tenant_code: string;
  school_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: "trial" | "active" | "expired" | "suspended";
  plan: "trial" | "termly" | "yearly";
  trial_started_at: string | null;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  notes: string | null;
  created_at: string;
}

const PLAN_DAYS = { trial: 7, termly: 90, yearly: 365 } as const;

function generatePin(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "SCH-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function daysLeft(ends: string | null): number | null {
  if (!ends) return null;
  return Math.ceil((new Date(ends).getTime() - Date.now()) / 86400_000);
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<Tenant | null>(null);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);

  // Auth gate
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      setUserEmail(session.user.email ?? null);
      setUserId(session.user.id);
      supabase
        .rpc("has_role", { _user_id: session.user.id, _role: "super_admin" })
        .then(({ data }) => {
          setIsSuperAdmin(data === true);
          setAuthChecked(true);
        });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Load failed", description: error.message, variant: "destructive" });
      return;
    }
    setTenants(((data ?? []) as unknown as Tenant[]));
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadTenants();
  }, [isSuperAdmin, loadTenants]);

  const signOut = async () => {
    setSigningOut(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        logAuthEvent({ authType: "super_admin", eventType: "logout", userId: data.session.user.id }).catch(() => {});
      }
    });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (!isSuperAdmin) {
    navigate("/auth", { replace: true });
    return null;
  }

  const stats = {
    total: tenants.length,
    active: tenants.filter((t) => t.status === "active").length,
    trial: tenants.filter((t) => t.status === "trial").length,
    expired: tenants.filter((t) => t.status === "expired" || t.status === "suspended").length,
    expiringSoon: tenants.filter((t) => {
      const d = daysLeft(t.subscription_ends_at);
      return d !== null && d > 0 && d <= 14 && t.status === "active";
    }).length,
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Provider Console</h1>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setGlobalActivityOpen(true)}>
              <Activity className="w-4 h-4 mr-1" /> Live activity
            </Button>
            <Button variant="outline" size="sm" onClick={loadTenants} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="w-4 h-4 mr-1" /> {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Active" value={stats.active} tone="success" />
          <StatCard label="Trial" value={stats.trial} tone="info" />
          <StatCard label="Expiring ≤14d" value={stats.expiringSoon} tone="warn" />
          <StatCard label="Expired/Suspended" value={stats.expired} tone="danger" />
        </div>

        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Tenants ({tenants.length})</h2>
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewPin(null); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New tenant</Button>
            </DialogTrigger>
            <CreateTenantDialog
              onCreated={(pin) => { setNewPin(pin); loadTenants(); }}
              newPin={newPin}
              onClose={() => { setCreateOpen(false); setNewPin(null); }}
            />
          </Dialog>
        </div>

        <DuplicatesBanner refreshKey={tenants.length} onChanged={loadTenants} />

        <div className="space-y-2">
          {tenants.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              No tenants yet. Click "New tenant" to onboard your first school.
            </Card>
          )}
          {tenants.map((t) => (
            <TenantRow key={t.id} tenant={t} onChanged={loadTenants} onRecordPayment={() => setPayOpen(t)} />
          ))}
        </div>

        <SecurityChecksSection />
        <TokenAuditSection />
        <TenantAuthAuditSection />
        
        {userId && (
          <div className="space-y-2">
            <h2 className="font-semibold">Your Login Activity</h2>
            <LoginActivityDashboard
              authType="super_admin"
              identifier={userId}
              limit={20}
              showIpAddress={true}
            />
          </div>
        )}
      </div>

      {payOpen && (
        <PaymentDialog
          tenant={payOpen}
          onClose={() => setPayOpen(null)}
          onRecorded={() => { setPayOpen(null); loadTenants(); }}
        />
      )}

      <Dialog open={globalActivityOpen} onOpenChange={setGlobalActivityOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Provider live activity</DialogTitle>
            <DialogDescription>Track all tenant and staff activity in real time with timestamps.</DialogDescription>
          </DialogHeader>
          <ProviderActivityDashboard />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "info" | "warn" | "danger" }) {
  const cls =
    tone === "success" ? "text-green-600 dark:text-green-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "danger" ? "text-destructive"
    : tone === "info" ? "text-primary"
    : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
    </Card>
  );
}

function TenantRow({ tenant, onChanged, onRecordPayment }: { tenant: Tenant; onChanged: () => void; onRecordPayment: () => void }) {
  const [activityOpen, setActivityOpen] = useState(false);
  const d = daysLeft(tenant.subscription_ends_at);
  const statusColor =
    tenant.status === "active" ? "default"
    : tenant.status === "trial" ? "secondary"
    : "destructive";

  const setStatus = async (status: Tenant["status"]) => {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", tenant.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Status → ${status}` }); onChanged(); }
  };

  const resetAdminPin = async () => {
    if (!confirm(`Reset admin PIN for ${tenant.school_name}? They'll set a new one on next login.`)) return;
    const { error } = await supabase.from("tenants").update({ admin_pin_hash: null }).eq("id", tenant.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Admin PIN reset" }); onChanged(); }
  };

  const resetSchoolPin = async () => {
    if (!confirm(`Reset school PIN for ${tenant.school_name}? A new PIN will be issued and all current sessions will be revoked.`)) return;
    const newPin = generatePin();
    const { error } = await supabase.rpc("reset_school_pin", { _tenant_id: tenant.id, _new_pin: newPin });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    await navigator.clipboard.writeText(newPin).catch(() => {});
    toast({
      title: "School PIN reset",
      description: `New PIN: ${newPin} (copied to clipboard)`,
    });
    onChanged();
  };

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px]">{tenant.tenant_code}</Badge>
            <span className="font-semibold">{tenant.school_name}</span>
            <Badge variant={statusColor}>{tenant.status}</Badge>
            <Badge variant="outline">{tenant.plan}</Badge>
            {d !== null && (
              <span className={`text-xs ${d < 0 ? "text-destructive" : d <= 14 ? "text-amber-600" : "text-muted-foreground"}`}>
                {d < 0 ? `Ended ${-d}d ago` : `${d}d left`}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {tenant.contact_email && <span>{tenant.contact_email}</span>}
            {tenant.contact_phone && <span> · {tenant.contact_phone}</span>}
          </div>
          {tenant.notes && <div className="text-xs text-muted-foreground mt-1 italic">{tenant.notes}</div>}
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
            <Activity className="w-3 h-3 mr-1" /> Activity
          </Button>
          <Button size="sm" variant="outline" onClick={onRecordPayment}>
            <DollarSign className="w-3 h-3 mr-1" /> Record payment
          </Button>
          <Button size="sm" variant="ghost" onClick={resetSchoolPin} title="Reset school PIN (issues new PIN, revokes sessions)">
            <RotateCcw className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={resetAdminPin} title="Reset admin PIN">
            <KeyRound className="w-3 h-3" />
          </Button>
          {tenant.status !== "suspended" ? (
            <Button size="sm" variant="ghost" onClick={() => setStatus("suspended")}>Suspend</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setStatus("active")}>Reactivate</Button>
          )}
        </div>
      </div>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity & Audit — {tenant.school_name}</DialogTitle>
            <DialogDescription>Comprehensive view of tenant usage and access logs</DialogDescription>
          </DialogHeader>
          <TenantActivityAudit tenantId={tenant.id} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateTenantDialog({ onCreated, newPin, onClose }: { onCreated: (pin: string) => void; newPin: string | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [startTrial, setStartTrial] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const pin = generatePin();
    const { error } = await supabase.rpc("create_tenant_v2", {
      _school_name: name,
      _school_pin: pin,
      _contact_email: email || null,
      _contact_phone: phone || null,
      _notes: notes || null,
      _start_trial: startTrial,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    onCreated(pin);
  };

  if (newPin) {
    return <PinRevealDialog pin={newPin} onClose={onClose} />;
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Onboard new school</DialogTitle>
        <DialogDescription>Create a new tenant and generate a unique School PIN.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="name">School name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="email">Contact email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={startTrial} onChange={(e) => setStartTrial(e.target.checked)} />
          Start 7-day free trial immediately
        </label>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Creating..." : "Create tenant & generate PIN"}
        </Button>
      </form>
    </DialogContent>
  );
}

function PaymentDialog({ tenant, onClose, onRecorded }: { tenant: Tenant; onClose: () => void; onRecorded: () => void }) {
  const [plan, setPlan] = useState<"termly" | "yearly">("termly");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const days = PLAN_DAYS[plan];
    const now = new Date();
    // Extend from current end if still active, else from now
    const currentEnd = tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at) : null;
    const startFrom = currentEnd && currentEnd > now ? currentEnd : now;
    const newEnd = new Date(startFrom.getTime() + days * 86400_000);

    const { data: { user } } = await supabase.auth.getUser();
    const { error: payErr } = await supabase.from("subscription_payments").insert({
      tenant_id: tenant.id,
      amount: Number(amount),
      plan,
      period_start: startFrom.toISOString(),
      period_end: newEnd.toISOString(),
      reference: reference || null,
      notes: notes || null,
      recorded_by: user?.id,
    });
    if (payErr) { toast({ title: "Payment failed", description: payErr.message, variant: "destructive" }); setSaving(false); return; }

    const { error: tErr } = await supabase.from("tenants").update({
      status: "active",
      plan,
      subscription_starts_at: tenant.subscription_starts_at ?? now.toISOString(),
      subscription_ends_at: newEnd.toISOString(),
    }).eq("id", tenant.id);
    setSaving(false);
    if (tErr) { toast({ title: "Update failed", description: tErr.message, variant: "destructive" }); return; }

    toast({ title: "Subscription extended", description: `Active until ${newEnd.toLocaleDateString()}` });
    onRecorded();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment — {tenant.school_name}</DialogTitle>
          <DialogDescription>Log a manual bank transfer and extend this school's subscription.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Plan</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as "termly" | "yearly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="termly">Termly (90 days)</SelectItem>
                <SelectItem value="yearly">Yearly (365 days)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="amt">Amount (₦)</Label>
            <Input id="amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="ref">Reference (bank txn ID)</Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pn">Notes</Label>
            <Textarea id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving..." : `Record & extend ${PLAN_DAYS[plan]} days`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AuditEntry {
  id: string;
  event_type: "issued" | "redeemed";
  actor_user_id: string | null;
  target_user_id: string | null;
  token_id: string | null;
  success: boolean;
  reason: string | null;
  created_at: string;
}

function TokenAuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("super_admin_token_audit" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      toast({ title: "Audit load failed", description: error.message, variant: "destructive" });
      return;
    }
    setEntries((data as unknown as AuditEntry[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [filter, setFilter] = useState<"all" | "success" | "failed" | "issued" | "redeemed">("all");
  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "success") return e.success;
    if (filter === "failed") return !e.success;
    return e.event_type === filter;
  });

  return (
    <div className="space-y-2 pt-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> Super-admin token history
        </h2>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="issued">Issued only</SelectItem>
              <SelectItem value="redeemed">Redeemed only</SelectItem>
              <SelectItem value="success">Success only</SelectItem>
              <SelectItem value="failed">Failed only</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {entries.length === 0 ? "No token activity yet." : "No events match this filter."}
        </Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((e) => (
            <div key={e.id} className="p-3 flex items-start gap-3 text-sm">
              <div className="mt-0.5">
                {e.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.event_type === "issued" ? "secondary" : "outline"}>
                    {e.event_type}
                  </Badge>
                  <Badge variant={e.success ? "default" : "destructive"}>
                    {e.success ? "success" : "failed"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                  actor: {e.actor_user_id ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground font-mono break-all">
                  target: {e.target_user_id ?? "—"}
                </div>
                {e.reason && (
                  <div className="text-xs mt-1 italic text-muted-foreground">{e.reason}</div>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

interface DuplicateRow {
  match_type: string;
  match_value: string;
  tenant_ids: string[];
  school_names: string[];
  occurrences: number;
}

function DuplicatesBanner({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [dups, setDups] = useState<DuplicateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("find_duplicate_tenants");
    setLoading(false);
    if (error) {
      // silent — non-blocking informational scan
      return;
    }
    setDups((data as unknown as DuplicateRow[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const suspendOne = async (tenantId: string, schoolName: string, matchType: string) => {
    if (!confirm(`Suspend "${schoolName}" as a duplicate? All active sessions will be revoked.`)) return;
    setBusy(tenantId);
    const { error } = await supabase.rpc("suspend_duplicate_tenant" as never, {
      _tenant_id: tenantId,
      _reason: `duplicate ${matchType}`,
    } as never);
    setBusy(null);
    if (error) {
      toast({ title: "Suspend failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Tenant suspended", description: schoolName });
    await load();
    onChanged();
  };

  if (loading || dups.length === 0) return null;

  return (
    <Card className="p-3 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm space-y-2 flex-1">
          <div className="font-semibold text-amber-700 dark:text-amber-300">
            {dups.length} duplicate group{dups.length === 1 ? "" : "s"} detected
          </div>
          {dups.map((d, i) => (
            <div key={i} className="text-xs space-y-1 border-l-2 border-amber-500/40 pl-2">
              <div className="text-muted-foreground">
                <span className="font-mono">{d.match_type}</span> = "{d.match_value}" ({d.occurrences})
              </div>
              <div className="flex flex-wrap gap-1">
                {d.tenant_ids.map((id, idx) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy === id}
                    onClick={() => suspendOne(id, d.school_names[idx], d.match_type)}
                    title="Suspend this tenant"
                  >
                    <Ban className="w-3 h-3 mr-1" />
                    {d.school_names[idx]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div className="text-xs text-muted-foreground italic pt-1">
            Click a school name to suspend it. The earliest record is usually the one to keep.
          </div>
        </div>
      </div>
    </Card>
  );
}

interface TenantAuditEntry {
  id: string;
  event_type: "school_pin_verify" | "admin_pin_verify" | "admin_pin_set";
  tenant_id: string | null;
  success: boolean;
  reason: string | null;
  session_ref: string | null;
  created_at: string;
}

function TenantAuthAuditSection() {
  const [entries, setEntries] = useState<TenantAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_auth_audit" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      toast({ title: "Tenant audit load failed", description: error.message, variant: "destructive" });
      return;
    }
    setEntries((data as unknown as TenantAuditEntry[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [filter, setFilter] = useState<"all" | "success" | "failed" | "school_pin_verify" | "admin_pin_verify" | "admin_pin_set">("all");
  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "success") return e.success;
    if (filter === "failed") return !e.success;
    return e.event_type === filter;
  });

  return (
    <div className="space-y-2 pt-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> Tenant authentication history
        </h2>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="school_pin_verify">School PIN verify</SelectItem>
              <SelectItem value="admin_pin_verify">Admin PIN verify</SelectItem>
              <SelectItem value="admin_pin_set">Admin PIN set</SelectItem>
              <SelectItem value="success">Success only</SelectItem>
              <SelectItem value="failed">Failed only</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {entries.length === 0 ? "No tenant authentication activity yet." : "No events match this filter."}
        </Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((e) => (
            <div key={e.id} className="p-3 flex items-start gap-3 text-sm">
              <div className="mt-0.5">
                {e.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{e.event_type}</Badge>
                  <Badge variant={e.success ? "default" : "destructive"}>
                    {e.success ? "success" : "failed"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                  tenant: {e.tenant_id ?? "—"}
                </div>
                {e.session_ref && (
                  <div className="text-xs text-muted-foreground font-mono">
                    session: {e.session_ref}
                  </div>
                )}
                {e.reason && (
                  <div className="text-xs mt-1 italic text-muted-foreground">{e.reason}</div>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ===== PIN reveal dialog with safety controls =====
function PinRevealDialog({ pin, onClose }: { pin: string; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>School PIN created</DialogTitle>
        <DialogDescription>
          This PIN is shown only once. Reveal it, copy it, hand it off securely, then close.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Make sure no one is looking at your screen before revealing the PIN.</span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-lg">
          <span className="flex-1 select-all">
            {revealed ? pin : "•".repeat(pin.length)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!revealed}
            onClick={async () => {
              await navigator.clipboard.writeText(pin).catch(() => {});
              setCopied(true);
              toast({ title: "Copied" });
            }}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>I have securely transmitted this PIN to the school. I understand it cannot be retrieved later (only reset).</span>
        </label>
        <Button onClick={onClose} className="w-full" disabled={!acknowledged || !copied}>
          Done
        </Button>
      </div>
    </DialogContent>
  );
}

// ===== RLS regression / security checks panel =====
interface SecurityCheck {
  check_name: string;
  passed: boolean;
  detail: string;
}

function SecurityChecksSection() {
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("security_regression_check" as never);
    setLoading(false);
    setRanAt(new Date());
    if (error) {
      toast({ title: "Security check failed", description: error.message, variant: "destructive" });
      return;
    }
    setChecks((data as unknown as SecurityCheck[]) ?? []);
  }, []);

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const allGreen = total > 0 && passed === total;

  return (
    <div className="space-y-2 pt-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Security regression checks
        </h2>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <Badge variant={allGreen ? "default" : "destructive"}>
              {passed}/{total} passing
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Run checks
          </Button>
        </div>
      </div>

      {checks.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          Click "Run checks" to verify RLS, audit-write locks, and role-assignment guards.
        </Card>
      ) : (
        <Card className="divide-y">
          {checks.map((c) => (
            <div key={c.check_name} className="p-3 flex items-start gap-3 text-sm">
              <div className="mt-0.5">
                {c.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs">{c.check_name}</div>
                <div className={`text-xs mt-0.5 ${c.passed ? "text-muted-foreground" : "text-destructive"}`}>
                  {c.detail}
                </div>
              </div>
            </div>
          ))}
          {ranAt && (
            <div className="p-2 text-[11px] text-muted-foreground text-center">
              Last run: {ranAt.toLocaleTimeString()}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
