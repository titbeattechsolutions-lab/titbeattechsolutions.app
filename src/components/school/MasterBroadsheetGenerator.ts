import { SupabaseClient } from "@supabase/supabase-js";

interface BroadsheetParams {
  tenantId: string;
  className: string;
  session: string;
  term: string;
  supabase: SupabaseClient<any, "public", any>;
  XLSX: any;
}

const normaliseTerm = (t: string) => {
  const lower = t.toLowerCase();
  if (lower.includes("second")) return "second";
  if (lower.includes("third")) return "third";
  return "first";
};

function getGrade(score: number) {
  if (score >= 75) return { grade: "A1", remark: "Excellent" };
  if (score >= 70) return { grade: "B2", remark: "Very Good" };
  if (score >= 65) return { grade: "B3", remark: "Good" };
  if (score >= 60) return { grade: "C4", remark: "Credit" };
  if (score >= 55) return { grade: "C5", remark: "Credit" };
  if (score >= 50) return { grade: "C6", remark: "Credit" };
  if (score >= 45) return { grade: "D7", remark: "Pass" };
  if (score >= 40) return { grade: "E8", remark: "Pass" };
  return { grade: "F9", remark: "Fail" };
}

function calculatePosition(score: number, allScores: number[]) {
  const sorted = [...allScores].sort((a, b) => b - a);
  const index = sorted.indexOf(score);
  return index === -1 ? "-" : index + 1;
}

export async function exportMasterBroadsheet({
  tenantId,
  className,
  session,
  term,
  supabase,
  XLSX
}: BroadsheetParams) {
  // 1. Fetch all results for this class and session across ALL terms
  // To support cumulative averages, we must get first, second, and third term data.
  const { data: resultsData, error } = await supabase.from("results")
    .select(`
      student_id, student_name, admission_no, subject_name,
      term, score_ca1, score_ca2, score_exam, score_total
    `)
    .eq("school_id", tenantId)
    .eq("class_name", className)
    .eq("academic_year", session);

  if (error) {
    console.error("Failed to fetch broadsheet data:", error);
    throw new Error("Failed to fetch broadsheet data: " + error.message);
  }

  if (!resultsData || resultsData.length === 0) {
    throw new Error(`No records found for ${className} in ${session}.`);
  }

  const targetTerm = normaliseTerm(term);
  const isThirdTerm = targetTerm === "third";
  const isSecondTerm = targetTerm === "second";

  // Identify all unique subjects taken by this class in the target term
  const targetTermResults = resultsData.filter(r => r.term === targetTerm);
  if (targetTermResults.length === 0) {
    throw new Error(`No records found for ${className} in ${term}.`);
  }

  const uniqueSubjects = Array.from(new Set(targetTermResults.map(r => r.subject_name))).sort();

  // Group by student
  const studentMap = new Map<string, any>();
  
  for (const r of resultsData) {
    if (!studentMap.has(r.student_id)) {
      studentMap.set(r.student_id, {
        id: r.student_id,
        name: r.student_name,
        admission_no: r.admission_no,
        terms: {
          first: { subjects: {}, total: 0, count: 0 },
          second: { subjects: {}, total: 0, count: 0 },
          third: { subjects: {}, total: 0, count: 0 }
        }
      });
    }
    
    const stu = studentMap.get(r.student_id);
    const t = r.term as "first" | "second" | "third";
    
    stu.terms[t].subjects[r.subject_name] = {
      ca: (r.score_ca1 || 0) + (r.score_ca2 || 0),
      exam: r.score_exam || 0,
      total: r.score_total || 0,
    };
    stu.terms[t].total += (r.score_total || 0);
    stu.terms[t].count += 1;
  }

  const students = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Pre-calculate positions per subject for the TARGET term
  const subjectScores: Record<string, number[]> = {};
  for (const subj of uniqueSubjects) {
    subjectScores[subj] = students
      .map(s => s.terms[targetTerm].subjects[subj]?.total)
      .filter(v => v !== undefined) as number[];
  }

  // Pre-calculate overall scores for positions
  students.forEach(stu => {
    // Current term CA and Exam totals
    let totalCa = 0;
    let totalExam = 0;
    let overallTotal = 0;

    uniqueSubjects.forEach(subj => {
      const s = stu.terms[targetTerm].subjects[subj];
      if (s) {
        totalCa += s.ca;
        totalExam += s.exam;
        overallTotal += s.total;
      }
    });

    stu.targetTotalCa = totalCa;
    stu.targetTotalExam = totalExam;
    stu.targetOverallTotal = overallTotal;

    // Averages
    stu.avg1 = stu.terms.first.count > 0 ? stu.terms.first.total / stu.terms.first.count : null;
    stu.avg2 = stu.terms.second.count > 0 ? stu.terms.second.total / stu.terms.second.count : null;
    stu.avg3 = stu.terms.third.count > 0 ? stu.terms.third.total / stu.terms.third.count : null;

    let sumAvgs = 0;
    let countAvgs = 0;
    if (stu.avg1 !== null && (isSecondTerm || isThirdTerm)) { sumAvgs += stu.avg1; countAvgs++; }
    if (stu.avg2 !== null && isThirdTerm) { sumAvgs += stu.avg2; countAvgs++; }
    if (stu.avg3 !== null && isThirdTerm) { sumAvgs += stu.avg3; countAvgs++; }
    else if (stu.avg2 !== null && isSecondTerm) { sumAvgs += stu.avg2; countAvgs++; } // wait, I already added avg1 and avg2 above.
    
    // Always include target term average in overall if not already handled
    const targetAvg = stu.terms[targetTerm].count > 0 ? stu.terms[targetTerm].total / stu.terms[targetTerm].count : null;
    if (targetAvg !== null) {
        if (targetTerm === "first" && stu.avg1 === null) { sumAvgs += targetAvg; countAvgs++; }
    }

    stu.overallAverage = countAvgs > 0 ? sumAvgs / countAvgs : (targetAvg || 0);
  });

  const allOverallTotals = students.map(s => s.targetOverallTotal);

  // Build the Excel Data Array
  const row1: any[] = ["SUBJECT"];
  const row2: any[] = ["S/N", "NAME OF STUDENTS"];

  // Push subject headers
  uniqueSubjects.forEach(subj => {
    row1.push(subj.toUpperCase(), "", "", ""); // Merge over 4 cols
    row2.push("CA", "EXAM", "TOTAL", "POSITION");
  });

  // Cumulative headers
  row1.push("TOTAL CA", "TOTAL EXAM", "OVERALL TOTAL");
  row2.push("", "", "");

  if (isThirdTerm) {
    row1.push("AVERAGE 1ST TERM", "AVERAGE 2ND TERM", "AVERAGE 3RD TERM", "OVERALL AVERAGE");
    row2.push("", "", "", "");
  } else if (isSecondTerm) {
    row1.push("AVERAGE 1ST TERM", "AVERAGE 2ND TERM", "OVERALL AVERAGE");
    row2.push("", "", "");
  } else {
    row1.push("OVERALL AVERAGE");
    row2.push("");
  }

  row1.push("POSITION", "REMARK");
  row2.push("", "");

  const aoa: any[][] = [row1, row2];

  // Fill student rows
  students.forEach((stu, idx) => {
    const row: any[] = [idx + 1, stu.name];

    uniqueSubjects.forEach(subj => {
      const s = stu.terms[targetTerm].subjects[subj];
      if (s) {
        row.push(s.ca, s.exam, s.total, calculatePosition(s.total, subjectScores[subj]));
      } else {
        row.push("-", "-", "-", "-");
      }
    });

    row.push(stu.targetTotalCa, stu.targetTotalExam, stu.targetOverallTotal);

    if (isThirdTerm) {
      row.push(
        stu.avg1 !== null ? stu.avg1.toFixed(1) : "-",
        stu.avg2 !== null ? stu.avg2.toFixed(1) : "-",
        stu.avg3 !== null ? stu.avg3.toFixed(1) : "-",
        stu.overallAverage.toFixed(1)
      );
    } else if (isSecondTerm) {
      row.push(
        stu.avg1 !== null ? stu.avg1.toFixed(1) : "-",
        stu.avg2 !== null ? stu.avg2.toFixed(1) : "-",
        stu.overallAverage.toFixed(1)
      );
    } else {
      row.push(stu.overallAverage.toFixed(1));
    }

    const pos = calculatePosition(stu.targetOverallTotal, allOverallTotals);
    row.push(pos, getGrade(stu.overallAverage).remark);

    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Apply column widths
  const cols = [{ wch: 5 }, { wch: 30 }]; // S/N, Name
  uniqueSubjects.forEach(() => {
    cols.push({ wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 8 }); // CA, EXAM, TOTAL, POSITION
  });
  cols.push({ wch: 10 }, { wch: 10 }, { wch: 12 }); // TOTAL CA, TOTAL EXAM, OVERALL TOTAL
  
  if (isThirdTerm) cols.push({ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 });
  else if (isSecondTerm) cols.push({ wch: 18 }, { wch: 18 }, { wch: 18 });
  else cols.push({ wch: 18 });

  cols.push({ wch: 10 }, { wch: 15 }); // POSITION, REMARK
  ws["!cols"] = cols;

  // Apply merges
  const merges = [];
  merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: 1 } }); 
  
  let currentC = 2;
  uniqueSubjects.forEach(() => {
    merges.push({ s: { r: 0, c: currentC }, e: { r: 0, c: currentC + 3 } }); // Merge Subject name over 4 cols
    currentC += 4;
  });

  const numCumulative = 3 + (isThirdTerm ? 4 : isSecondTerm ? 3 : 1) + 2; 
  for (let i = 0; i < numCumulative; i++) {
    merges.push({ s: { r: 0, c: currentC + i }, e: { r: 1, c: currentC + i } });
  }

  ws["!merges"] = merges;

  // We could apply styles here if XLSX is a version that supports it
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let R = 0; R <= 1; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const cellAddress = { c: C, r: R };
      const cellRef = XLSX.utils.encode_cell(cellAddress);
      if (!ws[cellRef]) continue;
      ws[cellRef].s = {
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
        fill: { fgColor: { rgb: "E2E8F0" } }
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Master List");

  XLSX.writeFile(wb, `${className}_Master_List_${term}.xlsx`);
}
