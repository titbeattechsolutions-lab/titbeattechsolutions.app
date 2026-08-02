import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "school_admin" | "principal" | "head_teacher" | "teacher" | "student" | "unassigned" | "error";

export interface AuthProfile {
  userId: string;
  email: string | null;
  role: AppRole;
  schoolId: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  role: AppRole | null;
  schoolId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function insertSessionLog(
  action: "login" | "logout",
  profile: AuthProfile
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("session_logs").insert({
      user_id:   profile.userId,
      school_id: profile.schoolId ?? null,
      user_name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || profile.userId,
      role:      profile.role,
      action,
      device:    navigator.userAgent.slice(0, 200),
    });
    if (error && error.code !== '42501') {
      console.warn('Session log failed:', error);
    }
  } catch { /* non-critical — never block auth flow */ }
}

async function fetchProfile(userId: string, email: string | null): Promise<AuthProfile> {
  try {
    // First try fetching from public.profiles (Phase 2 table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRow, error: profileErr } = await (supabase as any)
      .from("profiles")
      .select("role, school_id, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    // Get the definitive role from the backend RPC which checks user_roles first
    const { data: myRole, error: roleErr } = await supabase.rpc("get_my_role");

    if (roleErr) {
      console.error("AuthContext -> get_my_role failed:", roleErr);
    }

    if (profileErr && profileErr.code !== 'PGRST116') {
      return { userId, email, role: "error", schoolId: null, firstName: null, lastName: null };
    }

    let role = (myRole as AppRole) ?? (profileRow?.role as AppRole) ?? "unassigned";
    let schoolId = profileRow?.school_id ?? null;

    // If role is unassigned, see if there's a pre-registration invite to claim
    if (role === "unassigned") {
      const { data: claimed } = await supabase.rpc("claim_pre_registration");
      if (claimed) {
        // Re-fetch profile to get the newly assigned role and schoolId
        const { data: updatedProfile } = await (supabase as any)
          .from("profiles")
          .select("role, school_id, first_name, last_name")
          .eq("id", userId)
          .maybeSingle();

        if (updatedProfile) {
          role = (updatedProfile.role as AppRole) ?? "unassigned";
          schoolId = updatedProfile.school_id ?? null;
        }
      }
    }

    return {
      userId,
      email,
      role,
      schoolId,
      firstName: profileRow?.first_name ?? null,
      lastName: profileRow?.last_name ?? null,
    };
  } catch (err) {
    console.error("fetchProfile critical error:", err);
    return { userId, email, role: "error", schoolId: null, firstName: null, lastName: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef<AuthProfile | null>(null);
  // Track whether we already logged a login for this session to avoid duplicates
  const loggedLoginRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user.email ?? null).then((p) => {
          setProfile(p);
          profileRef.current = p;
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error("Auth session error:", err);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        if (profileRef.current?.userId !== s.user.id) {
          setLoading(true);
          fetchProfile(s.user.id, s.user.email ?? null).then((p) => {
            setProfile(p);
            profileRef.current = p;
            setLoading(false);
            // Log login once per session id
            if (event === "SIGNED_IN" && loggedLoginRef.current !== s.access_token) {
              loggedLoginRef.current = s.access_token ?? null;
              insertSessionLog("login", p);
            }
          });
        } else {
          // If profile is already loaded (e.g. TOKEN_REFRESHED)
          if (event === "SIGNED_IN" && loggedLoginRef.current !== s.access_token) {
            loggedLoginRef.current = s.access_token ?? null;
            if (profileRef.current) insertSessionLog("login", profileRef.current);
          }
        }
      } else {
        if (profileRef.current !== null) {
          setProfile(null);
          profileRef.current = null;
        }
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (profileRef.current) {
      await insertSessionLog("logout", profileRef.current);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role ?? null,
        schoolId: profile?.schoolId ?? null,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
