import { useFeature } from "@/hooks/useFeature";
import { useSchool } from "@/hooks/useSchool";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Zap } from "lucide-react";

interface FeatureGuardProps {
  feature: string;
  children: React.ReactNode;
}

const FEATURE_LABELS: Record<string, string> = {
  fees: "Fee Management & Payments",
  reports: "Advanced Reports",
  analytics: "Analytics Dashboard",
};

/**
 * Wraps content that requires a specific feature flag.
 * Shows an upgrade CTA for schools that don't have the feature enabled.
 */
export default function FeatureGuard({ feature, children }: FeatureGuardProps) {
  const enabled = useFeature(feature);
  const { school } = useSchool();

  if (enabled) return <>{children}</>;

  const label = FEATURE_LABELS[feature] ?? feature;
  const plan = (school?.features as Record<string, unknown> | null)?.["plan"] ?? "starter";

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="pt-8 pb-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center">
              <Lock size={24} className="text-amber-500" />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800">{label}</h2>
            <p className="text-sm text-slate-500 mt-2">
              This feature is not available on your current plan
              {plan ? ` (${String(plan)})` : ""}.
              Upgrade to <strong>Pro</strong> or <strong>Enterprise</strong> to unlock it.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Included in Pro & Enterprise</p>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Zap size={13} className="text-amber-500 shrink-0" /> Fee creation & management</li>
              <li className="flex items-center gap-2"><Zap size={13} className="text-amber-500 shrink-0" /> Online payment collection (Paystack)</li>
              <li className="flex items-center gap-2"><Zap size={13} className="text-amber-500 shrink-0" /> Payment records & CSV export</li>
              <li className="flex items-center gap-2"><Zap size={13} className="text-amber-500 shrink-0" /> Real-time payment status updates</li>
            </ul>
          </div>

          <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => {
            window.open("mailto:support@titbeattechsolutions.com?subject=Upgrade Request", "_blank");
          }}>
            <Zap size={14} className="mr-2" />
            Upgrade Plan
          </Button>

          <p className="text-xs text-slate-400">
            Contact <a href="mailto:support@titbeattechsolutions.com" className="underline">support@titbeattechsolutions.com</a> to upgrade
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
