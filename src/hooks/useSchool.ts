import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSchoolProfile, School } from "@/supabase/schoolService";

export function useSchool() {
  const { schoolId } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSchoolProfile(schoolId)
      .then((s) => { setSchool(s); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [schoolId]);

  return { school, setSchool, loading, error };
}
