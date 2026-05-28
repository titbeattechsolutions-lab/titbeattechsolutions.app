import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Shield, School } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  student:       "Student",
  school_admin:  "School Admin",
  principal:     "Principal",
  head_teacher:  "Head Teacher",
  teacher:       "Teacher",
  super_admin:   "Super Admin",
  unassigned:    "Unassigned",
};

export default function StudentProfilePage() {
  const { profile } = useAuth();

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "—";
  const initials = [profile?.firstName, profile?.lastName]
    .filter(Boolean)
    .map((s) => s![0].toUpperCase())
    .join("") || profile?.email?.[0]?.toUpperCase() || "?";

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-xl font-bold text-slate-800">My Profile</h1>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-emerald-700 text-white text-xl font-bold">
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

      <p className="text-xs text-slate-400 text-center">
        Contact your school admin to update your profile details.
      </p>
    </div>
  );
}
