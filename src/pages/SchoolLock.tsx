import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logAuthEvent } from "@/lib/auth-logger";
import { toast } from "@/hooks/use-toast";
import {
  verifySchoolPin,
  verifyAdminPin,
  setAdminPin,
  saveTenantSession,
  loadTenantSession,
  clearTenantSession,
  daysRemaining,
  acceptNdprConsent,
} from "@/lib/tenant-client";
import { GraduationCap } from "lucide-react";

type Step = "school" | "admin" | "set-admin";

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: "a-spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function SchoolLock() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("school");
  const [tenantCode, setTenantCode] = useState("");
  const [schoolPin, setSchoolPin] = useState("");
  const [adminPin, setAdminPinInput] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof verifySchoolPin>>>(null);
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ndprConsent, setNdprConsent] = useState(false);

  useEffect(() => {
    const existing = loadTenantSession();
    if (existing && (existing.status === "trial" || existing.status === "active")) {
      navigate("/app", { replace: true });
    } else if (existing && (existing.status === "expired" || existing.status === "suspended")) {
      clearTenantSession();
      toast({
        title: existing.status === "suspended" ? "Account suspended" : "Subscription expired",
        description: "Please contact your provider to renew.",
        variant: "destructive",
      });
    }
  }, [navigate]);

  const handleSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await verifySchoolPin(tenantCode.trim(), schoolPin.trim());
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
    
    if (!pending.ndprConsentGranted && !ndprConsent) {
      toast({ title: "Please accept the NDPR agreement", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    const ok = await verifyAdminPin({ ...pending, isAdmin: false }, adminPin.trim());
    if (!ok) {
      setLoading(false);
      toast({ title: "Wrong admin PIN", variant: "destructive" });
      return;
    }
    
    if (!pending.ndprConsentGranted && ndprConsent) {
      const success = await acceptNdprConsent(pending.sessionToken);
      if (!success) {
        setLoading(false);
        toast({ title: "Failed to record NDPR consent", variant: "destructive" });
        return;
      }
    }
    
    setLoading(false);
    const confirmedSession = { ...pending, isAdmin: true, hasAdminPin: true, ndprConsentGranted: pending.ndprConsentGranted || ndprConsent };
    saveTenantSession(confirmedSession);
    logAuthEvent({ authType: "tenant", eventType: "login", tenantId: confirmedSession.tenantId, sessionToken: confirmedSession.sessionToken }).catch(() => {});
    navigate("/app", { replace: true });
  };

  const handleSetAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    
    if (!pending.ndprConsentGranted && !ndprConsent) {
      toast({ title: "Please accept the NDPR agreement", variant: "destructive" });
      return;
    }
    
    if (adminPin.length < 4) {
      toast({ title: "Password too short", description: "Use at least 4 characters.", variant: "destructive" });
      return;
    }
    if (adminPin !== confirmPin) {
      toast({ title: "PINs do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const ok = await setAdminPin({ ...pending, isAdmin: false }, adminPin.trim());
    if (!ok) {
      setLoading(false);
      toast({ title: "Could not set PIN", description: "Already set — contact provider.", variant: "destructive" });
      return;
    }
    
    if (!pending.ndprConsentGranted && ndprConsent) {
      const success = await acceptNdprConsent(pending.sessionToken);
      if (!success) {
        setLoading(false);
        toast({ title: "Failed to record NDPR consent", variant: "destructive" });
        return;
      }
    }
    
    setLoading(false);
    const confirmedSession = { ...pending, isAdmin: true, hasAdminPin: true, ndprConsentGranted: pending.ndprConsentGranted || ndprConsent };
    saveTenantSession(confirmedSession);
    logAuthEvent({ authType: "tenant", eventType: "login", tenantId: confirmedSession.tenantId, sessionToken: confirmedSession.sessionToken }).catch(() => {});
    toast({ title: "Admin PIN created", description: "Welcome!" });
    navigate("/app", { replace: true });
  };

  const banner = pending ? (() => {
    const d = daysRemaining({ ...pending, isAdmin: false });
    if (pending.status === "trial") return `🎁 Free trial — ${d ?? "?"} days left`;
    if (d !== null && d <= 14) return `⏰ Subscription ends in ${d} days`;
    return null;
  })() : null;

  return (
    <div className="auth-bg">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />
      <div className="auth-dots" />



      <div className="auth-layout">
        <div className="auth-side">
          <div className="auth-side-tag">Cloud Management</div>
          <h1 className="auth-side-title">
            The modern way to run your <span>school.</span>
          </h1>
          <p className="auth-side-sub">
            Trusted by educational institutions to manage grades, attendance, and staff seamlessly. 
            All your data, synced and secured.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="auth-feature">
              <div className="auth-feature-icon" style={{ color: "#2563eb" }}>⚡</div>
              Offline-first technology
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon" style={{ color: "#16a34a" }}>📊</div>
              Real-time synchronization
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon" style={{ color: "#8b5cf6" }}>🔒</div>
              Bank-grade PIN security
            </div>
          </div>
        </div>

        <div className="auth-card-wrapper">
          <div className="auth-float-card badge-1">
            <div className="auth-float-card-icon" style={{ color: "#2563eb" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
            </div>
            <span>Grade Analytics</span>
          </div>
          <div className="auth-float-card badge-2">
            <div className="auth-float-card-icon" style={{ color: "#059669" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span>End-to-End Secure</span>
          </div>
          <div className="auth-card" style={{ width: "100%" }}>
            <div className="auth-logo-ring">
            <GraduationCap size={28} color="#fff" strokeWidth={2} />
          </div>

          <div className="auth-steps">
            <div className={`auth-step-dot ${step === "school" ? "on" : "on"}`} />
            <div className={`auth-step-dot ${step !== "school" ? "on" : ""}`} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
            <h2 className="auth-title">
              {step === "school" && "School Login"}
              {step === "admin" && "Admin PIN"}
              {step === "set-admin" && "Create PIN"}
            </h2>
            {pending && (
              <span className="auth-badge">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />
                {pending.status === "trial" ? "Trial" : "Active"}
              </span>
            )}
          </div>

          <p className="auth-subtitle">
            {step === "school" && "Enter your school's unique access PIN to continue."}
            {step === "admin" && <>Verifying access for <strong>{pending?.schoolName}</strong></>}
            {step === "set-admin" && "First-time setup. Create a secure admin PIN for your school."}
          </p>

          {banner && (
            <div className="auth-notice warn" style={{ marginTop: "1rem" }}>
              {banner}
            </div>
          )}

          <div style={{ marginTop: "1.75rem" }}>
            {step === "school" && (
              <form onSubmit={handleSchool} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="auth-label" htmlFor="tenantCode">School Code</label>
                  <input
                    id="tenantCode" className="auth-input" type="text" inputMode="text"
                    value={tenantCode} onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SC-123" required autoFocus
                    style={{ letterSpacing: tenantCode ? "0.1em" : "normal", fontWeight: tenantCode ? 600 : 400 }}
                  />
                  <p style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#64748b" }}>
                    The 6-character code given by your provider.
                  </p>
                </div>
                <div>
                  <label className="auth-label" htmlFor="schoolPin">School PIN</label>
                  <input
                    id="schoolPin" className="auth-input" type="text" inputMode="text"
                    value={schoolPin} onChange={(e) => setSchoolPin(e.target.value.toUpperCase())}
                    placeholder="e.g. SCH-7K2P" required
                    style={{ letterSpacing: schoolPin ? "0.1em" : "normal", fontWeight: schoolPin ? 600 : 400 }}
                  />
                  <p style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#64748b" }}>
                    Issued by your provider on subscription.
                  </p>
                </div>

                <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.5rem" }}>
                  {loading ? <><Spinner /> Verifying…</> : <>Continue</>}
                </button>


              </form>
            )}

            {step === "admin" && (
              <form onSubmit={handleAdmin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label className="auth-label" htmlFor="adminPin">Admin PIN</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="adminPin" className="auth-input"
                      type={showPin ? "text" : "password"}
                      value={adminPin} onChange={(e) => setAdminPinInput(e.target.value)}
                      required autoFocus placeholder="Enter your admin password"
                    />
                    <button type="button" onClick={() => setShowPin(p => !p)}
                      style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                      {showPin ? "Hide" : "Show"}
                    </button>
                    </div>
                  </div>
  
                  {pending && !pending.ndprConsentGranted && (
                    <div className="flex items-start gap-2 bg-slate-50 border p-3 rounded-md text-xs text-slate-700">
                      <input 
                        type="checkbox" 
                        id="ndpr-admin" 
                        required 
                        className="mt-0.5"
                        checked={ndprConsent}
                        onChange={e => setNdprConsent(e.target.checked)}
                      />
                      <label htmlFor="ndpr-admin" className="cursor-pointer">
                        I agree to the Privacy Policy and consent to the processing of my school's data in accordance with NDPR.
                      </label>
                    </div>
                  )}

                  <button type="submit" className="auth-btn" disabled={loading}>
                    {loading ? <><Spinner /> Verifying…</> : <>Unlock School</>}
                  </button>

                <button type="button" className="auth-back-link" style={{ justifyContent: "center", marginBottom: 0 }}
                  onClick={() => { setStep("school"); setPending(null); setAdminPinInput(""); }}>
                  &larr; Use a different school PIN
                </button>
              </form>
            )}

            {step === "set-admin" && (
              <form onSubmit={handleSetAdmin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="auth-notice" style={{ textAlign: "left", marginBottom: "0.5rem" }}>
                  🔐 First-time setup — create your school’s admin password. Letters, numbers and symbols are allowed. Keep it private.
                </div>

                <div>
                  <label className="auth-label" htmlFor="newPin">New Admin PIN</label>
                  <div style={{ position: "relative" }}>
                    <input id="newPin" className="auth-input" type={showPin ? "text" : "password"} minLength={4} value={adminPin} onChange={(e) => setAdminPinInput(e.target.value)} required autoFocus placeholder="Min 4 characters" />
                    <button type="button" onClick={() => setShowPin(p => !p)} style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>{showPin ? "Hide" : "Show"}</button>
                  </div>
                </div>

                <div>
                  <label className="auth-label" htmlFor="confirmPin">Confirm PIN</label>
                  <div style={{ position: "relative" }}>
                    <input id="confirmPin" className="auth-input" type={showConfirm ? "text" : "password"} minLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} required placeholder="Re-enter password" />
                    <button type="button" onClick={() => setShowConfirm(p => !p)} style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>{showConfirm ? "Hide" : "Show"}</button>
                    </div>
                    {confirmPin && adminPin && confirmPin !== adminPin && (
                      <p style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#ef4444" }}>PINs don't match</p>
                    )}
                  </div>

                  {pending && !pending.ndprConsentGranted && (
                    <div className="flex items-start gap-2 bg-slate-50 border p-3 rounded-md text-xs text-slate-700">
                      <input 
                        type="checkbox" 
                        id="ndpr-setadmin" 
                        required 
                        className="mt-0.5"
                        checked={ndprConsent}
                        onChange={e => setNdprConsent(e.target.checked)}
                      />
                      <label htmlFor="ndpr-setadmin" className="cursor-pointer">
                        I agree to the Privacy Policy and consent to the processing of my school's data in accordance with NDPR.
                      </label>
                    </div>
                  )}
  
                  <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: "0.5rem" }}>
                    {loading ? <><Spinner /> Saving…</> : <>Create PIN & Enter</>}
                  </button>
              </form>
            )}
          </div>

          <div style={{ marginTop: "1.75rem", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Powered by</span>
              <img src="/logo.png" alt="Titbeattechsolutions Logo" style={{ height: "28px", width: "auto", objectFit: "contain" }} />
              <strong style={{ color: "#64748b", fontSize: "0.75rem" }}>Titbeattechsolutions LTD</strong>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
