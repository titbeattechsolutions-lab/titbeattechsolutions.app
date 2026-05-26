import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "school_admin" | "principal" | "head_teacher" | "teacher" | "unassigned";

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
    await (supabase as any).from("session_logs").insert({
      user_id:   profile.userId,
      school_id: profile.schoolId ?? null,
      user_name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || profile.userId,
      role:      profile.role,
      action,
      device:    navigator.userAgent.slice(0, 200),
    });
  } catch { /* non-critical — never block auth flow */ }
}

async function fetchProfile(userId: string, email: string | null): Promise<AuthProfile> {
  // First try fetching from public.profiles (Phase 2 table)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRow } = await (supabase as any)
    .from("profiles")
    .select("role, school_id, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileRow) {
    return {
      userId,
      email,
      role: (profileRow.role as AppRole) ?? "unassigned",
      schoolId: profileRow.school_id ?? null,
      firstName: profileRow.first_name ?? null,
      lastName: profileRow.last_name ?? null,
    };
  }

  // Fallback: check user_roles table (super_admin bootstrap path)
  const { data: isSuperAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (isSuperAdmin) {
    return { userId, email, role: "super_admin", schoolId: null, firstName: null, lastName: null };
  }

  return { userId, email, role: "unassigned", schoolId: null, firstName: null, lastName: null };
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
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
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
        setProfile(null);
        profileRef.current = null;
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
