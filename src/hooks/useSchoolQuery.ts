import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStudents, createStudent, updateStudent, changeStudentStatus,
  getClasses, getSubjects, getTeachers,
  getResults, saveResult, bulkSaveResults,
  getAttendance, saveAttendance,
  getFees, createFee, updateFee, deleteFee,
  getPayments,
  Student, Class, Subject, Teacher, Result, AttendanceRecord, Fee, Payment,
} from "@/supabase/schoolService";

const STALE_LONG  = 2  * 60 * 1000; // 2 min — stable reference data
const STALE_SHORT = 30 * 1000;      // 30 s  — attendance / results

// ─── Classes ─────────────────────────────────────────────────────────
export function useClasses() {
  const { schoolId } = useAuth();
  return useQuery<Class[]>({
    queryKey: ["classes", schoolId],
    queryFn: () => getClasses(schoolId),
    staleTime: STALE_LONG,
    enabled: !!schoolId,
  });
}

// ─── Subjects ────────────────────────────────────────────────────────
export function useSubjects() {
  const { schoolId } = useAuth();
  return useQuery<Subject[]>({
    queryKey: ["subjects", schoolId],
    queryFn: () => getSubjects(schoolId),
    staleTime: STALE_LONG,
    enabled: !!schoolId,
  });
}

// ─── Teachers ────────────────────────────────────────────────────────
export function useTeachers() {
  const { schoolId } = useAuth();
  return useQuery<Teacher[]>({
    queryKey: ["teachers", schoolId],
    queryFn: () => getTeachers(schoolId),
    staleTime: STALE_LONG,
    enabled: !!schoolId,
  });
}

export function useCreateTeacher() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Teacher, "id" | "school_id" | "created_at" | "updated_at">) =>
      import("@/supabase/schoolService").then((m) => m.createTeacher(schoolId, data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teachers", schoolId] }),
  });
}

// ─── Students (paginated) ────────────────────────────────────────────
export interface StudentFilters {
  class_id?: string;
  status?: string;
  search?: string;
}

export const STUDENT_PAGE_SIZE = 25;

export function useStudentsPaged(page: number, filters: StudentFilters = {}, overrideSchoolId?: string) {
  const { schoolId: authSchoolId } = useAuth();
  const schoolId = overrideSchoolId || authSchoolId;
  return useQuery<{ students: Student[]; total: number }>({
    queryKey: ["students", schoolId, page, filters],
    queryFn: () => getStudentsPaged(schoolId, page, filters),
    staleTime: STALE_LONG,
    placeholderData: (prev) => prev,
    enabled: !!schoolId,
  });
}

async function getStudentsPaged(
  schoolId: string | null,
  page: number,
  filters: StudentFilters
): Promise<{ students: Student[]; total: number }> {
  const { supabase } = await import("@/integrations/supabase/client");
  if (!schoolId) return { students: [], total: 0 };

  const from = page * STUDENT_PAGE_SIZE;
  const to   = from + STUDENT_PAGE_SIZE - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("students")
    .select("*", { count: "exact" })
    .eq("school_id", schoolId)
    .order("last_name")
    .range(from, to);

  if (filters.class_id) q = q.eq("class_id", filters.class_id);
  if (filters.status)   q = q.eq("status", filters.status);
  if (filters.search) {
    const s = filters.search.trim();
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,admission_no.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { students: (data ?? []) as Student[], total: count ?? 0 };
}

export function useCreateStudent() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Student, "id" | "school_id" | "created_at" | "updated_at">) =>
      createStudent(schoolId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", schoolId] }),
  });
}

export function useUpdateStudent() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Student> }) =>
      updateStudent(schoolId, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", schoolId] }),
  });
}

export function useChangeStudentStatus(overrideSchoolId?: string) {
  const { schoolId: authSchoolId } = useAuth();
  const schoolId = overrideSchoolId || authSchoolId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, newStatus, academicYear, reason }: {
      studentId: string;
      newStatus: "graduated" | "withdrawn" | "suspended" | "active";
      academicYear: string;
      reason?: string;
    }) => changeStudentStatus(schoolId, studentId, newStatus, academicYear, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", schoolId] }),
  });
}

// ─── Attendance ──────────────────────────────────────────────────────
export function useAttendance(classId: string, date: string) {
  const { schoolId } = useAuth();
  return useQuery<AttendanceRecord | null>({
    queryKey: ["attendance", schoolId, classId, date],
    queryFn: () => getAttendance(schoolId, classId, date),
    staleTime: STALE_SHORT,
    enabled: !!schoolId && !!classId && !!date,
  });
}

export function useSaveAttendance() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof saveAttendance>[1]) =>
      saveAttendance(schoolId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["attendance", schoolId, vars.class_id, vars.date] });
    },
  });
}

// ─── Results ─────────────────────────────────────────────────────────
export function useResults(params: {
  class_id: string;
  subject_id: string;
  term: string;
  academic_year: string;
}) {
  const { schoolId } = useAuth();
  return useQuery<Result[]>({
    queryKey: ["results", schoolId, params],
    queryFn: () => getResults(schoolId, params),
    staleTime: STALE_SHORT,
    enabled: !!schoolId && !!params.class_id && !!params.subject_id && !!params.term && !!params.academic_year,
  });
}

export function useSaveResult() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof saveResult>[1]) =>
      saveResult(schoolId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["results", schoolId] }),
  });
}

export function useBulkSaveResults() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payloads: Parameters<typeof bulkSaveResults>[1]) =>
      bulkSaveResults(schoolId, payloads),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["results", schoolId] }),
  });
}

// ─── Fees ────────────────────────────────────────────────────────────
export function useFees(term?: string) {
  const { schoolId } = useAuth();
  return useQuery<Fee[]>({
    queryKey: ["fees", schoolId, term],
    queryFn: () => getFees(schoolId, term),
    staleTime: STALE_LONG,
    enabled: !!schoolId,
  });
}

export function useCreateFee() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof createFee>[1]) => createFee(schoolId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", schoolId] }),
  });
}

export function useUpdateFee() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateFee>[2] }) =>
      updateFee(schoolId, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", schoolId] }),
  });
}

export function useDeleteFee() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feeId: string) => deleteFee(schoolId, feeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fees", schoolId] }),
  });
}

// ─── Payments ────────────────────────────────────────────────────────
export function usePayments(filters?: Parameters<typeof getPayments>[1]) {
  const { schoolId } = useAuth();
  return useQuery<Payment[]>({
    queryKey: ["payments", schoolId, filters],
    queryFn: () => getPayments(schoolId, filters),
    staleTime: STALE_SHORT,
    enabled: !!schoolId,
  });
}
