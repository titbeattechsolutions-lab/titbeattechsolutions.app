// @ts-nocheck
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Video, LogIn, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function StudentVirtualHubPage() {
  const { profile } = useAuth();
  const [virtualClasses, setVirtualClasses] = useState<any[]>([]);
  const [virtualAttendance, setVirtualAttendance] = useState<Record<string, string[]>>({});

  const fetchAppState = async () => {
    if (!(profile as any)?.tenant_id) return;
    try {
      const { data, error } = await (supabase as any).from('app_state')
        .select('data')
        .eq('tenant_id', profile.tenant_id)
        .single();
      
      if (data && !error) {
        const payload = data.data as any;
        setVirtualClasses(payload.virtualClasses || []);
        setVirtualAttendance(payload.virtualAttendance || {});
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAppState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(profile as any)?.tenant_id]);

  const myClass = (profile as any)?.grade_level || "";
  const myClasses = virtualClasses.filter((c: any) => c.targetClass === myClass || c.targetClass === "All");
  
  const studentName = (profile as any)?.firstName + " " + ((profile as any)?.lastName || "");

  const handleJoin = async (vc: any) => {
    // Attempt to log attendance to Supabase
    try {
      const { data, error } = await (supabase as any).from('app_state')
        .select('data')
        .eq('tenant_id', (profile as any)?.tenant_id)
        .single();
      
      if (data && !error) {
        const payload = data.data as any;
        const currentAtt = payload.virtualAttendance || {};
        if (!currentAtt[vc.id]) currentAtt[vc.id] = [];
        if (!currentAtt[vc.id].includes(studentName)) {
          currentAtt[vc.id].push(studentName);
          await (supabase as any).from('app_state')
            .update({ data: { ...payload, virtualAttendance: currentAtt } })
            .eq('tenant_id', (profile as any)?.tenant_id);
        }
      }
    } catch (e) {
      console.error(e);
    }
    
    // Open meeting
    window.open(vc.meetingLink, "_blank");
    toast.success("Joined class. Attendance logged!");
    fetchAppState();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Virtual Revision Hub</h1>
        <p className="text-sm text-slate-500 mt-1">Join scheduled online revision classes for {myClass || "your class"}</p>
      </div>

      {myClasses.length === 0 ? (
        <Card className="py-12 flex flex-col items-center justify-center text-center bg-white border-dashed border-2 border-slate-200">
          <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
            <Video className="text-slate-400 h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Upcoming Classes</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">There are currently no virtual revision classes scheduled for your class.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myClasses.sort((a: any, b: any) => new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime()).map((vc: any) => {
            const isPast = new Date(vc.scheduledTime).getTime() < Date.now();
            const attended = (virtualAttendance[vc.id] || []).includes(studentName);
            
            return (
              <Card key={vc.id} className={`p-5 border ${isPast ? 'border-slate-200 opacity-75' : 'border-indigo-100'} shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isPast ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-700'}`}>
                    {isPast ? 'Completed' : 'Upcoming'}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{new Date(vc.scheduledTime).toLocaleString()}</span>
                </div>
                
                <h3 className="text-lg font-black text-slate-900 line-clamp-1">{vc.topic}</h3>
                <p className="text-sm font-bold text-indigo-600 mb-2">{vc.subject}</p>
                {vc.description && <p className="text-sm text-slate-600 mb-4 line-clamp-2">{vc.description}</p>}
                
                <div className="pt-4 border-t border-slate-100 mt-auto flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-500">By {vc.createdBy}</div>
                  
                  <button 
                    onClick={() => handleJoin(vc)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                      attended 
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                        : isPast 
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {attended ? <><ExternalLink size={16} /> Re-join</> : <><LogIn size={16} /> Join Class</>}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

