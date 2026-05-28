/**
 * schoolService.ts — Tenant-scoped query service for Phase 4.
 *
 * Rules:
 *  - schoolId is NEVER accepted as a parameter from the UI.
 *    It is read from the auth context and passed internally.
 *  - Every query adds .eq('school_id', schoolId) for defence-in-depth
 *    in addition to RLS policies.
 *  - All functions throw with a descriptive message on Supabase error.
 *  - UI components import ONLY from this file, never call supabase directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (supabase as any);

import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────

export interface School {
  id: string;
  tenant_id?: string | null;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_country: string;
  logo: string | null;
  timezone: string;
  academic_year: string;
  current_term: "first" | "second" | "third";
  features: Record<string, boolean>;
  max_students: number;
  current_students: number;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | null;
  photo: string | null;
  class_id: string | null;
  class_name: string | null;
  status: "active" | "graduated" | "withdrawn";
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  guardian_relationship: string | null;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  school_id: string;
  auth_user_id: string | null;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: "teacher" | "head_teacher" | "principal" | "school_admin";
  subject_ids: string[];
  class_ids: string[];
  is_class_teacher: boolean;
  class_teacher_of: string | null;
  status: "active" | "on_leave" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  arm: string | null;
  class_teacher_id: string | null;
  class_teacher_name: string | null;
  student_count: number;
  academic_year: string;
  term: "first" | "second" | "third";
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  school_id: string;
  class_id: string;
  class_name: string;
  date: string;
  term: "first" | "second" | "third";
  academic_year: string;
  taken_by: string;
  taken_by_name: string;
  records: Record<string, { present: boolean; remark?: string }>;
  present_count: number;
  absent_count: number;
  created_at: string;
}

export interface Result {
  id?: string;
  school_id: string;
  student_id: string;
  student_name: string;
  admission_no: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  teacher_id?: string | null;
  academic_year: string;
  term: "first" | "second" | "third";
  score_ca1?: number | null;
  score_ca2?: number | null;
  score_exam?: number | null;
  score_total?: number | null;
  grade?: string | null;
  remark?: string | null;
  teacher_comment?: string | null;
}

export interface Fee {
  id: string;
  school_id: string;
  name: string;
  amount: number;
  currency: string;
  due_date: string | null;
  term: "first" | "second" | "third";
  academic_year: string;
  applicable_to: string[];
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  school_id: string;
  student_id: string;
  student_name: string;
  fee_id: string;
  fee_name: string;
  amount: number;
  currency: string;
  reference: string | null;
  status: "pending" | "success" | "failed";
  channel: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
}

// ─── Internal helper ──────────────────────────────────────────────────

function requireSchoolId(schoolId: string | null | undefined): string {
  if (!schoolId) throw new Error("No school assigned to current user");
  return schoolId;
}

function throwIfError(error: unknown, context: string): void {
  if (error && typeof error === "object" && "message" in error) {
    throw new Error(`${context}: ${(error as { message: string }).message}`);
  }
}

// ─── School Profile ────────────────────────────────────────────────────

export async function getSchoolProfile(schoolId: string | null): Promise<School> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("schools")
    .select("*")
    .eq("id", sid)
    .single();
  throwIfError(error, "getSchoolProfile");
  return data as School;
}

export async function updateSchoolProfile(
  schoolId: string | null,
  updates: Partial<School>
): Promise<School> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("schools")
    .update(updates)
    .eq("id", sid)
    .select()
    .single();
  throwIfError(error, "updateSchoolProfile");
  return data as School;
}

// ─── Students ─────────────────────────────────────────────────────────

export interface StudentSummary {
  total: number;
  male: number;
  female: number;
  unspecified: number;
}

export async function getStudentSummary(
  schoolId: string | null,
  classId?: string
): Promise<StudentSummary> {
  const sid = requireSchoolId(schoolId);
  let query = db()
    .from("students")
    .select("id, gender")
    .eq("school_id", sid)
    .eq("status", "active");

  if (classId) query = query.eq("class_id", classId);

  const { data, error } = await query;
  throwIfError(error, "getStudentSummary");

  const rows = (data ?? []) as { id: string; gender: string | null }[];
  const total       = rows.length;
  const male        = rows.filter((s) => s.gender === "male").length;
  const female      = rows.filter((s) => s.gender === "female").length;
  const unspecified = total - male - female;
  return { total, male, female, unspecified };
}

export async function getStudents(
  schoolId: string | null,
  filters?: { class_id?: string; status?: string }
): Promise<Student[]> {
  const sid = requireSchoolId(schoolId);
  let query = db()
    .from("students")
    .select("*")
    .eq("school_id", sid)
    .order("last_name", { ascending: true });

  if (filters?.class_id) query = query.eq("class_id", filters.class_id);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  throwIfError(error, "getStudents");
  return (data ?? []) as Student[];
}

export async function getStudent(schoolId: string | null, studentId: string): Promise<Student> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("school_id", sid)
    .single();
  throwIfError(error, "getStudent");
  return data as Student;
}

export async function createStudent(
  schoolId: string | null,
  data: Omit<Student, "id" | "school_id" | "created_at" | "updated_at" | "enrolled_at">
): Promise<Student> {
  const sid = requireSchoolId(schoolId);
  const { data: row, error } = await db()
    .from("students")
    .insert({ ...data, school_id: sid })
    .select()
    .single();
  throwIfError(error, "createStudent");
  return row as Student;
}

export async function updateStudent(
  schoolId: string | null,
  studentId: string,
  updates: Partial<Student>
): Promise<Student> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("students")
    .update(updates)
    .eq("id", studentId)
    .eq("school_id", sid)
    .select()
    .single();
  throwIfError(error, "updateStudent");
  return data as Student;
}

export async function archiveStudent(
  schoolId: string | null,
  studentId: string
): Promise<void> {
  const sid = requireSchoolId(schoolId);
  const { error } = await db()
    .from("students")
    .update({ status: "withdrawn" })
    .eq("id", studentId)
    .eq("school_id", sid);
  throwIfError(error, "archiveStudent");
}

export async function bulkCreateStudents(
  schoolId: string | null,
  rows: Omit<Student, "id" | "school_id" | "created_at" | "updated_at" | "enrolled_at">[]
): Promise<{ inserted: number; errors: { row: number; reason: string }[] }> {
  const sid = requireSchoolId(schoolId);
  const CHUNK = 500;
  let inserted = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, school_id: sid }));
    const { data, error } = await db()
      .from("students")
      .insert(chunk)
      .select("id");

    if (error) {
      errors.push({ row: i, reason: error.message });
    } else {
      inserted += (data ?? []).length;
    }
  }
  return { inserted, errors };
}

// ─── Teachers ─────────────────────────────────────────────────────────

export async function getTeachers(schoolId: string | null): Promise<Teacher[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("teachers")
    .select("*")
    .eq("school_id", sid)
    .order("last_name", { ascending: true });
  throwIfError(error, "getTeachers");
  return (data ?? []) as Teacher[];
}

export async function createTeacher(
  schoolId: string | null,
  teacherData: Omit<Teacher, "id" | "school_id" | "created_at" | "updated_at">,
  adminEmail?: string
): Promise<Teacher> {
  const sid = requireSchoolId(schoolId);

  const { data: row, error: teacherError } = await db()
    .from("teachers")
    .insert({ ...teacherData, school_id: sid })
    .select()
    .single();
  throwIfError(teacherError, "createTeacher");

  // Also insert pre_registration so the teacher can sign up and auto-get their role
  if (adminEmail) {
    await db()
      .from("pre_registrations")
      .insert({
        school_id: sid,
        email: adminEmail.toLowerCase(),
        role: teacherData.role ?? "teacher",
      })
      .select("id")
      .single();
    // Not throwing on pre_reg conflict (23505 = duplicate) — teacher record still created
  }

  return row as Teacher;
}

export async function updateTeacher(
  schoolId: string | null,
  teacherId: string,
  updates: Partial<Teacher>
): Promise<Teacher> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("teachers")
    .update(updates)
    .eq("id", teacherId)
    .eq("school_id", sid)
    .select()
    .single();
  throwIfError(error, "updateTeacher");
  return data as Teacher;
}

// ─── Classes ──────────────────────────────────────────────────────────

export async function getClasses(schoolId: string | null): Promise<Class[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("classes")
    .select("*")
    .eq("school_id", sid)
    .order("name", { ascending: true });
  throwIfError(error, "getClasses");
  return (data ?? []) as Class[];
}

export async function createClass(
  schoolId: string | null,
  classData: Omit<Class, "id" | "school_id" | "created_at" | "updated_at" | "student_count">
): Promise<Class> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("classes")
    .insert({ ...classData, school_id: sid })
    .select()
    .single();
  throwIfError(error, "createClass");
  return data as Class;
}

export async function updateClass(
  schoolId: string | null,
  classId: string,
  updates: Partial<Class>
): Promise<Class> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("classes")
    .update(updates)
    .eq("id", classId)
    .eq("school_id", sid)
    .select()
    .single();
  throwIfError(error, "updateClass");
  return data as Class;
}

// ─── Subjects ─────────────────────────────────────────────────────────

export async function getSubjects(schoolId: string | null): Promise<Subject[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("subjects")
    .select("*")
    .eq("school_id", sid)
    .order("name", { ascending: true });
  throwIfError(error, "getSubjects");
  return (data ?? []) as Subject[];
}

// ─── Attendance ────────────────────────────────────────────────────────

export async function getAttendance(
  schoolId: string | null,
  classId: string,
  date: string
): Promise<AttendanceRecord | null> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("attendance")
    .select("*")
    .eq("school_id", sid)
    .eq("class_id", classId)
    .eq("date", date)
    .maybeSingle();
  throwIfError(error, "getAttendance");
  return data as AttendanceRecord | null;
}

export async function saveAttendance(
  schoolId: string | null,
  payload: Omit<AttendanceRecord, "id" | "school_id" | "created_at">
): Promise<AttendanceRecord> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("attendance")
    .upsert({ ...payload, school_id: sid }, { onConflict: "school_id,class_id,date" })
    .select()
    .single();
  throwIfError(error, "saveAttendance");
  return data as AttendanceRecord;
}

export async function getAttendanceSummary(
  schoolId: string | null,
  classId: string,
  term: string
): Promise<{ date: string; present_count: number; absent_count: number }[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("attendance")
    .select("date, present_count, absent_count")
    .eq("school_id", sid)
    .eq("class_id", classId)
    .eq("term", term)
    .order("date", { ascending: true });
  throwIfError(error, "getAttendanceSummary");
  return data ?? [];
}

// ─── Results ──────────────────────────────────────────────────────────

export async function getResults(
  schoolId: string | null,
  filters: {
    student_id?: string;
    class_id?: string;
    term?: string;
    academic_year?: string;
  }
): Promise<Result[]> {
  const sid = requireSchoolId(schoolId);
  let query = db()
    .from("results")
    .select("*")
    .eq("school_id", sid);

  if (filters.student_id) query = query.eq("student_id", filters.student_id);
  if (filters.class_id) query = query.eq("class_id", filters.class_id);
  if (filters.term) query = query.eq("term", filters.term);
  if (filters.academic_year) query = query.eq("academic_year", filters.academic_year);

  const { data, error } = await query.order("student_name", { ascending: true });
  throwIfError(error, "getResults");
  return (data ?? []) as Result[];
}

export async function saveResult(
  schoolId: string | null,
  payload: Omit<Result, "score_total" | "grade" | "remark">
): Promise<Result> {
  const sid = requireSchoolId(schoolId);
  // Explicitly omit computed fields — trigger sets them server-side
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { score_total: _st, grade: _g, remark: _r, ...safe } = payload as any;
  void _st; void _g; void _r;

  const { data, error } = await db()
    .from("results")
    .upsert({ ...safe, school_id: sid }, {
      onConflict: "school_id,student_id,subject_id,term,academic_year",
    })
    .select()
    .single();
  throwIfError(error, "saveResult");
  return data as Result;
}

export async function bulkSaveResults(
  schoolId: string | null,
  rows: Omit<Result, "score_total" | "grade" | "remark">[]
): Promise<Result[]> {
  const sid = requireSchoolId(schoolId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = (rows as any[]).map(({ score_total: _st, grade: _g, remark: _r, ...r }: any) => {
    void _st; void _g; void _r;
    return { ...r, school_id: sid };
  });

  const { data, error } = await db()
    .from("results")
    .upsert(safe, { onConflict: "school_id,student_id,subject_id,term,academic_year" })
    .select();
  throwIfError(error, "bulkSaveResults");
  return (data ?? []) as Result[];
}

// ─── Fees ─────────────────────────────────────────────────────────────

export async function getFees(schoolId: string | null, term?: string): Promise<Fee[]> {
  const sid = requireSchoolId(schoolId);
  let query = db()
    .from("fees")
    .select("*")
    .eq("school_id", sid)
    .order("name", { ascending: true });

  if (term) query = query.eq("term", term);
  const { data, error } = await query;
  throwIfError(error, "getFees");
  return (data ?? []) as Fee[];
}

export async function createFee(
  schoolId: string | null,
  data: Omit<Fee, "id" | "school_id" | "created_at" | "updated_at">
): Promise<Fee> {
  const sid = requireSchoolId(schoolId);
  const { data: row, error } = await db()
    .from("fees")
    .insert({ ...data, school_id: sid })
    .select()
    .single();
  throwIfError(error, "createFee");
  return row as Fee;
}

export async function updateFee(
  schoolId: string | null,
  feeId: string,
  updates: Partial<Omit<Fee, "id" | "school_id" | "created_at">>
): Promise<Fee> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("fees")
    .update(updates)
    .eq("id", feeId)
    .eq("school_id", sid)
    .select()
    .single();
  throwIfError(error, "updateFee");
  return data as Fee;
}

export async function deleteFee(
  schoolId: string | null,
  feeId: string
): Promise<void> {
  const sid = requireSchoolId(schoolId);
  const { error } = await db()
    .from("fees")
    .delete()
    .eq("id", feeId)
    .eq("school_id", sid);
  throwIfError(error, "deleteFee");
}

export async function getPayments(
  schoolId: string | null,
  filters?: { student_id?: string; status?: string }
): Promise<Payment[]> {
  const sid = requireSchoolId(schoolId);
  let query = db()
    .from("payments")
    .select("*")
    .eq("school_id", sid)
    .order("created_at", { ascending: false });

  if (filters?.student_id) query = query.eq("student_id", filters.student_id);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  throwIfError(error, "getPayments");
  return (data ?? []) as Payment[];
}

// ─── Teacher Portal Helpers ───────────────────────────────────────────

export async function getMyTeacherProfile(
  schoolId: string | null,
  authUserId: string
): Promise<Teacher | null> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("teachers")
    .select("*")
    .eq("school_id", sid)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  throwIfError(error, "getMyTeacherProfile");
  return data as Teacher | null;
}

export async function getStudentProfile(
  _schoolId: string | null,
  _authUserId: string
): Promise<Student | null> {
  // Students are not yet linked via auth_user_id in this schema.
  // Returns null so callers fall back to class-picker mode.
  return null;
}

export async function getTeacherClasses(
  schoolId: string | null,
  teacher: Teacher
): Promise<Class[]> {
  const sid = requireSchoolId(schoolId);

  // Classes where teacher is the assigned class teacher OR in their class_ids array
  const classTeacherIds: string[] = teacher.class_teacher_of ? [teacher.class_teacher_of] : [];
  const assignedIds: string[] = Array.isArray(teacher.class_ids) ? teacher.class_ids : [];
  const allIds = Array.from(new Set([...classTeacherIds, ...assignedIds]));

  // Also pull by class_teacher_id column
  const queries: Promise<Class[]>[] = [];

  // by class_teacher_id column
  queries.push(
    db()
      .from("classes")
      .select("*")
      .eq("school_id", sid)
      .eq("class_teacher_id", teacher.id)
      .then(({ data, error }: { data: Class[] | null; error: unknown }) => {
        throwIfError(error, "getTeacherClasses:class_teacher_id");
        return data ?? [];
      })
  );

  // by id list from teacher.class_ids
  if (allIds.length > 0) {
    queries.push(
      db()
        .from("classes")
        .select("*")
        .eq("school_id", sid)
        .in("id", allIds)
        .then(({ data, error }: { data: Class[] | null; error: unknown }) => {
          throwIfError(error, "getTeacherClasses:class_ids");
          return data ?? [];
        })
    );
  }

  const results = await Promise.all(queries);
  const merged = results.flat();
  // deduplicate by id
  const seen = new Set<string>();
  return merged.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// ─── Timetable ────────────────────────────────────────────────────────

export interface TimetableSlot {
  id: string;
  school_id: string;
  class_id: string;
  class_name: string;
  academic_year: string;
  term: "first" | "second" | "third";
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  period_number: number;
  period_type: "lesson" | "short_break" | "long_break" | "assembly" | "lunch" | "closing";
  start_time: string;
  end_time: string;
  subject_id: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  room: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getTimetable(
  schoolId: string | null,
  classId: string,
  term: string,
  academicYear: string
): Promise<TimetableSlot[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db()
    .from("timetable")
    .select("*")
    .eq("school_id", sid)
    .eq("class_id", classId)
    .eq("term", term)
    .eq("academic_year", academicYear)
    .order("day")
    .order("period_number");
  throwIfError(error, "getTimetable");
  return (data ?? []) as TimetableSlot[];
}

export async function saveTimetableSlot(
  schoolId: string | null,
  slot: Omit<TimetableSlot, "id" | "school_id" | "created_at" | "updated_at"> & { id?: string }
): Promise<TimetableSlot> {
  const sid = requireSchoolId(schoolId);
  const payload = { ...slot, school_id: sid };
  const { data, error } = await db()
    .from("timetable")
    .upsert(payload, { onConflict: "school_id,class_id,day,period_number,academic_year,term" })
    .select()
    .single();
  throwIfError(error, "saveTimetableSlot");
  return data as TimetableSlot;
}

export async function bulkSaveTimetable(
  schoolId: string | null,
  slots: (Omit<TimetableSlot, "id" | "school_id" | "created_at" | "updated_at"> & { id?: string })[]
): Promise<TimetableSlot[]> {
  const sid = requireSchoolId(schoolId);
  const payloads = slots.map((s) => ({ ...s, school_id: sid }));
  const { data, error } = await db()
    .from("timetable")
    .upsert(payloads, { onConflict: "school_id,class_id,day,period_number,academic_year,term" })
    .select();
  throwIfError(error, "bulkSaveTimetable");
  return (data ?? []) as TimetableSlot[];
}

export async function deleteTimetableSlot(
  schoolId: string | null,
  slotId: string
): Promise<void> {
  const sid = requireSchoolId(schoolId);
  const { error } = await db()
    .from("timetable")
    .delete()
    .eq("school_id", sid)
    .eq("id", slotId);
  throwIfError(error, "deleteTimetableSlot");
}

// ─── Attendance RPCs ───────────────────────────────────────────────────

export interface AttendanceSummaryRow {
  total_classes_with_attendance: number;
  total_present: number;
  total_absent: number;
  attendance_rate: number;
}

export interface AttendanceByClassRow {
  class_id: string;
  class_name: string;
  present_count: number;
  absent_count: number;
  taken_by_name: string;
  taken_at: string;
}

export async function getTodayAttendanceSummary(
  schoolId: string | null
): Promise<AttendanceSummaryRow | null> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db().rpc("get_today_attendance_summary", { p_school_id: sid });
  throwIfError(error, "getTodayAttendanceSummary");
  return (data?.[0] ?? null) as AttendanceSummaryRow | null;
}

export async function getTodayAttendanceByClass(
  schoolId: string | null
): Promise<AttendanceByClassRow[]> {
  const sid = requireSchoolId(schoolId);
  const { data, error } = await db().rpc("get_today_attendance_by_class", { p_school_id: sid });
  throwIfError(error, "getTodayAttendanceByClass");
  return (data ?? []) as AttendanceByClassRow[];
}

// ─── Activity Logs ────────────────────────────────────────────────────

export async function getRecentActivity(
  tenantId: string | null,
  limit = 10
): Promise<{ id: number; staff_id: string; action: string; details: string | null; timestamp: string }[]> {
  if (!tenantId) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_tenant_activity_logs", {
    _tenant_id: tenantId,
    _limit: limit,
  });
  throwIfError(error, "getRecentActivity");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any as { id: number; staff_id: string; action: string; details: string | null; timestamp: string }[];
}
