import { useState, useMemo } from "react";
import { useApp } from "@/lib/school-store";
import { uid } from "@/lib/school-helpers";
import { ROLES, PERMS_META, ALL_CLASSES } from "@/lib/school-constants";
import type { StaffMember } from "@/lib/school-store";
import { UserPlus, Search, UserCheck, UserX, Shield, Eye, EyeOff, Check } from "lucide-react";
import BottomSheet from "./BottomSheet";
import SignaturePad from "./utils/SignaturePad";

export default function StaffTab() {
  const { state, dispatch, showToast } = useApp();
  const { staffList } = state;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [showPin, setShowPin] = useState(false);

  const [form, setForm] = useState<{
    name: string; role: string; pin: string; status: "active" | "restricted" | "revoked";
    assignedClasses: string[];
    permissions: { scoreEntry: boolean; viewReports: boolean; printReports: boolean; manageRecords: boolean };
    signature: string;
  }>({
    name: "", role: "Teacher", pin: "", status: "active",
    assignedClasses: [] as string[],
    permissions: { scoreEntry: true, viewReports: true, printReports: false, manageRecords: false },
    signature: "",
  });

  const startEdit = (s: StaffMember) => {
    setForm({ name: s.name, role: s.role, pin: "", status: s.status, assignedClasses: [...s.assignedClasses], permissions: { scoreEntry: s.permissions.scoreEntry ?? true, viewReports: s.permissions.viewReports ?? true, printReports: s.permissions.printReports ?? false, manageRecords: s.permissions.manageRecords ?? false }, signature: s.signature || "" });
    setEditStaff(s);
    setShowForm(true);
  };

  const startAdd = () => {
    setForm({ name: "", role: "Teacher", pin: "", status: "active", assignedClasses: [], permissions: { scoreEntry: true, viewReports: true, printReports: false, manageRecords: false }, signature: "" });
    setEditStaff(null);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    if (!editStaff && form.pin.length < 4) { showToast("PIN must be at least 4 digits", "error"); return; }

    dispatch({
      type: "SAVE_STAFF",
      payload: {
        id: editStaff?.id || uid(),
        name: form.name.trim(),
        role: form.role,
        pin: form.pin || editStaff?.pin || "",
        status: form.status,
        assignedClasses: form.assignedClasses,
        permissions: form.permissions,
        signature: form.signature,
        createdAt: editStaff?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    showToast(editStaff ? "Staff updated" : "Staff added");
    setShowForm(false);
  };

  const toggleClass = (cls: string) => {
    setForm((f) => ({
      ...f,
      assignedClasses: f.assignedClasses.includes(cls)
        ? f.assignedClasses.filter((c) => c !== cls)
        : [...f.assignedClasses, cls],
    }));
  };

  const counts = useMemo(() => ({
    All: staffList.length,
    Active: staffList.filter((s) => s.status === "active").length,
    Restricted: staffList.filter((s) => s.status === "restricted").length,
    Revoked: staffList.filter((s) => s.status === "revoked").length,
  }), [staffList]);

  const filtered = useMemo(() => staffList.filter((s) => {
    const mf = filter === "All" || s.status === filter.toLowerCase();
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  }), [staffList, filter, search]);

  const statusColor = (s: string) =>
    s === "active" ? "chip-success" : s === "restricted" ? "chip-warning" : "chip-danger";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Staff</h2>
            <p className="text-xs text-muted-foreground">{counts.Active} active · {counts.Revoked} revoked</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["All", "Active", "Restricted", "Revoked"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`chip flex-shrink-0 ${filter === f ? "chip-primary" : "chip-muted"}`}>
              {f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..."
            className="input-field pl-10" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No staff found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const initials = s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={s.id} className="mobile-card p-4 flex items-center gap-3" onClick={() => startEdit(s)}>
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold text-primary-foreground flex-shrink-0 ${
                    s.status === "active" ? "bg-primary" : s.status === "restricted" ? "bg-warning" : "bg-muted"
                  }`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.role}</p>
                  </div>
                  <span className={`chip text-[10px] ${statusColor(s.status)}`}>
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={startAdd} className="fab"><UserPlus className="w-6 h-6" /></button>

      {/* Staff Form Sheet */}
      {showForm && (
        <BottomSheet onClose={() => setShowForm(false)}>
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold">{editStaff ? "Edit Staff" : "Add Staff"}</h3>

            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name" className="input-field" />

            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="input-field">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            <div className="relative">
              <input type={showPin ? "text" : "password"} value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                placeholder={editStaff ? "Leave blank to keep current" : "Enter PIN (min 4 digits)"}
                className="input-field pr-10" />
              <button onClick={() => setShowPin((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Status */}
            <div>
              <p className="section-title mb-2">Status</p>
              <div className="flex gap-2">
                {(["active", "restricted", "revoked"] as const).map((st) => (
                  <button key={st} onClick={() => setForm((f) => ({ ...f, status: st }))}
                    className={`chip flex-1 justify-center capitalize ${form.status === st ? statusColor(st) : "chip-muted"}`}>
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div>
              <p className="section-title mb-2">Permissions</p>
              <div className="space-y-2">
                {PERMS_META.map(({ key, label, desc }) => (
                  <button key={key} onClick={() => setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }))}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                      form.permissions[key] ? "border-primary/30 bg-primary/5" : "border-border"
                    }`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      form.permissions[key] ? "bg-primary border-primary" : "border-border"
                    }`}>
                      {form.permissions[key] && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Classes */}
            <div>
              <p className="section-title mb-2">Assigned Classes</p>
              <div className="flex flex-wrap gap-2">
                {ALL_CLASSES.map((cls) => (
                  <button key={cls} onClick={() => toggleClass(cls)}
                    className={`chip ${form.assignedClasses.includes(cls) ? "chip-primary" : "chip-muted"}`}>
                    {form.assignedClasses.includes(cls) && <Check className="w-3 h-3" />}
                    {cls}
                  </button>
                ))}
              </div>
              {form.assignedClasses.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No selection = access to all classes</p>
              )}
            </div>

            {/* Signature */}
            <div>
              <p className="section-title mb-2">Default Signature</p>
              <p className="text-xs text-muted-foreground mb-3">Draw or update your signature to be used in staff reports</p>
              <SignaturePad value={form.signature} onChange={(sig) => setForm((f) => ({ ...f, signature: sig }))} />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border-2 border-border text-sm font-bold text-muted-foreground">Cancel</button>
              <button onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">{editStaff ? "Save" : "Add"}</button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
