export const CURRICULUM: Record<string, { classes: string[]; subjects: string[] }> = {
  "Early Years": {
    classes: ["Creche", "Pre-Nursery", "Nursery 1", "Nursery 2"],
    subjects: ["Numeracy", "Literacy", "Health Habits", "Social Norms", "Basic Science", "CRS", "IRS", "Rhymes & Poem", "Phonics", "Creative Arts", "Physical Development"],
  },
  "Lower Primary": {
    classes: ["Primary 1", "Primary 2", "Primary 3"],
    subjects: ["Mathematics", "English Studies", "Basic Science & Tech", "Social Studies", "Civic Education", "Agricultural Science", "Home Economics", "CRS", "IRS", "PHE", "Computer Studies", "Cultural & Creative Arts", "Verbal Reasoning", "Quantitative Reasoning", "Yoruba/Igbo/Hausa"],
  },
  "Upper Primary": {
    classes: ["Primary 4", "Primary 5", "Primary 6"],
    subjects: ["Mathematics", "English Studies", "Basic Science", "ICT", "Social Studies", "Civic Education", "Agricultural Science", "Home Economics", "CRS", "IRS", "PHE", "Cultural & Creative Arts", "Verbal Reasoning", "Quantitative Reasoning", "French", "Yoruba/Igbo/Hausa"],
  },
  "Junior Secondary": {
    classes: ["JSS 1", "JSS 2", "JSS 3"],
    subjects: ["Mathematics", "English Language", "Basic Science", "Basic Technology", "Social Studies", "Civic Education", "Agricultural Science", "Home Economics", "Business Studies", "CRS", "IRS", "PHE", "Computer Studies", "Cultural & Creative Arts", "French", "Nigerian Language"],
  },
  "Senior Secondary": {
    classes: ["SS 1", "SS 2", "SS 3"],
    subjects: ["Mathematics", "English Language", "Civic Education", "Biology", "Economics", "Physics", "Chemistry", "Further Mathematics", "Agricultural Science", "Geography", "Government", "Literature-in-English", "CRS", "IRS", "Financial Accounting", "Commerce", "Data Processing", "Marketing", "Technical Drawing"],
  },
};

export const ALL_CLASSES = Object.values(CURRICULUM).flatMap((c) => c.classes);
export const TERMS = ["First Term", "Second Term", "Third Term"];
export const ROLES = ["Teacher", "Class Teacher", "Subject Teacher", "Head of Dept", "Vice Principal", "Principal"];
export const DEFAULT_PIN = "1234";

export const PERMS_META = [
  { key: "scoreEntry", label: "Score Entry", desc: "Enter CA & exam scores" },
  { key: "viewReports", label: "View Reports", desc: "Access student reports" },
  { key: "printReports", label: "Print Reports", desc: "Print or export reports" },
  { key: "manageRecords", label: "Manage Records", desc: "Delete or edit grades" },
] as const;

export const ATT_STATUSES = [
  { key: "present", label: "Present", icon: "✓", color: "success" },
  { key: "absent", label: "Absent", icon: "✗", color: "destructive" },
  { key: "late", label: "Late", icon: "⏱", color: "warning" },
  { key: "excused", label: "Excused", icon: "📋", color: "primary" },
] as const;

import { normalizeClassName } from "@/lib/promotionUtils";

export function getSubjectsForClass(cls: string): string[] {
  for (const cat of Object.values(CURRICULUM)) {
    if (cat.classes.includes(cls)) return cat.subjects;
  }
  const { normalized } = normalizeClassName(cls);
  for (const cat of Object.values(CURRICULUM)) {
    if (cat.classes.includes(normalized)) return cat.subjects;
  }
  return [];
}

export function getCategoryForClass(cls: string): string {
  for (const [cat, data] of Object.entries(CURRICULUM)) {
    if (data.classes.includes(cls)) return cat;
  }
  const { normalized } = normalizeClassName(cls);
  for (const [cat, data] of Object.entries(CURRICULUM)) {
    if (data.classes.includes(normalized)) return cat;
  }
  return "";
}

export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
