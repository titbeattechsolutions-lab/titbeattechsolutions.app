import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Lock, GraduationCap } from "lucide-react";
import {
  verifySchoolPin,
  verifyAdminPin,
  setAdminPin,
  saveTenantSession,
  loadTenantSession,
  daysRemaining,
} from "@/lib/tenant-client";

type Step = "school" | "admin" | "set-admin";

export default function SchoolLock() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("school");
  const [schoolPin, setSchoolPin] = useState("");
  const [adminPin, setAdminPinInput] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof verifySchoolPin>>>(null);

  useEffect(() => {
    const existing = loadTenantSession();
    if (existing && (existing.status === "trial" || existing.status === "active")) {
      navigate("/app", { replace: true });
    }
  }, [navigate]);

  const handleSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await verifySchoolPin(schoolPin.trim());
    setLoading(false);
    if (!res) {
      toast({ title: "Invalid school PIN", description: "Check with your provider.", variant: "destructive" });
      return;
    }
    if (res.status === "suspended" || res.status === "expired") {
      toast({
        title: res.status === "suspended" ? "Account suspended" : "Subscription expired",
        description: "Please contact your provider to renew.",
        variant: "destructive",
      });
      return;
    }
    setPending(res);
    setStep(res.hasAdminPin ? "admin" : "set-admin");
  };

  const handleAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setLoading(true);
    const ok = await verifyAdminPin({ ...pending, isAdmin: false }, adminPin.trim());
    setLoading(false);
    if (!ok) {
      toast({ title: "Wrong admin PIN", variant: "destructive" });
      return;
    }
    saveTenantSession({ ...pending, isAdmin: true, hasAdminPin: true });
    navigate("/app", { replace: true });
  };

  const handleSetAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    if (adminPin.length < 4) {
      toast({ title: "PIN too short", description: "Use at least 4 digits.", variant: "destructive" });
      return;
    }
    if (adminPin !== confirmPin) {
      toast({ title: "PINs do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const ok = await setAdminPin({ ...pending, isAdmin: false }, adminPin.trim());
    setLoading(false);
    if (!ok) {
      toast({ title: "Could not set PIN", description: "Already set — contact provider.", variant: "destructive" });
      return;
    }
    saveTenantSession({ ...pending, isAdmin: true, hasAdminPin: true });
    toast({ title: "Admin PIN created", description: "Welcome!" });
    navigate("/app", { replace: true });
  };

  const banner = pending ? (() => {
    const d = daysRemaining({ ...pending, isAdmin: false });
    if (pending.status === "trial") return `Free trial — ${d ?? "?"} days left`;
    if (d !== null && d <= 14) return `Subscription ends in ${d} days`;
    return null;
  })() : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">School Login</h1>
            {pending && <p className="text-sm text-muted-foreground">{pending.schoolName}</p>}
          </div>
        </div>

        {banner && (
          <div className="text-xs px-3 py-2 rounded-md bg-accent text-accent-foreground">{banner}</div>
        )}

        {step === "school" && (
          <form onSubmit={handleSchool} className="space-y-3">
            <div>
              <Label htmlFor="schoolPin">School PIN</Label>
              <Input
                id="schoolPin"
                type="text"
                inputMode="text"
                value={schoolPin}
                onChange={(e) => setSchoolPin(e.target.value.toUpperCase())}
                placeholder="e.g. SCH-7K2P"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">Issued by your provider on subscription.</p>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              <Lock className="w-4 h-4 mr-2" />
              {loading ? "Checking..." : "Continue"}
            </Button>
          </form>
        )}

        {step === "admin" && (
          <form onSubmit={handleAdmin} className="space-y-3">
            <div>
              <Label htmlFor="adminPin">Admin PIN</Label>
              <Input
                id="adminPin"
                type="password"
                inputMode="numeric"
                value={adminPin}
                onChange={(e) => setAdminPinInput(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Verifying..." : "Unlock"}
            </Button>
            <button type="button" onClick={() => { setStep("school"); setPending(null); }} className="text-xs text-muted-foreground w-full">
              ← Use a different school PIN
            </button>
          </form>
        )}

        {step === "set-admin" && (
          <form onSubmit={handleSetAdmin} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              First-time setup — create your school's admin PIN. Keep it private.
            </p>
            <div>
              <Label htmlFor="newPin">New Admin PIN</Label>
              <Input id="newPin" type="password" inputMode="numeric" minLength={4} value={adminPin} onChange={(e) => setAdminPinInput(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm PIN</Label>
              <Input id="confirm" type="password" inputMode="numeric" minLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} required />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving..." : "Create PIN & Enter"}
            </Button>
          </form>
        )}

        <div className="pt-2 border-t text-center">
          <button onClick={() => navigate("/auth")} className="text-xs text-muted-foreground hover:text-foreground">
            Provider sign-in →
          </button>
        </div>
      </Card>
    </div>
  );
}
