import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { getFees, createFee, updateFee, deleteFee, getClasses, Fee, Class } from "@/supabase/schoolService";
import FeatureGuard from "@/components/FeatureGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Pencil, Trash2, Loader2, Wallet } from "lucide-react";

type DrawerMode = "add" | "edit" | null;
type Term = "first" | "second" | "third";

const EMPTY_FORM = {
  name: "", amount: "", currency: "NGN",
  term: "first" as Term, academic_year: "",
  due_date: "", applicable_to: ["all"] as string[],
};

const TERM_LABELS: Record<Term, string> = { first: "1st Term", second: "2nd Term", third: "3rd Term" };

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}

export default function FeesPage() {
  return (
    <FeatureGuard feature="fees">
      <FeesPageContent />
    </FeatureGuard>
  );
}

function FeesPageContent() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [fees, setFees] = useState<Fee[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [filterTerm, setFilterTerm] = useState<Term | "all">("all");
  const [loading, setLoading] = useState(true);

  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [editTarget, setEditTarget] = useState<Fee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Fee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [f, c] = await Promise.all([
        getFees(schoolId, filterTerm !== "all" ? filterTerm : undefined),
        getClasses(schoolId),
      ]);
      setFees(f);
      setClasses(c);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [schoolId, filterTerm]); // eslint-disable-line

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, academic_year: school?.academic_year ?? "", term: school?.current_term ?? "first" });
    setEditTarget(null);
    setDrawer("add");
  };

  const openEdit = (f: Fee) => {
    setEditTarget(f);
    setForm({
      name: f.name, amount: String(f.amount), currency: f.currency,
      term: f.term, academic_year: f.academic_year,
      due_date: f.due_date ?? "",
      applicable_to: f.applicable_to?.length ? f.applicable_to : ["all"],
    });
    setDrawer("edit");
  };

  const toggleApplicable = (classId: string) => {
    setForm((f) => {
      if (classId === "all") return { ...f, applicable_to: ["all"] };
      const without = f.applicable_to.filter((x) => x !== "all");
      if (without.includes(classId)) {
        const next = without.filter((x) => x !== classId);
        return { ...f, applicable_to: next.length ? next : ["all"] };
      }
      return { ...f, applicable_to: [...without, classId] };
    });
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!form.name || !form.amount || !form.academic_year) {
      toast({ title: "Name, amount and academic year are required", variant: "destructive" }); return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Amount must be a positive number", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, amount, currency: form.currency,
        term: form.term, academic_year: form.academic_year,
        due_date: form.due_date || null,
        applicable_to: form.applicable_to,
      };
      if (drawer === "add") {
        await createFee(schoolId, payload);
        toast({ title: "Fee created" });
      } else if (editTarget) {
        await updateFee(schoolId, editTarget.id, payload);
        toast({ title: "Fee updated" });
      }
      setDrawer(null);
      load();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !schoolId) return;
    setDeleting(true);
    try {
      await deleteFee(schoolId, deleteTarget.id);
      toast({ title: "Fee deleted" });
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const feesByTerm = fees.reduce<Record<string, Fee[]>>((acc, f) => {
    (acc[f.term] ??= []).push(f);
    return acc;
  }, {});

  const termsToShow = (filterTerm === "all"
    ? (["first", "second", "third"] as Term[])
    : [filterTerm]
  ).filter((t) => feesByTerm[t]?.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fee Management</h1>
          <p className="text-sm text-slate-500">Create and manage school fee items by term</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <PlusCircle size={14} className="mr-1" /> Create Fee
        </Button>
      </div>

      {/* Term filter */}
      <div className="flex gap-2 flex-wrap">
        {([["all", "All Terms"], ["first", "1st Term"], ["second", "2nd Term"], ["third", "3rd Term"]] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterTerm(val as Term | "all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterTerm === val
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : fees.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Wallet size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No fees defined yet. Create your first fee item.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {termsToShow.map((term) => (
            <div key={term}>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                {TERM_LABELS[term]}
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {["Fee Name", "Amount", "Due Date", "Applicable To", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {feesByTerm[term]?.map((fee) => (
                      <tr key={fee.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{fee.name}</td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{formatNaira(fee.amount)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {fee.due_date ? new Date(fee.due_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(fee.applicable_to?.length === 0 || fee.applicable_to?.includes("all"))
                              ? <Badge variant="secondary" className="text-xs">All Classes</Badge>
                              : fee.applicable_to.map((id) => (
                                  <Badge key={id} variant="outline" className="text-xs">
                                    {classes.find((c) => c.id === id)?.name ?? id}
                                  </Badge>
                                ))
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(fee)}>
                            <Pencil size={13} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(fee)}>
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Drawer */}
      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer === "add" ? "Create Fee" : "Edit Fee"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Fee Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. School Fees - 1st Term" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (NGN) *</Label>
                <Input type="number" min={1} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 50000" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Term *</Label>
                <Select value={form.term} onValueChange={(v) => setForm((f) => ({ ...f, term: v as Term }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">1st Term</SelectItem>
                    <SelectItem value="second">2nd Term</SelectItem>
                    <SelectItem value="third">3rd Term</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Academic Year *</Label>
                <Input value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} placeholder="e.g. 2025/2026" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Applicable To</Label>
              <p className="text-xs text-slate-400">Select specific classes or leave as All Classes</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleApplicable("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    form.applicable_to.includes("all")
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                  }`}
                >
                  All Classes
                </button>
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleApplicable(c.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      form.applicable_to.includes(c.id)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {drawer === "add" ? "Create Fee" : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone. Existing payment records linked to this fee will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting && <Loader2 size={14} className="mr-1 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
