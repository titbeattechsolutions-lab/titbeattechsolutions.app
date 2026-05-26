import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getTeachers, createTeacher, updateTeacher, Teacher } from "@/supabase/schoolService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Pencil, Loader2 } from "lucide-react";

type DrawerMode = "add" | "edit" | null;

const EMPTY_FORM = {
  employee_id: "", first_name: "", last_name: "", email: "", phone: "",
  role: "teacher" as Teacher["role"],
  status: "active" as Teacher["status"],
};

export default function TeachersPage() {
  const { schoolId } = useAuth();
  const { toast } = useToast();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try { setTeachers(await getTeachers(schoolId)); }
    catch (e) { toast({ title: "Error", description: (e as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [schoolId]); // eslint-disable-line

  const openAdd = () => { setForm(EMPTY_FORM); setEditTarget(null); setDrawer("add"); };
  const openEdit = (t: Teacher) => {
    setEditTarget(t);
    setForm({ employee_id: t.employee_id ?? "", first_name: t.first_name, last_name: t.last_name,
      email: t.email ?? "", phone: t.phone ?? "", role: t.role, status: t.status });
    setDrawer("edit");
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!form.first_name || !form.last_name) {
      toast({ title: "Name required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      if (drawer === "add") {
        await createTeacher(schoolId, {
          ...form, auth_user_id: null, subject_ids: [], class_ids: [],
          is_class_teacher: false, class_teacher_of: null,
        }, form.email || undefined);
        toast({ title: "Teacher added" });
      } else if (editTarget) {
        await updateTeacher(schoolId, editTarget.id, form);
        toast({ title: "Teacher updated" });
      }
      setDrawer(null);
      load();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-emerald-100 text-emerald-700" :
    s === "on_leave" ? "bg-amber-100 text-amber-700" :
    "bg-slate-100 text-slate-500";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Teachers</h1>
        <Button size="sm" onClick={openAdd}>
          <UserPlus size={14} className="mr-1" /> Add Teacher
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : teachers.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No teachers yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Name", "Employee ID", "Role", "Email", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{t.last_name}, {t.first_name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{t.employee_id ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{t.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-slate-600">{t.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(t.status)}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer === "add" ? "Add Teacher" : "Edit Teacher"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {(["first_name", "last_name", "employee_id", "email", "phone"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field.replace(/_/g, " ")}</Label>
                <Input value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Teacher["role"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="head_teacher">Head Teacher</SelectItem>
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="school_admin">School Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Teacher["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {drawer === "add" ? "Add Teacher" : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
