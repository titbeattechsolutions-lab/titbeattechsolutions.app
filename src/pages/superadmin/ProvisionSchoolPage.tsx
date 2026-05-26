import { useState } from "react";
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
    tenantId: "",
  });

  const [step, setStep] = useState<Step>("idle");
  const [resultSchoolId, setResultSchoolId] = useState<string | null>(null);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).functions.invoke("provision-school", {
        body: {
          name: form.name,
          code: form.code.toUpperCase(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: { street: form.street, city: form.city, state: form.state },
          adminEmail: form.adminEmail || undefined,
          adminName: form.adminName || undefined,
          plan: form.plan,
          tenantId: form.tenantId,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Simulate visible progress steps since the EF does all 3 atomically
      setStep("pre_registration");
      await new Promise((r) => setTimeout(r, 600));
      setStep("email");
      await new Promise((r) => setTimeout(r, 600));
      setStep("done");
      setResultSchoolId(data.schoolId);
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
                  <Input {...field("code")} placeholder="e.g. GSS" className="uppercase" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Tenant ID * <span className="text-xs text-slate-400">(UUID from tenants table)</span></Label>
                <Input {...field("tenantId")} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-xs" />
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

              <div className="space-y-1.5">
                <Label>Initial Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter (500 students, 14-day trial)</SelectItem>
                    <SelectItem value="pro">Pro (2,000 students)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (10,000 students)</SelectItem>
                  </SelectContent>
                </Select>
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
                  <p className="font-semibold">School provisioned successfully!</p>
                  {form.adminEmail && (
                    <p className="mt-1">Welcome email sent to <strong>{form.adminEmail}</strong></p>
                  )}
                  {resultSchoolId && (
                    <p className="mt-1 font-mono text-xs text-emerald-600">School ID: {resultSchoolId}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setStep("idle"); setForm({ name: "", code: "", email: "", phone: "", street: "", city: "", state: "", adminEmail: "", adminName: "", plan: "starter", tenantId: "" }); }}
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
