import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getClasses, getTeachers, createClass, updateClass, Class, Teacher } from "@/supabase/schoolService";
import { useSchool } from "@/hooks/useSchool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Pencil, Users, Loader2 } from "lucide-react";

type DrawerMode = "add" | "edit" | null;

const TERMS = ["first", "second", "third"] as const;

export default function ClassesPage() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [editTarget, setEditTarget] = useState<Class | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", level: "", arm: "",
    class_teacher_id: "",
    academic_year: "",
    term: "first" as Class["term"],
  });

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [c, t] = await Promise.all([getClasses(schoolId), getTeachers(schoolId)]);
      setClasses(c);
      setTeachers(t);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [schoolId]); // eslint-disable-line

  const openAdd = () => {
    setForm({ name: "", level: "", arm: "", class_teacher_id: "", academic_year: school?.academic_year ?? "", term: school?.current_term ?? "first" });
    setEditTarget(null);
    setDrawer("add");
  };

  const openEdit = (c: Class) => {
    setEditTarget(c);
    setForm({ name: c.name, level: c.level ?? "", arm: c.arm ?? "", class_teacher_id: c.class_teacher_id ?? "", academic_year: c.academic_year, term: c.term });
    setDrawer("edit");
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!form.name || !form.academic_year) {
      toast({ title: "Name and academic year required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const teacherName = teachers.find((t) => t.id === form.class_teacher_id);
      const payload = {
        ...form,
        class_teacher_id: form.class_teacher_id || null,
        class_teacher_name: teacherName ? `${teacherName.first_name} ${teacherName.last_name}` : null,
        level: form.level || null,
        arm: form.arm || null,
      };
      if (drawer === "add") {
        await createClass(schoolId, payload);
        toast({ title: "Class created" });
      } else if (editTarget) {
        await updateClass(schoolId, editTarget.id, payload);
        toast({ title: "Class updated" });
      }
      setDrawer(null);
      load();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Classes</h1>
        <Button size="sm" onClick={openAdd}>
          <PlusCircle size={14} className="mr-1" /> New Class
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : classes.length === 0 ? (
        <p className="text-center text-slate-400 py-12 text-sm">No classes yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {classes.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 text-base">{c.name}</p>
                    {c.level && <p className="text-xs text-slate-500">{c.level}{c.arm ? ` — ${c.arm}` : ""}</p>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEdit(c)}>
                    <Pencil size={13} />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {c.student_count} students
                  </span>
                  {c.class_teacher_name && (
                    <span className="truncate">👤 {c.class_teacher_name}</span>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {c.academic_year} · {c.term.charAt(0).toUpperCase() + c.term.slice(1)} term
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer === "add" ? "Create Class" : "Edit Class"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Class Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. JSS 1 Gold" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Input value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} placeholder="e.g. JSS 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Arm</Label>
                <Input value={form.arm} onChange={(e) => setForm((f) => ({ ...f, arm: e.target.value }))} placeholder="e.g. Gold" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Class Teacher</Label>
              <Select value={form.class_teacher_id} onValueChange={(v) => setForm((f) => ({ ...f, class_teacher_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Academic Year *</Label>
              <Input value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} placeholder="e.g. 2025/2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={form.term} onValueChange={(v) => setForm((f) => ({ ...f, term: v as Class["term"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)} Term</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {drawer === "add" ? "Create Class" : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
