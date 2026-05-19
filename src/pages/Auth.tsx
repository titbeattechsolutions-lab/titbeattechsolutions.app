import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: "a-spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/admin", { replace: true });
    });
  }, [navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/admin", { replace: true });
    } catch (err) {
      toast({ title: "Sign-in failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-blob auth-blob-1" style={{ background: "radial-gradient(circle,rgba(124,58,237,.07) 0%,transparent 70%)" }} />
      <div className="auth-blob auth-blob-2" style={{ background: "radial-gradient(circle,rgba(219,39,119,.05) 0%,transparent 70%)" }} />
      <div className="auth-blob auth-blob-3" style={{ background: "radial-gradient(circle,rgba(99,102,241,.06) 0%,transparent 70%)" }} />
      <div className="auth-dots" />

      {/* Ambient floating cards for Admin page */}
      <div className="auth-float-card" style={{ top: "15%", left: "6%", animationDelay: "0s" }}>
        <div className="auth-float-card-icon" style={{ color: "#7c3aed" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <span>Manage Schools</span>
      </div>
      <div className="auth-float-card" style={{ bottom: "20%", right: "5%", animationDelay: "2s" }}>
        <div className="auth-float-card-icon" style={{ color: "#db2777" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
        </div>
        <span>Record Payments</span>
      </div>

      <div className="auth-layout" style={{ justifyContent: "center" }}>
        <div className="auth-card" style={{ maxWidth: 440 }}>
          <button className="auth-back-link" onClick={() => navigate("/")}>
            &larr; Back to school login
          </button>

          <div style={{ marginBottom: "2rem" }}>
            <div className="auth-logo-ring admin">
              <Shield size={26} color="#fff" strokeWidth={2.5} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
              <h2 className="auth-title">Provider Console</h2>
              <span className="auth-badge admin">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6" }} />
                Admin only
              </span>
            </div>
            <p className="auth-subtitle">
              Restricted access for service providers. Schools should use the{" "}
              <button onClick={() => navigate("/")} className="auth-link-btn" style={{ fontSize: "inherit" }}>
                school login
              </button>{" "}instead.
            </p>
          </div>

          <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label className="auth-label" htmlFor="email">Email address</label>
              <input
                id="email" className="auth-input" type="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" autoFocus placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="auth-label" htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password" className="auth-input" type={showPass ? "text" : "password"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} autoComplete="current-password" placeholder="Your password"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-btn admin-btn" disabled={loading} style={{ marginTop: "0.5rem" }}>
              {loading ? <><Spinner /> Signing in…</> : <>Sign in to Console</>}
            </button>
          </form>

          <div className="auth-notice" style={{ marginTop: "1.5rem" }}>
            🛡️ New super-admin accounts are provisioned by invitation only — no public sign-up.
          </div>

          <div style={{ marginTop: "1.75rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              Powered by <strong style={{ color: "#64748b" }}>Titbeattechsolutions LLC</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
