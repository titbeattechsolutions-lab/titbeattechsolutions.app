import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { updateSchoolProfile } from "@/supabase/schoolService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const { schoolId } = useAuth();
  const { school, setSchool, loading } = useSchool();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const formInitialized = useRef(false);

  const [form, setForm] = useState({
    name: school?.name ?? "",
    email: school?.email ?? "",
    phone: school?.phone ?? "",
    address_street: school?.address_street ?? "",
    address_city: school?.address_city ?? "",
    address_state: school?.address_state ?? "",
    address_country: school?.address_country ?? "Nigeria",
    timezone: school?.timezone ?? "Africa/Lagos",
    academic_year: school?.academic_year ?? "2025/2026",
    current_term: school?.current_term ?? "first",
  });

  // Sync form once when school data first arrives — never auto-reset after that
  if (school && !formInitialized.current) {
    formInitialized.current = true;
    setForm({
      name: school.name, email: school.email ?? "", phone: school.phone ?? "",
      address_street: school.address_street ?? "", address_city: school.address_city ?? "",
      address_state: school.address_state ?? "", address_country: school.address_country ?? "Nigeria",
      timezone: school.timezone ?? "Africa/Lagos", academic_year: school.academic_year ?? "2025/2026",
      current_term: school.current_term ?? "first",
    });
  }

  const handleSave = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      const updated = await updateSchoolProfile(schoolId, {
        ...form,
        current_term: form.current_term as "first" | "second" | "third",
      });
      setSchool(updated);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${schoolId}/logo.${ext}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uploadError } = await (supabase.storage as any)
        .from("school-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: urlData } = (supabase.storage as any)
        .from("school-assets")
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl as string;
      const updated = await updateSchoolProfile(schoolId, { logo: publicUrl });
      setSchool(updated);
      toast({ title: "Logo uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">Settings</h1>

      {/* Logo */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">School Logo</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-5">
          {school?.logo ? (
            <img src={school.logo} alt="logo" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-2xl font-bold">
              {school?.name?.[0] ?? "S"}
            </div>
          )}
          <div>
            <Label htmlFor="logo-upload" className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
                  Upload Logo
                </span>
              </Button>
            </Label>
            <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 2MB</p>
          </div>
        </CardContent>
      </Card>

      {/* School profile */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">School Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>School Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Street Address</Label>
            <Input value={form.address_street} onChange={(e) => setForm((f) => ({ ...f, address_street: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["address_city", "address_state", "address_country"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field.replace("address_", "")}</Label>
                <Input value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Academic settings */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Academic Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Academic Year</Label>
            <Input value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} placeholder="e.g. 2025/2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Current Term</Label>
            <Select value={form.current_term} onValueChange={(v) => setForm((f) => ({ ...f, current_term: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first">1st Term</SelectItem>
                <SelectItem value="second">2nd Term</SelectItem>
                <SelectItem value="third">3rd Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                <SelectItem value="Africa/Accra">Africa/Accra (GMT)</SelectItem>
                <SelectItem value="Africa/Johannesburg">Africa/Johannesburg (SAST)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
        Save Settings
      </Button>
    </div>
  );
}
