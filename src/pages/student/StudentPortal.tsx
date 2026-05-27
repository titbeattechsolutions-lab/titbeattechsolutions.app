import { useSchool } from "@/hooks/useSchool";
import StudentLayout from "@/layouts/StudentLayout";

export default function StudentPortal() {
  const { school } = useSchool();
  return <StudentLayout schoolName={school?.name} />;
}
