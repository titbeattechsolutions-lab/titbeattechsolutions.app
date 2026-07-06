import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Shield, School, Save, Loader2, CheckCircle2 } from "lucide-react";
import SignaturePad from "@/components/shared/SignaturePad";

const ROLE_LABELS: Record<string, string> = {
  school_admin:  "School Admin",
  principal:     "Principal",
  head_teacher:  "Head Teacher",
  teacher:       "Teacher",
  student:       "Student",
  super_admin:   "Super Admin",
  unassigned:    "Unassigned",
};

export default function TeacherProfilePage() {
  const { profile, user } = useAuth();

  const [signature, setSignature] = useState("");
  const [originalSignature, setOriginalSignature] = useState("");
  const [schoolDefault, setSchoolDefault] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile?.schoolId) return;

    (async () => {
      setIsLoading(true);
      // Fetch user's own signature
      const { data: pData } = await (supabase
        .from("profiles") as any)
        .select("signature")
        .eq("id", user.id)
        .single();
      
      if ((pData as any)?.signature) {
        setSignature((pData as any).signature);
        setOriginalSignature((pData as any).signature);
      }

      // Fetch school's default teacher signature
      const { data: sData } = await (supabase
        .from("schools") as any)
        .select("default_teacher_signature")
        .eq("tenant_id", profile.schoolId)
        .single();
      
      if ((sData as any)?.default_teacher_signature) {
        setSchoolDefault((sData as any).default_teacher_signature);
      }
      setIsLoading(false);
    })();
  }, [user?.id, profile?.schoolId]);

  const handleSaveSignature = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    setSaveSuccess(false);

    const { error } = await (supabase
      .from("profiles") as any)
      .update({ signature: signature || null })
      .eq("id", user.id);

    setIsSaving(false);
    if (!error) {
      setOriginalSignature(signature);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const hasChanges = signature !== originalSignature;

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "—";
  const initials = [profile?.firstName, profile?.lastName]
    .filter(Boolean)
    .map((s) => s![0].toUpperCase())
    .join("") || profile?.email?.[0]?.toUpperCase() || "?";

  return (
    <div className="space-y-6 max-w-lg pb-10">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Profile</h1>
        <p className="text-sm text-slate-500">View your details and manage your personal signature.</p>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-indigo-700 text-white text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{fullName}</CardTitle>
              <Badge variant="outline" className="mt-1 text-xs">
                {ROLE_LABELS[profile?.role ?? "unassigned"] ?? profile?.role}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Mail size={15} className="text-slate-400 shrink-0" />
            <span>{profile?.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Shield size={15} className="text-slate-400 shrink-0" />
            <span>{ROLE_LABELS[profile?.role ?? "unassigned"] ?? profile?.role}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <School size={15} className="text-slate-400 shrink-0" />
            <span className="font-mono text-xs text-slate-500">{profile?.schoolId ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Signature</CardTitle>
          <CardDescription>
            Draw your signature below. This will be automatically applied to report cards for classes you manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="h-[150px] flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <SignaturePad value={signature} onChange={setSignature} />
          )}

          {schoolDefault && !signature && !isLoading && (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                School default (set by admin)
              </p>
              {schoolDefault.startsWith("data:image") ? (
                <img src={schoolDefault} alt="Default Signature" className="max-h-12 object-contain" />
              ) : (
                <span className="text-sm italic text-slate-600">{schoolDefault}</span>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveSignature}
              disabled={!hasChanges || isSaving || isLoading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                hasChanges
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-[0.98]"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle2 size={16} className="text-emerald-300" />
              ) : (
                <Save size={16} />
              )}
              {saveSuccess ? "Saved!" : "Save Signature"}
            </button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400 text-center">
        Contact your school admin to update other profile details.
      </p>
    </div>
  );
}
