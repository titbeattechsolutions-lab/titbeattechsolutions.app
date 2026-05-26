import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { bulkCreateStudents, Student, Class } from "@/supabase/schoolService";
import {
  useStudentsPaged, useClasses, useCreateStudent, useUpdateStudent,
  useArchiveStudent, STUDENT_PAGE_SIZE,
} from "@/hooks/useSchoolQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Upload, Pencil, Archive, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";

type DrawerMode = "add" | "edit" | null;

const EMPTY_FORM = {
  admission_no: "", first_name: "", last_name: "", other_names: "",
  gender: "" as "male" | "female" | "",
  date_of_birth: "", class_id: "", class_name: "",
  guardian_name: "", guardian_phone: "", guardian_email: "", guardian_relationship: "",
};

export default function StudentsPage() {
  const { schoolId } = useAuth();
  const { toast } = useToast();

  const [page, setPage] = useState(0);
  const [filterClass, setFilterClass] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const filters = {
    ...(filterClass !== "all" && { class_id: filterClass }),
    ...(filterStatus !== "all" && { status: filterStatus }),
    ...(search && { search }),
  };

  const { data, isFetching, isError } = useStudentsPaged(page, filters);
  const { data: classesData } = useClasses();
  const students = data?.students ?? [];
  const total = data?.total ?? 0;
  const classes: Class[] = classesData ?? [];
  const totalPages = Math.ceil(total / STUDENT_PAGE_SIZE);

  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const archiveStudent = useArchiveStudent();

  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);

  const [csvProgress, setCsvProgress] = useState<number | null>(null);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const openAdd = () => { setForm(EMPTY_FORM); setEditTarget(null); setDrawer("add"); };
  const openEdit = (s: Student) => {
    setEditTarget(s);
    setForm({
      admission_no: s.admission_no, first_name: s.first_name, last_name: s.last_name,
      other_names: s.other_names ?? "", gender: (s.gender ?? "") as "male" | "female" | "",
      date_of_birth: s.date_of_birth ?? "", class_id: s.class_id ?? "", class_name: s.class_name ?? "",
      guardian_name: s.guardian_name ?? "", guardian_phone: s.guardian_phone ?? "",
      guardian_email: s.guardian_email ?? "", guardian_relationship: s.guardian_relationship ?? "",
    });
    setDrawer("edit");
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.admission_no) {
      toast({ title: "Required fields missing", description: "First name, last name and admission number are required.", variant: "destructive" });
      return;
    }
    try {
      const className = classes.find((c) => c.id === form.class_id)?.name ?? form.class_name;
      const payload = { ...form, class_name: className, status: "active" as const, gender: (form.gender || null) as "male" | "female" | null };
      if (drawer === "add") {
        await createStudent.mutateAsync(payload);
        toast({ title: "Student added" });
      } else if (editTarget) {
        await updateStudent.mutateAsync({ id: editTarget.id, updates: payload });
        toast({ title: "Student updated" });
      }
      setDrawer(null);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveStudent.mutateAsync(archiveTarget.id);
      toast({ title: "Student archived" });
      setArchiveTarget(null);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    const text = await file.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

    const rows = lines.slice(1).map((line, idx) => {
      const vals = line.split(",").map((v) => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      return { idx: idx + 2, obj };
    });

    const valid: Parameters<typeof bulkCreateStudents>[1] = [];
    const errs: { row: number; reason: string }[] = [];

    for (const { idx, obj } of rows) {
      if (!obj.first_name) { errs.push({ row: idx, reason: "Missing first_name" }); continue; }
      if (!obj.last_name)  { errs.push({ row: idx, reason: "Missing last_name" }); continue; }
      if (!obj.admission_no) { errs.push({ row: idx, reason: "Missing admission_no" }); continue; }
      valid.push({
        admission_no: obj.admission_no, first_name: obj.first_name, last_name: obj.last_name,
        other_names: obj.other_names || null, gender: (obj.gender as "male" | "female") || null,
        date_of_birth: obj.date_of_birth || null, class_id: obj.class_id || null,
        class_name: obj.class_name || null, status: "active",
        guardian_name: obj.guardian_name || null, guardian_phone: obj.guardian_phone || null,
        guardian_email: obj.guardian_email || null, guardian_relationship: obj.guardian_relationship || null,
        photo: null,
      });
    }

    setCsvErrors(errs);
    setCsvProgress(0);

    const CHUNK = 500;
    let inserted = 0;
    const chunkErrors: { row: number; reason: string }[] = [];

    for (let i = 0; i < valid.length; i += CHUNK) {
      const result = await bulkCreateStudents(schoolId, valid.slice(i, i + CHUNK));
      inserted += result.inserted;
      chunkErrors.push(...result.errors);
      setCsvProgress(Math.round(((i + CHUNK) / valid.length) * 100));
    }

    setCsvProgress(100);
    setCsvErrors((prev) => [...prev, ...chunkErrors]);
    toast({ title: `Import complete`, description: `${inserted} students imported. ${errs.length + chunkErrors.length} errors.` });
    load();
    if (fileRef.current) fileRef.current.value = "";
  };

  const statusColor = (s: string) =>
    s === "active" ? "bg-emerald-100 text-emerald-700" :
    s === "graduated" ? "bg-blue-100 text-blue-700" :
    "bg-slate-100 text-slate-500";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">Students</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} className="mr-1" /> Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          <Button size="sm" onClick={openAdd}>
            <UserPlus size={14} className="mr-1" /> Add Student
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8 h-8 w-48 text-sm"
            placeholder="Search name / ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(0); } }}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="graduated">Graduated</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setPage(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {total > 0 && (
          <span className="text-xs text-slate-400 ml-auto">{total} student{total !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* CSV progress */}
      {csvProgress !== null && csvProgress < 100 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Importing… {csvProgress}%</p>
          <Progress value={csvProgress} />
        </div>
      )}

      {/* CSV errors */}
      {csvErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-red-700 mb-1">{csvErrors.length} row(s) failed:</p>
          <ul className="space-y-0.5 text-red-600 max-h-32 overflow-y-auto">
            {csvErrors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {isFetching && students.length === 0 ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : isError ? (
          <p className="text-center text-red-400 py-12 text-sm">Failed to load students</p>
        ) : students.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No students found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Admission No", "Name", "Class", "Status", "Guardian Phone", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.admission_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{s.last_name}, {s.first_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.class_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(s.status)}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.guardian_phone ?? "—"}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                      <Pencil size={13} />
                    </Button>
                    {s.status === "active" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setArchiveTarget(s)}>
                        <Archive size={13} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Showing {page * STUDENT_PAGE_SIZE + 1}–{Math.min((page + 1) * STUDENT_PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} className="mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || isFetching} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Drawer */}
      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer === "add" ? "Add Student" : "Edit Student"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {(["admission_no", "first_name", "last_name", "other_names"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field.replace(/_/g, " ")}</Label>
                <Input value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v as "male" | "female" }))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm((f) => ({ ...f, class_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">Guardian Info</p>
              {(["guardian_name", "guardian_phone", "guardian_email", "guardian_relationship"] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field.replace(/_/g, " ")}</Label>
                  <Input value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={createStudent.isPending || updateStudent.isPending} className="w-full">
              {(createStudent.isPending || updateStudent.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
              {drawer === "add" ? "Add Student" : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Archive confirm */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Student?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.first_name} {archiveTarget?.last_name} will be marked as withdrawn. This can be reversed by editing the student.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={archiveStudent.isPending} className="bg-red-600 hover:bg-red-700">
              {archiveStudent.isPending && <Loader2 size={14} className="mr-1 animate-spin" />} Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
