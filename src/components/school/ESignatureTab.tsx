import { useState, useMemo } from "react";
import { useApp } from "@/lib/school-store";
import { PenTool, Check, AlertCircle } from "lucide-react";
import SignaturePad from "./utils/SignaturePad";
import type { StaffMember } from "@/lib/school-store";

export default function ESignatureTab() {
  const { state, dispatch, showToast } = useApp();
  const { staffList } = state;

  // Get current logged-in staff member (from localStorage or session)
  const currentStaffId = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem("school_staff_session") || "{}");
      return session.staffId;
    } catch {
      return null;
    }
  }, []);

  const currentStaff = useMemo(() => {
    if (!currentStaffId) return null;
    return staffList.find((s) => s.id === currentStaffId) || null;
  }, [currentStaffId, staffList]);

  const [isEditing, setIsEditing] = useState(false);
  const [signature, setSignature] = useState(currentStaff?.signature || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSignature = async () => {
    if (!currentStaff) return;

    setIsSaving(true);
    try {
      dispatch({
        type: "SAVE_STAFF",
        payload: {
          ...currentStaff,
          signature,
          updatedAt: new Date().toISOString(),
        },
      });
      showToast("Signature saved successfully!", "success");
      setIsEditing(false);
    } catch (error) {
      showToast("Failed to save signature", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSignature = () => {
    setSignature("");
    showToast("Signature cleared", "success");
  };

  if (!currentStaff) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Not logged in</p>
          <p className="text-xs text-muted-foreground">
            Please log in as a staff member to set your e-signature
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <PenTool className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Your E-Signature</h2>
            <p className="text-xs text-muted-foreground">{currentStaff.name}</p>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-foreground">Info</p>
          <p className="text-xs text-muted-foreground">
            Your signature will automatically appear on all student reports you generate. Set it once and use it seamlessly across all documents.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {/* Current Signature Preview */}
        {currentStaff.signature && !isEditing && (
          <div className="mobile-card p-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">Current Signature</p>
            <div className="border-2 border-border rounded-lg p-4 bg-white flex items-center justify-center min-h-[150px]">
              <img src={currentStaff.signature} alt="Current signature" className="max-h-[120px] object-contain" />
            </div>
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(currentStaff.updatedAt).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Signature Pad - Editing Mode */}
        {isEditing && (
          <div className="mobile-card p-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {currentStaff.signature ? "Update Your Signature" : "Create Your Signature"}
            </p>
            <p className="text-xs text-muted-foreground">
              Draw your signature below using your mouse or trackpad
            </p>
            <SignaturePad value={signature} onChange={setSignature} />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSignature(currentStaff.signature || "");
                }}
                className="flex-1 py-3 rounded-xl border-2 border-border text-sm font-semibold text-muted-foreground active:scale-[0.97] transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSignature}
                disabled={isSaving || !signature}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <Check className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Signature"}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isEditing && (
          <div className="space-y-2">
            <button
              onClick={() => setIsEditing(true)}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            >
              <PenTool className="w-4 h-4" />
              {currentStaff.signature ? "Update Signature" : "Create Signature"}
            </button>

            {currentStaff.signature && (
              <button
                onClick={handleClearSignature}
                className="w-full py-3 rounded-xl border-2 border-red-200 text-sm font-semibold text-red-600 active:scale-[0.97] transition-transform"
              >
                Clear Signature
              </button>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground px-2">How it works</p>
          <div className="space-y-2">
            <div className="flex gap-3 px-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                1
              </div>
              <div>
                <p className="text-xs font-semibold">Create your signature</p>
                <p className="text-xs text-muted-foreground">Draw your signature above</p>
              </div>
            </div>
            <div className="flex gap-3 px-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                2
              </div>
              <div>
                <p className="text-xs font-semibold">Save your e-signature</p>
                <p className="text-xs text-muted-foreground">It's stored in your profile</p>
              </div>
            </div>
            <div className="flex gap-3 px-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                3
              </div>
              <div>
                <p className="text-xs font-semibold">Auto-appears on reports</p>
                <p className="text-xs text-muted-foreground">Shows on all student reports</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
