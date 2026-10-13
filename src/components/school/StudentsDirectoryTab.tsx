// @ts-nocheck
import React, { useState } from "react";
import { Users, GraduationCap, DoorOpen, Ban, RotateCcw, Loader2, Search, Filter, Printer, Download, FileText, ChevronDown, Calendar, UserCheck, UserX, ShieldAlert, X } from "lucide-react";
import { useStudentsPaged, useChangeStudentStatus, useClasses, STUDENT_PAGE_SIZE } from "@/hooks/useSchoolQuery";
import { getStudents } from "@/supabase/schoolService";
import { useApp } from "./School_Management_App";
import { ALL_CLASSES } from "@/lib/school-constants";

export function StudentsDirectoryTab({ tenantId }: { tenantId?: string }) {
  const [statusFilter, setStatusFilter] = useState<"active" | "graduated" | "withdrawn" | "suspended">("active");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [showMidTermPromotionWarning, setShowMidTermPromotionWarning] = useState(false);
  
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

    // Preserve curriculum order: map activeClasses first, then append any remaining ones
    const activeClasses = appCtx?.state?.schoolSettings?.activeClasses?.length ? appCtx.state.schoolSettings.activeClasses : ALL_CLASSES;
    const orderedList: any[] = [];
    const usedNames = new Set<string>();

    for (const className of activeClasses) {
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
    
    // 3. Filter by Term
    let filtered = all;
    if (termFilter !== "all") {
      const normTerm = termFilter.toLowerCase().replace(" term", "").trim();
      filtered = all.filter(s => {
        const fullName = `${s.first_name} ${s.last_name}`.toLowerCase().trim();
        const hasTermEntry = (appCtx?.state?.entries || []).some(e => 
          e.studentName && e.studentName.toLowerCase().trim() === fullName && 
          (e.term || "").toLowerCase().includes(normTerm)
        );
        const hasTermAttendance = (appCtx?.state?.attendance || []).some(a => 
          a.studentName && a.studentName.toLowerCase().trim() === fullName && 
          (a.term || "").toLowerCase().includes(normTerm)
        );
        const isCurrentTerm = (appCtx?.state?.schoolSettings?.term || "").toLowerCase().includes(normTerm);
        return hasTermEntry || hasTermAttendance || isCurrentTerm;
      });
    }

    // 4. Sort and Paginate Local Memory
    const sorted = filtered.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
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
        
        let matchesTerm = true;
        if (termFilter !== "all") {
          const normTerm = termFilter.toLowerCase().replace(" term", "").trim();
          const hasTermEntry = (appCtx?.state?.entries || []).some(e => 
            e.studentName && e.studentName.toLowerCase().trim() === fullName && 
            (e.term || "").toLowerCase().includes(normTerm)
          );
          const hasTermAttendance = (appCtx?.state?.attendance || []).some(a => 
            a.studentName && a.studentName.toLowerCase().trim() === fullName && 
            (a.term || "").toLowerCase().includes(normTerm)
          );
          const isCurrentTerm = (appCtx?.state?.schoolSettings?.term || "").toLowerCase().includes(normTerm);
          matchesTerm = hasTermEntry || hasTermAttendance || isCurrentTerm;
        }

        if (matchesSearch && matchesTerm && !relationalNames.has(fullName)) {
          legacyCount++;
        }
      }
    }
    return relationalCount + legacyCount;
  })();

  const fetchExportData = async () => {
    try {
      setIsExporting(true);
      let relationalStudents: any[] = [];
      if (tenantId) {
        try {
          relationalStudents = await getStudents(tenantId, { 
            status: statusFilter, 
            class_id: classFilter === "all" ? undefined : classFilter,
            search: searchQuery || undefined
          });
        } catch (e) {}
      }

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

      // Fallback: If network/RPC returned no records, use currently displayed students in table
      if (!relationalStudents.length && displayStudents.length) {
        return displayStudents;
      }

      relationalStudents.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name));
      return relationalStudents;
    } catch (err: any) {
      if (displayStudents.length) return displayStudents;
      alert("Failed to fetch export data: " + err.message);
      return [];
    } finally {
      setIsExporting(false);
    }
  };

  const generatePDFDocument = async () => {
    const students = await fetchExportData();
    if (!students || !students.length) {
      alert("No student records available to export for the selected filter.");
      return null;
    }

    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

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
      doc.autoPrint();
      const pdfBlobUrl = doc.output("bloburl");
      const printWindow = window.open(pdfBlobUrl, "_blank");
      if (!printWindow) {
        // Backup if popup blocker triggered
        const link = document.createElement("a");
        link.href = pdfBlobUrl;
        link.target = "_blank";
        link.click();
      }
    }
  };

  const handleExportCSV = async () => {
    const students = await fetchExportData();
    if (!students || !students.length) {
      alert("No student records available to export for the selected filter.");
      return;
    }

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
    { 
      id: "active", 
      label: "Active", 
      icon: UserCheck, 
      activeStyle: "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-600",
      inactiveStyle: "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/60"
    },
    { 
      id: "graduated", 
      label: "Graduated / Alumni", 
      icon: GraduationCap, 
      activeStyle: "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-600",
      inactiveStyle: "text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/60"
    },
    { 
      id: "withdrawn", 
      label: "Withdrawn", 
      icon: UserX, 
      activeStyle: "bg-amber-600 text-white shadow-md shadow-amber-600/20 ring-1 ring-amber-600",
      inactiveStyle: "text-slate-600 hover:text-amber-700 hover:bg-amber-50/60"
    },
    { 
      id: "suspended", 
      label: "Suspended", 
      icon: ShieldAlert, 
      activeStyle: "bg-rose-600 text-white shadow-md shadow-rose-600/20 ring-1 ring-rose-600",
      inactiveStyle: "text-slate-600 hover:text-rose-700 hover:bg-rose-50/60"
    }
  ] as const;

  if (error) {
    return <div className="p-8 text-center text-red-500 font-bold">Failed to load students: {error.message}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Student Directory</h1>
          <p className="text-sm text-slate-500 font-medium">Manage enrollments, graduations, and alumni records natively.</p>
        </div>
        
        {/* Export & Action Header Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {(appCtx?.isAdmin !== false && (appCtx?.isAdmin || appCtx?.can?.("manageRecords") || appCtx?.isAdmin === undefined)) && (
            <>
              <button 
                onClick={() => {
                  const currentTerm = appCtx?.state?.schoolSettings?.term;
                  // End-of-year promotion (Third Term → First Term) is the expected
                  // flow — pass straight through to the wizard.
                  // Mid-term promotion (1st or 2nd term) is unusual and could be
                  // accidental, so show a confirmation dialog first.
                  if (currentTerm === "First Term" || currentTerm === "Second Term") {
                    setShowMidTermPromotionWarning(true);
                  } else {
                    window.dispatchEvent(new CustomEvent("open-promotion-wizard"));
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-sm font-bold shadow-sm shadow-indigo-500/20 active:scale-95"
              >
                <GraduationCap size={18} /> Bulk Promote
              </button>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent("open-promotion-history"))}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                title="Inspect Audit Log & Revert Past Promotion Batches"
              >
                <RotateCcw size={17} /> History & Undo
              </button>
            </>
          )}
          <button 
            disabled={isExporting}
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all text-sm font-bold shadow-sm active:scale-95"
          >
            <Printer size={18} /> Print
          </button>
          
          <div className="relative group">
            <button 
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all text-sm font-bold shadow-sm active:scale-95"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              Export <ChevronDown size={14} className="opacity-70" />
            </button>
            
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
              <div className="p-1.5 space-y-1">
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors">
                  <FileText size={15} className="text-indigo-500" /> Export as PDF
                </button>
                <button onClick={handleExportCSV} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-colors">
                  <FileText size={15} className="text-emerald-500" /> Export as CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Pro Filter Control Card - Clean 2-Row Layout preventing edge overflow */}
      <div className="bg-slate-50/90 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm backdrop-blur-sm space-y-3.5">
        {/* Row 1: Segmented Status Filter Tabs Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-white rounded-xl border border-slate-200/90 p-1.5 shadow-sm gap-1.5">
          {tabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setStatusFilter(tab.id); setPage(0); }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-extrabold transition-all duration-200 ${
                  isActive ? tab.activeStyle : tab.inactiveStyle
                }`}
              >
                <Icon size={16} className={`shrink-0 ${isActive ? "text-white" : "opacity-70"}`} />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Search Input & Select Dropdowns Toolbar */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input with Clear Button */}
          <div className="relative flex-1 w-full min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              id="directory-search-input"
              name="directorySearch"
              aria-label="Search students by name or admission number"
              type="text" 
              placeholder="Search by name or admission no..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 shadow-sm transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(""); setPage(0); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-all"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Grouped Select Dropdowns */}
          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
            {/* Class Filter Dropdown */}
            <div className="relative flex-1 md:flex-none md:w-44">
              <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
              <select
                id="directory-class-filter-select"
                name="directoryClassFilter"
                aria-label="Filter students by class"
                value={classFilter}
                onChange={(e) => { setClassFilter(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs font-extrabold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 shadow-sm cursor-pointer transition-all"
              >
                <option value="all">All Classes</option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            {/* Term Filter Dropdown */}
            <div className="relative flex-1 md:flex-none md:w-40">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
              <select
                id="directory-term-filter-select"
                name="directoryTermFilter"
                aria-label="Filter students by academic term"
                value={termFilter}
                onChange={(e) => { setTermFilter(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs font-extrabold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 shadow-sm cursor-pointer transition-all"
              >
                <option value="all">All Terms</option>
                <option value="First Term">First Term</option>
                <option value="Second Term">Second Term</option>
                <option value="Third Term">Third Term</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
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

      {/* ── Mid-Term Promotion Warning Dialog ─────────────────────────── */}
      {showMidTermPromotionWarning && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">Promote Mid-Term?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  The school is currently in <span className="font-bold text-slate-700">{appCtx?.state?.schoolSettings?.term || "an active term"}</span>.
                  Promotion is normally done at the end of the <span className="font-bold text-slate-700">Third Term</span>.
                </p>
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3 font-semibold">
                  ⚠ Running promotion now will move students to their next class immediately. This action is reversible via Promotion History &amp; Undo, but should be done with care.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowMidTermPromotionWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMidTermPromotionWarning(false);
                  window.dispatchEvent(new CustomEvent("open-promotion-wizard"));
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors shadow-sm"
              >
                Yes, Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────── */}
    </div>
  );
}

