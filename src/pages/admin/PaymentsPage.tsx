import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { getPayments, getFees, Payment, Fee } from "@/supabase/schoolService";
import { supabase } from "@/integrations/supabase/client";
import FeatureGuard from "@/components/FeatureGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, InfoIcon, ExternalLink } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed:  "bg-red-100 text-red-600",
};

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(amount);
}

function downloadCsv(payments: Payment[]) {
  const headers = ["Student", "Fee", "Amount", "Reference", "Status", "Channel", "Paid At", "Created At"];
  const rows = payments.map((p) => [
    p.student_name,
    p.fee_name,
    p.amount,
    p.reference ?? "",
    p.status,
    p.channel ?? "",
    p.paid_at ? new Date(p.paid_at).toLocaleString() : "",
    new Date(p.created_at).toLocaleString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PaymentsPage() {
  return (
    <FeatureGuard feature="fees">
      <PaymentsPageContent />
    </FeatureGuard>
  );
}

function PaymentsPageContent() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTerm, setFilterTerm] = useState("all");

  // Realtime subscription for payment status updates
  useEffect(() => {
    if (!schoolId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`payments:${schoolId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments", filter: `school_id=eq.${schoolId}` },
        (payload: { new: Payment }) => {
          setPayments((prev) =>
            prev.map((p) => p.id === payload.new.id ? { ...p, ...payload.new } : p)
          );
        }
      )
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, [schoolId]);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [p, f] = await Promise.all([
        getPayments(schoolId, {
          ...(filterStatus !== "all" && { status: filterStatus }),
        }),
        getFees(schoolId, filterTerm !== "all" ? filterTerm : undefined),
      ]);
      setPayments(p);
      setFees(f);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [schoolId, filterStatus, filterTerm]); // eslint-disable-line

  // Filter by term client-side using fee_id lookup
  const feeIdsInTerm = new Set(fees.map((f) => f.id));
  const displayed = filterTerm !== "all"
    ? payments.filter((p) => feeIdsInTerm.has(p.fee_id))
    : payments;

  const totalCollected = displayed
    .filter((p) => p.status === "success")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const handleInitiatePayment = async (p: Payment) => {
    if (!p.student_id || !p.fee_id) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).functions.invoke("initiate-payment", {
        body: { studentId: p.student_id, feeId: p.fee_id, amount: p.amount },
      });
      if (error) throw new Error(error.message);
      if (data?.paymentUrl) window.open(data.paymentUrl, "_blank");
    } catch (e) {
      toast({ title: "Payment initiation failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Payments</h1>
          <p className="text-sm text-slate-500">{school?.academic_year} · Total collected: <strong>{formatNaira(totalCollected)}</strong></p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(displayed)} disabled={displayed.length === 0}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>

      {/* System notice */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
        <InfoIcon size={16} className="shrink-0 mt-0.5" />
        <span>
          <strong>Payment records are system-generated.</strong> All entries are written by the payment processor.
          Contact <a href="mailto:support@titbeattechsolutions.com" className="underline">support@titbeattechsolutions.com</a> to reverse or adjust a payment.
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTerm} onValueChange={setFilterTerm}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Term" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terms</SelectItem>
            <SelectItem value="first">1st Term</SelectItem>
            <SelectItem value="second">2nd Term</SelectItem>
            <SelectItem value="third">3rd Term</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : displayed.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No payment records found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Student", "Fee", "Amount", "Reference", "Status", "Channel", "Paid At", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.student_name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.fee_name}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{formatNaira(p.amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.reference ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">{p.channel ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleInitiatePayment(p)}
                      >
                        <ExternalLink size={11} className="mr-1" /> Pay
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary stats */}
      {displayed.length > 0 && (
        <div className="grid grid-cols-3 gap-4 text-center">
          {(["success", "pending", "failed"] as const).map((status) => {
            const count = displayed.filter((p) => p.status === status).length;
            const total = displayed.filter((p) => p.status === status).reduce((s, p) => s + Number(p.amount), 0);
            return (
              <div key={status} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500 capitalize">{status}</p>
                <p className="font-bold text-slate-800">{count} payment{count !== 1 ? "s" : ""}</p>
                <p className="text-xs text-slate-500">{formatNaira(total)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
