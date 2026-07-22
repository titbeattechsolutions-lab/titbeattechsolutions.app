import React, { useState } from "react";
import { Users, GraduationCap, DoorOpen, Ban, RotateCcw, Loader2 } from "lucide-react";
import { useStudentsPaged, useChangeStudentStatus, STUDENT_PAGE_SIZE } from "@/hooks/useSchoolQuery";
import { useApp } from "./School_Management_App";

export function StudentsDirectoryTab({ tenantId }: { tenantId?: string }) {
  const [statusFilter, setStatusFilter] = useState<"active" | "graduated" | "withdrawn" | "suspended">("active");
  const [page, setPage] = useState(0);
  
  const { data, isLoading, error } = useStudentsPaged(page, { status: statusFilter }, tenantId);
  const { mutate: changeStatus, isPending } = useChangeStudentStatus(tenantId);

  const appCtx = useApp();
  
  const displayStudents = (() => {
    // 1. Get Relational Students
    const relational = data?.students || [];
    const relationalNames = new Set(relational.map(s => `${s.first_name} ${s.last_name}`.toLowerCase()));
    
    let all = [...relational];
    
    // 2. Merge Legacy JSONB Students (Deduplicated)
    if (appCtx && statusFilter === "active") {
      for (const [className, students] of Object.entries(appCtx.state.classRolls || {})) {
        for (const s of students) {
          const first = s.name.split(" ")[0] || "";
          const last = s.name.split(" ").slice(1).join(" ") || "";
          const fullName = `${first} ${last}`.toLowerCase();
          
          if (!relationalNames.has(fullName)) {
            all.push({
              id: s.id,
              first_name: first,
              last_name: last,
              admission_no: s.admNo || "",
              class_name: className,
              gender: s.gender || "",
              status: "active",
              isLegacy: true,
            });
          }
        }
      }
    }
    
    // 3. Sort and Paginate Local Memory
    const sorted = all.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
    return sorted.slice(page * STUDENT_PAGE_SIZE, (page + 1) * STUDENT_PAGE_SIZE);
  })();

  const totalStudents = (() => {
    const relationalCount = data?.total || 0;
    if (statusFilter !== "active" || !appCtx) return relationalCount;
    
    const relationalNames = new Set((data?.students || []).map(s => `${s.first_name} ${s.last_name}`.toLowerCase()));
    let legacyCount = 0;
    
    for (const students of Object.values(appCtx.state.classRolls || {})) {
      for (const s of students) {
        const first = s.name.split(" ")[0] || "";
        const last = s.name.split(" ").slice(1).join(" ") || "";
        if (!relationalNames.has(`${first} ${last}`.toLowerCase())) {
          legacyCount++;
        }
      }
    }
    return relationalCount + legacyCount;
  })();

  const handleStatusChange = async (student: any, newStatus: "graduated" | "withdrawn" | "suspended" | "active") => {
    let reason = undefined;
    let academicYear = "2025/2026"; // Default placeholder
    
    if (newStatus === "withdrawn" || newStatus === "suspended") {
      reason = window.prompt(`Please enter the reason for marking this student as ${newStatus}:`);
      if (reason === null) return; // User cancelled
    } else if (newStatus === "graduated") {
      const year = window.prompt("Please enter the graduation academic year (e.g., 2025/2026):", "2025/2026");
      if (year === null) return; // User cancelled
      academicYear = year;
    }

    if (!window.confirm(`Are you sure you want to change this student's status to ${newStatus.toUpperCase()}?`)) return;

    // --- JIT MIGRATION FOR LEGACY STUDENTS ---
    if (student.isLegacy) {
      if (!tenantId) {
        alert("Tenant ID is missing. Cannot complete migration.");
        return;
      }
      try {
        const { createStudent } = await import("@/supabase/schoolService");
        // 1. Create relational row
        const newStud = await createStudent(tenantId, {
          first_name: student.first_name,
          last_name: student.last_name,
          admission_no: student.admission_no,
          class_name: student.class_name,
          gender: student.gender || undefined,
          status: "active" // Must start active before we can graduate/suspend them!
        });
        
        // 2. Trigger lifecycle RPC using the new true UUID
        changeStatus({ studentId: newStud.id, newStatus, academicYear, reason });
        
        // 3. Purge from local JSONB legacy active roll
        if (appCtx) {
          appCtx.dispatch({
            type: "DELETE_ROLL_STUDENT",
            className: student.class_name,
            studentId: student.id,
            actor: appCtx.currentActor || "System Migration",
          });
          appCtx.showToast("Legacy student successfully migrated and status updated!");
        }
      } catch (err: any) {
        alert("Failed to migrate legacy student: " + err.message);
      }
      return;
    }
    
    // Standard relational execution
    changeStatus({ studentId: student.id, newStatus, academicYear, reason });
  };

  const tabs = [
    { id: "active", label: "Active", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { id: "graduated", label: "Graduated", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
    { id: "withdrawn", label: "Withdrawn", icon: DoorOpen, color: "text-amber-600", bg: "bg-amber-50" },
    { id: "suspended", label: "Suspended", icon: Ban, color: "text-red-600", bg: "bg-red-50" }
  ] as const;

  if (error) {
    return <div className="p-8 text-center text-red-500">Failed to load students: {error.message}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Student Directory</h1>
          <p className="text-sm text-slate-400">Manage enrollments, graduations, and alumni records natively.</p>
        </div>
      </div>

      {/* Segmented Control */}
      <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
        {tabs.map((tab) => {
          const isActive = statusFilter === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setPage(0); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                isActive ? `${tab.bg} ${tab.color} shadow-sm` : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Loader2 className="animate-spin mb-2" size={24} />
            Loading students...
          </div>
        ) : displayStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users size={32} className="mx-auto mb-3 opacity-20" />
            <p className="font-bold text-slate-600">No {statusFilter} students found</p>
            <p className="text-sm mt-1">Change the filter or enroll new students to see them here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Admission No</th>
                  <th className="px-6 py-4">Class</th>
                  <th className="px-6 py-4 text-center">Gender</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayStudents.map((student: any) => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        {student.first_name} {student.last_name}
                        {student.isLegacy && <span className="text-[10px] uppercase font-black tracking-widest text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Legacy</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                      {student.admission_no || "N/A"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-md">
                        {student.class_name || "Unassigned"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xs font-bold capitalize ${student.gender === 'female' ? 'text-pink-600' : 'text-blue-600'}`}>
                        {student.gender || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {statusFilter === "active" ? (
                          <>
                            <button onClick={() => handleStatusChange(student, "graduated")} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Graduate Student">
                              <GraduationCap size={16} />
                            </button>
                            <button onClick={() => handleStatusChange(student, "withdrawn")} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Withdraw Student">
                              <DoorOpen size={16} />
                            </button>
                            <button onClick={() => handleStatusChange(student, "suspended")} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Suspend Student">
                              <Ban size={16} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleStatusChange(student, "active")} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                            <RotateCcw size={14} /> Readmit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {totalStudents > STUDENT_PAGE_SIZE && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {page * STUDENT_PAGE_SIZE + 1} to {Math.min((page + 1) * STUDENT_PAGE_SIZE, totalStudents)} of {totalStudents} students</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-md disabled:opacity-50 font-bold hover:bg-slate-50 text-slate-700">Prev</button>
              <button disabled={(page + 1) * STUDENT_PAGE_SIZE >= totalStudents} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-md disabled:opacity-50 font-bold hover:bg-slate-50 text-slate-700">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
