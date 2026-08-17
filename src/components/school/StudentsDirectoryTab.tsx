import React, { useState } from "react";
import { Users, GraduationCap, DoorOpen, Ban, RotateCcw, Loader2, Search, Filter, Printer, Download, FileText, ChevronDown } from "lucide-react";
import { useStudentsPaged, useChangeStudentStatus, useClasses, STUDENT_PAGE_SIZE } from "@/hooks/useSchoolQuery";
import { getStudents } from "@/supabase/schoolService";
import { useApp } from "./School_Management_App";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ALL_CLASSES } from "@/lib/school-constants";

export function StudentsDirectoryTab({ tenantId }: { tenantId?: string }) {
  const [statusFilter, setStatusFilter] = useState<"active" | "graduated" | "withdrawn" | "suspended">("active");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  
  const { data, isLoading, error } = useStudentsPaged(page, { 
    status: statusFilter,
    search: searchQuery || undefined,
    class_id: classFilter === "all" ? undefined : classFilter
  }, tenantId);
  
  const { mutateAsync: changeStatusAsync, isPending } = useChangeStudentStatus(tenantId);
  const { data: classesData } = useClasses(tenantId);
  
  const appCtx = useApp();

  const classesList = React.useMemo(() => {
    const list = [...(classesData || [])];
    const existingNames = new Set(list.map(c => c.name.toLowerCase()));
    
    // Add legacy ones from offline JSON blob
    if (appCtx?.state?.classRolls) {
      for (const className of Object.keys(appCtx.state.classRolls)) {
        if (!existingNames.has(className.toLowerCase())) {
          list.push({ id: className, name: className } as any);
          existingNames.add(className.toLowerCase());
        }
      }
    }

    // Preserve curriculum order: map ALL_CLASSES first, then append any remaining ones
    const orderedList: any[] = [];
    const usedNames = new Set<string>();

    for (const className of ALL_CLASSES) {
      const dbClass = list.find(c => c.name.toLowerCase() === className.toLowerCase());
      if (dbClass) {
        orderedList.push(dbClass);
      } else {
        orderedList.push({ id: className, name: className });
      }
      usedNames.add(className.toLowerCase());
    }

    // Append any extra/custom classes not in the global curriculum
    for (const item of list) {
      if (!usedNames.has(item.name.toLowerCase())) {
        orderedList.push(item);
        usedNames.add(item.name.toLowerCase());
      }
    }

    return orderedList;
  }, [classesData, appCtx?.state?.classRolls]);
  
  const displayStudents = (() => {
    // 1. Get Relational Students
    const relational = data?.students || [];
    const relationalNames = new Set(relational.map(s => `${s.first_name} ${s.last_name}`.toLowerCase()));
    
    let all = [...relational];
    
    // 2. Merge Legacy JSONB Students (Deduplicated)
    if (appCtx && statusFilter === "active") {
      const legacyNames = new Set<string>();
      
      // From Class Rolls
      for (const [className, students] of Object.entries(appCtx.state.classRolls || {})) {
        for (const s of students) {
           legacyNames.add(`${s.name}||${className}||${s.admNo||""}||${s.gender||""}||${s.id||Math.random().toString()}`);
        }
      }
      
      // From Entries (ghost students)
      for (const e of appCtx.state.entries || []) {
        if (!e.studentName || !e.studentClass) continue;
        legacyNames.add(`${e.studentName}||${e.studentClass}||||||${Math.random().toString()}`);
      }

      for (const item of legacyNames) {
        const [name, className, admNo, gender, id] = item.split("||");
        const first = name.split(" ")[0] || "";
        const last = name.split(" ").slice(1).join(" ") || "";
        const fullName = `${first} ${last}`.toLowerCase();
          
        // Check filters against legacy data
        const matchingClass = classesList.find(c => c.id === classFilter);
        const matchesClass = classFilter === "all" || (matchingClass && matchingClass.name === className);
        const matchesSearch = !searchQuery || fullName.includes(searchQuery.toLowerCase()) || admNo.toLowerCase().includes(searchQuery.toLowerCase());

        if (matchesClass && matchesSearch && !relationalNames.has(fullName) && !all.some(s => s.first_name.toLowerCase() === first.toLowerCase() && s.last_name.toLowerCase() === last.toLowerCase())) {
          all.push({
            id: id,
            first_name: first,
            last_name: last,
            admission_no: admNo || "",
            class_name: className,
            gender: gender || "",
            status: "active",
            isLegacy: true,
          });
          relationalNames.add(fullName);
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
    
    for (const [className, students] of Object.entries(appCtx.state.classRolls || {})) {
      const matchingClass = classesList.find(c => c.id === classFilter);
      const matchesClass = classFilter === "all" || (matchingClass && matchingClass.name === className);
      if (!matchesClass) continue;

      for (const s of students) {
        const first = s.name.split(" ")[0] || "";
        const last = s.name.split(" ").slice(1).join(" ") || "";
        const fullName = `${first} ${last}`.toLowerCase();
        
        const matchesSearch = !searchQuery || fullName.includes(searchQuery.toLowerCase()) || (s.admNo && s.admNo.toLowerCase().includes(searchQuery.toLowerCase()));

        if (matchesSearch && !relationalNames.has(fullName)) {
          legacyCount++;
        }
      }
    }
    return relationalCount + legacyCount;
  })();

  const fetchExportData = async () => {
    try {
      setIsExporting(true);
      // Fetch relational export
      let relationalStudents = await getStudents(tenantId || null, { 
        status: statusFilter, 
        class_id: classFilter === "all" ? undefined : classFilter,
        search: searchQuery || undefined
      });

      // Merge legacy if active
      if (appCtx && statusFilter === "active") {
        const relationalNames = new Set(relationalStudents.map(s => `${s.first_name} ${s.last_name}`.toLowerCase()));
        for (const [className, students] of Object.entries(appCtx.state.classRolls || {})) {
          const matchingClass = classesList.find(c => c.id === classFilter);
          const matchesClass = classFilter === "all" || (matchingClass && matchingClass.name === className);
          if (!matchesClass) continue;
          
          for (const s of students) {
            const first = s.name.split(" ")[0] || "";
            const last = s.name.split(" ").slice(1).join(" ") || "";
            const fullName = `${first} ${last}`.toLowerCase();
            const matchesSearch = !searchQuery || fullName.includes(searchQuery.toLowerCase()) || (s.admNo && s.admNo.toLowerCase().includes(searchQuery.toLowerCase()));

            if (matchesSearch && !relationalNames.has(fullName)) {
              relationalStudents.push({
                id: s.id,
                first_name: first,
                last_name: last,
                admission_no: s.admNo || "N/A",
                class_name: className,
                gender: s.gender || "-",
                status: "active",
              } as any);
              relationalNames.add(fullName);
            }
          }
        }
      }

      relationalStudents.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
      return relationalStudents;
    } catch (err: any) {
      alert("Failed to fetch export data: " + err.message);
      return [];
    } finally {
      setIsExporting(false);
    }
  };

  const generatePDFDocument = async () => {
    const students = await fetchExportData();
    if (!students.length) return null;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${statusFilter.toUpperCase()} Students Directory`, 14, 20);
    
    if (searchQuery || classFilter !== "all") {
      doc.setFontSize(10);
      const filterText = `Filters Applied - Class: ${classFilter === "all" ? "All" : classesList.find(c => c.id === classFilter)?.name || classFilter} | Search: ${searchQuery || "None"}`;
      doc.text(filterText, 14, 28);
    }

    const tableData = students.map((s, idx) => [
      (idx + 1).toString(),
      `${s.first_name} ${s.last_name}`,
      s.admission_no || "N/A",
      s.class_name || "Unassigned",
      s.gender ? s.gender.charAt(0).toUpperCase() + s.gender.slice(1) : "-"
    ]);

    autoTable(doc, {
      startY: (searchQuery || classFilter !== "all") ? 35 : 30,
      head: [["S/N", "Student Name", "Admission No", "Class", "Gender"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [71, 85, 105] },
    });

    return doc;
  };

  const handleExportPDF = async () => {
    const doc = await generatePDFDocument();
    if (doc) doc.save(`${statusFilter}_students_export.pdf`);
  };

  const handlePrint = async () => {
    const doc = await generatePDFDocument();
    if (doc) {
      const pdfBlobUrl = doc.output("bloburl");
      window.open(pdfBlobUrl, "_blank");
    }
  };

  const handleExportCSV = async () => {
    const students = await fetchExportData();
    if (!students.length) return;

    let csvContent = "Student Name,Admission No,Class,Gender,Status\n";
    students.forEach(s => {
      const name = `"${s.first_name} ${s.last_name}"`;
      const adm = `"${s.admission_no || ""}"`;
      const cls = `"${s.class_name || ""}"`;
      const gen = `"${s.gender || ""}"`;
      const stat = `"${s.status}"`;
      csvContent += `${name},${adm},${cls},${gen},${stat}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${statusFilter}_students_export.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      let finalAdmNo = student.admission_no;
      if (!finalAdmNo) {
        const admPrompt = window.prompt(`Please enter an admission number for ${student.first_name}:`, "");
        if (admPrompt === null) return;
        finalAdmNo = admPrompt;
      }
      
      let finalGender = student.gender;
      if (!finalGender) {
        const genPrompt = window.prompt(`Please enter gender for ${student.first_name} (male/female):`, "male");
        if (genPrompt === null) return;
        finalGender = genPrompt.toLowerCase().trim();
      }

      let success = false;
      while (!success) {
        try {
          const { createStudent } = await import("@/supabase/schoolService");
          // 1. Create relational row
          const newStud = await createStudent(tenantId, {
            first_name: student.first_name,
            last_name: student.last_name,
            admission_no: finalAdmNo || "",
            class_name: student.class_name,
            gender: finalGender || undefined,
            status: "active" // Must start active before we can graduate/suspend them!
          });
          
          success = true;
          // 2. Trigger lifecycle RPC using the new true UUID
          await changeStatusAsync({ studentId: newStud.id, newStatus, academicYear, reason });
          
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
          if (err.message?.includes("duplicate key") || err.code === "23505" || err.message?.includes("students_school_id_admission_no_key")) {
            const newAdm = window.prompt(`The admission number "${finalAdmNo}" is already in use by another student.\n\nPlease enter a UNIQUE admission number for ${student.first_name}:`, finalAdmNo);
            if (newAdm === null) return; // Cancelled
            finalAdmNo = newAdm;
          } else {
            alert("Failed to migrate legacy student: " + err.message);
            return;
          }
        }
      }
      return;
    }
    
    // Standard relational execution
    try {
      await changeStatusAsync({ studentId: student.id, newStatus, academicYear, reason });
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleMigrateOnly = async (student: any) => {
    if (!tenantId) {
      alert("Tenant ID is missing. Cannot complete migration.");
      return;
    }
    if (!window.confirm(`Are you sure you want to sync ${student.first_name} ${student.last_name} to the cloud database?`)) return;
    
    let finalAdmNo = student.admission_no;
    if (!finalAdmNo) {
      const admPrompt = window.prompt(`Please enter an admission number for ${student.first_name}:`, "");
      if (admPrompt === null) return;
      finalAdmNo = admPrompt;
    }
    
    let finalGender = student.gender;
    if (!finalGender) {
      const genPrompt = window.prompt(`Please enter gender for ${student.first_name} (male/female):`, "male");
      if (genPrompt === null) return;
      finalGender = genPrompt.toLowerCase().trim();
    }

    let success = false;
    while (!success) {
      try {
        const { createStudent } = await import("@/supabase/schoolService");
        await createStudent(tenantId, {
          first_name: student.first_name,
          last_name: student.last_name,
          admission_no: finalAdmNo || "",
          class_name: student.class_name,
          gender: finalGender || undefined,
          status: "active"
        });
        
        success = true;
        if (appCtx) {
          appCtx.dispatch({
            type: "DELETE_ROLL_STUDENT",
            className: student.class_name,
            studentId: student.id,
            actor: appCtx.currentActor || "System Migration",
          });
          appCtx.showToast(`${student.first_name} successfully synced to cloud database!`);
        }
      } catch (err: any) {
        if (err.message?.includes("duplicate key") || err.code === "23505" || err.message?.includes("students_school_id_admission_no_key")) {
          const newAdm = window.prompt(`The admission number "${finalAdmNo}" is already in use by another student.\n\nPlease enter a UNIQUE admission number for ${student.first_name}:`, finalAdmNo);
          if (newAdm === null) return; // Cancelled
          finalAdmNo = newAdm;
        } else {
          alert("Failed to sync student: " + err.message);
          return;
        }
      }
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Student Directory</h1>
          <p className="text-sm text-slate-400">Manage enrollments, graduations, and alumni records natively.</p>
        </div>
        
        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button 
              onClick={() => window.dispatchEvent(new CustomEvent("open-promotion-wizard"))}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-bold shadow-sm"
            >
              <GraduationCap size={16} /> Bulk Promote
            </button>
            <button 
              disabled={isExporting}
              onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-bold shadow-sm"
          >
            <Printer size={16} /> Print
          </button>
          
          <div className="relative group">
            <button 
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-bold shadow-sm"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export <ChevronDown size={14} className="opacity-70" />
            </button>
            
            <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <div className="p-1">
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-lg transition-colors font-semibold">
                  <FileText size={14} /> Export as PDF
                </button>
                <button onClick={handleExportCSV} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-lg transition-colors font-semibold">
                  <FileText size={14} /> Export as CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Segmented Control */}
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex-1">
          {tabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setStatusFilter(tab.id); setPage(0); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-sm font-bold transition-all ${
                  isActive ? `${tab.bg} ${tab.color} shadow-sm` : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} className="hidden sm:block" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by name or admission no..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium placeholder:font-normal"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setPage(0); }}
              className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 appearance-none min-w-[140px]"
            >
              <option value="all">All Classes</option>
              {classesList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
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
            <p className="font-bold text-slate-600">No students match your filters</p>
            <p className="text-sm mt-1">Try clearing the search or changing the class filter.</p>
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
                            {student.isLegacy && (
                              <button onClick={() => handleMigrateOnly(student)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Sync to Cloud DB">
                                <RotateCcw size={16} />
                              </button>
                            )}
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
