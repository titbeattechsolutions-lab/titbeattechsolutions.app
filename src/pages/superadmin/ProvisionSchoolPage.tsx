import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "idle" | "creating" | "pre_registration" | "email" | "done" | "error";

const STEPS = [
  { key: "creating",         label: "Creating school record" },
  { key: "pre_registration", label: "Setting up admin pre-registration" },
  { key: "email",            label: "Sending welcome email" },
  { key: "done",             label: "Done" },
] as const;

function StepIndicator({ step, current }: { step: string; current: Step }) {
  const order = STEPS.map((s) => s.key);
  const stepIdx = order.indexOf(step as typeof order[number]);
  const currentIdx = order.indexOf(current as typeof order[number]);

  const done = current === "done" || currentIdx > stepIdx;
  const active = current === step;

  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
      ) : active ? (
        <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" />
      ) : (
        <Circle size={18} className="text-slate-300 shrink-0" />
      )}
      <span className={cn(
        "text-sm",
        done ? "text-slate-700 font-medium" : active ? "text-indigo-600 font-medium" : "text-slate-400"
      )}>
        {STEPS.find((s) => s.key === step)?.label}
      </span>
    </div>
  );
}

export default function ProvisionSchoolPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", code: "", email: "", phone: "",
    street: "", city: "", state: "",
    adminEmail: "", adminName: "", plan: "starter",
    tenantId: crypto.randomUUID(),
    paymentMethod: "bank_transfer",
    notes: "",
  });

  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  // Auto-generate school code from initials
  useEffect(() => {
    if (form.name && !codeManuallyEdited) {
      const generatedCode = form.name
        .split(' ')
        .filter(word => word.length > 0 && !['of', 'the', 'and'].includes(word.toLowerCase()))
        .map(word => word[0].toUpperCase())
        .join('');
      setForm(prev => ({ ...prev, code: generatedCode }));
    }
  }, [form.name, codeManuallyEdited]);

  const [step, setStep] = useState<Step>("idle");
  const [resultSchoolId, setResultSchoolId] = useState<string | null>(null);
  const [resultTenantCode, setResultTenantCode] = useState<string | null>(null);
  const [resultSchoolPin, setResultSchoolPin] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.tenantId) {
      toast({ title: "Name, code and tenant ID are required", variant: "destructive" }); return;
    }

    setStep("creating");
    setErrorMsg(null);

    try {
      // Generate a temporary password for the new admin if an email is provided
      const tempPassword = form.adminEmail ? Math.random().toString(36).slice(-8) + "Aa1!" : undefined;

      // Get the current user's session token to pass as Bearer token
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-school`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          idempotencyKey: form.tenantId, // Using tenantId as idempotency key since it's a random UUID
          school: {
            name: form.name,
            code: form.code.toUpperCase(),
            email: form.email || undefined,
            phone: form.phone || undefined,
            address: { street: form.street, city: form.city, state: form.state },
          },
          admin: form.adminEmail ? {
            email: form.adminEmail,
            name: form.adminName || undefined,
            tempPassword: tempPassword,
          } : undefined,
          subscription: {
            plan: form.plan,
            paymentMethod: form.paymentMethod,
          },
          notes: form.notes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If it's a non-2xx status, we extract the actual JSON error returned by our Edge Function instead of generic HTTP wrapper error
        const errMsg = data?.error 
          ? (typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error))) 
          : `HTTP Error: ${response.status} ${response.statusText}`;
        throw new Error(errMsg);
      }
      
      if (data?.error) {
        const errMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
        throw new Error(errMsg);
      }
      // Simulate visible progress steps since the EF does all 3 atomically
      setStep("pre_registration");
      await new Promise((r) => setTimeout(r, 600));
      setStep("email");
      await new Promise((r) => setTimeout(r, 600));
      setStep("done");
      setResultSchoolId(data.data.schoolId);
      setResultTenantCode(data.data.tenantCode);
      setResultSchoolPin(data.data.schoolPin);
      toast({ title: "School provisioned", description: `${form.name} is now live.` });
    } catch (e) {
      setStep("error");
      const msg = (e as Error).message;
      setErrorMsg(msg);
      toast({ title: "Provisioning failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/superadmin/schools")}>
          <ArrowLeft size={14} className="mr-1" /> Schools
        </Button>
        <h1 className="text-xl font-bold text-slate-800">Provision New School</h1>
      </div>

      {step === "idle" || step === "error" ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">School Details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>School Name *</Label>
                  <Input {...field("name")} placeholder="e.g. Greenwood Secondary School" />
                </div>
                <div className="space-y-1.5">
                  <Label>School Code *</Label>
                  <Input 
                    value={form.code} 
                    onChange={(e) => {
                      setCodeManuallyEdited(true);
                      setForm(f => ({ ...f, code: e.target.value }));
                    }}
                    placeholder="e.g. GSS" 
                    className="uppercase" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>School Email</Label>
                  <Input type="email" {...field("email")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input {...field("phone")} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(["street", "city", "state"] as const).map((f) => (
                  <div key={f} className="space-y-1.5">
                    <Label className="capitalize">{f}</Label>
                    <Input value={form[f]} onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))} />
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase">Admin Pre-Registration</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Admin Email</Label>
                    <Input type="email" {...field("adminEmail")} placeholder="admin@school.edu.ng" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admin Name</Label>
                    <Input {...field("adminName")} placeholder="e.g. Mr. John Adeyemi" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Initial Plan</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="micro">Micro (200 students)</SelectItem>
                      <SelectItem value="starter">Starter (500 students, 7-day trial)</SelectItem>
                      <SelectItem value="growth">Growth (1,000 students)</SelectItem>
                      <SelectItem value="enterprise">Enterprise (10,000 students)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Card / Online</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="free_trial">Free Trial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Internal Note (Reference Purpose)</Label>
                <textarea 
                  className="w-full min-h-[80px] p-2 text-sm border rounded-md border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900" 
                  placeholder="e.g. Referred by Mr. Johnson, paid 6 months upfront..."
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <Button type="submit" className="w-full">Provision School</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 pb-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-800">Provisioning in progress…</h2>
            <div className="space-y-3">
              {STEPS.map((s) => (
                <StepIndicator key={s.key} step={s.key} current={step} />
              ))}
            </div>

            {step === "done" && (
              <div className="pt-4 space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">
                  <p className="font-semibold text-lg">School provisioned successfully!</p>
                  
                  <div className="mt-4 p-4 bg-white border border-emerald-100 rounded-md shadow-sm">
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Login Credentials</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Tenant Code</p>
                        <p className="font-mono font-bold text-slate-800">{resultTenantCode}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">School PIN</p>
                        <p className="font-mono font-bold text-slate-800">{resultSchoolPin}</p>
                      </div>
                      {form.adminEmail && (
                        <div className="col-span-2">
                          <p className="text-xs text-slate-500">Admin Email</p>
                          <p className="font-medium text-slate-800">{form.adminEmail}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {form.adminEmail && (
                    <p className="mt-4 flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 bg-emerald-200 rounded-full text-emerald-800 shrink-0">✓</span>
                      A welcome email with these credentials has been sent to <strong>{form.adminEmail}</strong>
                    </p>
                  )}
                  {resultSchoolId && (
                    <p className="mt-2 font-mono text-xs text-emerald-600">Database ID: {resultSchoolId}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { 
                      setStep("idle"); 
                      setCodeManuallyEdited(false);
                      setForm({ 
                        name: "", code: "", email: "", phone: "", street: "", city: "", state: "", 
                        adminEmail: "", adminName: "", plan: "starter", 
                        tenantId: crypto.randomUUID(),
                        paymentMethod: "bank_transfer",
                        notes: ""
                      }); 
                    }}
                  >
                    Provision Another
                  </Button>
                  {resultSchoolId && (
                    <Button onClick={() => navigate(`/superadmin/schools/${resultSchoolId}`)}>
                      View School →
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
