import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister } from "./lib/query-persister";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SchoolLock from "./pages/SchoolLock";
import TenantApp from "./pages/TenantApp";
import Auth from "./pages/Auth";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound.tsx";
import TeacherPortal from "./pages/teacher/TeacherPortal";
import MyClassesPage from "./pages/teacher/MyClassesPage";
import AttendancePage from "./pages/teacher/AttendancePage";
import ResultsPage from "./pages/teacher/ResultsPage";
import TeacherTimetablePage from "./pages/teacher/TimetablePage";
import TeacherProfilePage from "./pages/teacher/ProfilePage";
import StudentPortal from "./pages/student/StudentPortal";
import StudentProfilePage from "./pages/student/ProfilePage";
import StudentTimetablePage from "./pages/student/TimetablePage";
import SuperadminLayout from "./layouts/SuperadminLayout";
import SchoolsListPage from "./pages/superadmin/SchoolsListPage";
import SchoolDetailPage from "./pages/superadmin/SchoolDetailPage";
import ProvisionSchoolPage from "./pages/superadmin/ProvisionSchoolPage";
import ActivityLogPage from "./pages/superadmin/ActivityLogPage";
import PlatformStatsPage from "./pages/superadmin/PlatformStatsPage";
import BillingListPage from "./pages/superadmin/BillingListPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours for offline persistence
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const SCHOOL_ROLES = ["school_admin", "principal", "head_teacher"] as const;
const TEACHER_ROLES = ["school_admin", "principal", "head_teacher", "teacher"] as const;
const STUDENT_ROLES = ["student"] as const;

function Unauthorized() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1e293b" }}>Access Denied</h1>
      <p style={{ color: "#64748b" }}>You do not have permission to view this page.</p>
    </div>
  );
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister: queryPersister, maxAge: 1000 * 60 * 60 * 24 }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<SchoolLock />} />
            <Route path="/app" element={<TenantApp />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["super_admin"]}>
                  <SuperAdmin />
                </ProtectedRoute>
              }
            />
            {/* Teacher portal */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={[...TEACHER_ROLES]}>
                  <TeacherPortal />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="classes" replace />} />
              <Route path="classes"    element={<MyClassesPage />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="results"    element={<ResultsPage />} />
              <Route path="timetable"  element={<TeacherTimetablePage />} />
              <Route path="profile"    element={<TeacherProfilePage />} />
            </Route>
            {/* Student portal */}
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={[...STUDENT_ROLES]}>
                  <StudentPortal />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="timetable" replace />} />
              <Route path="timetable" element={<StudentTimetablePage />} />
              <Route path="profile"   element={<StudentProfilePage />} />
            </Route>
            {/* Superadmin panel (new school-layer panel) */}
            <Route
              path="/superadmin"
              element={
                <ProtectedRoute allowedRoles={["super_admin"]}>
                  <SuperadminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="schools" replace />} />
              <Route path="schools"          element={<SchoolsListPage />} />
              <Route path="schools/:schoolId" element={<SchoolDetailPage />} />
              <Route path="provision"        element={<ProvisionSchoolPage />} />
              <Route path="billing"          element={<BillingListPage />} />
              <Route path="activity"         element={<ActivityLogPage />} />
              <Route path="stats"            element={<PlatformStatsPage />} />
            </Route>
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
