export type ResourceSource = {
  id: string;
  name: string;
  description: string;
  icon: string;
  badge: string;
  badgeColor: string;
  url: string;
  coverage: string[];
  type: string;
  integrationType: string;
};

// External resource sources for curriculum & e-notes integration
export const RESOURCE_SOURCES: ResourceSource[] = [
  {
    id: "classnotes",
    name: "ClassNotes.ng",
    description: "Expert-verified, term-organized notes for Primary & Secondary",
    icon: "📚",
    badge: "Recommended",
    badgeColor: "bg-amber-100 text-amber-700",
    url: "https://classnotes.ng",
    coverage: ["Primary", "Secondary"],
    type: "Notes & Lessons",
    integrationType: "Deep Link",
  },
  {
    id: "mdteachers",
    name: "MD Teachers' Resources",
    description: "UBE-aligned downloadable PDFs for Nursery–Primary 6",
    icon: "📄",
    badge: "PDFs Available",
    badgeColor: "bg-blue-100 text-blue-700",
    url: "https://mdteachersresources.com.ng",
    coverage: ["Nursery", "Primary"],
    type: "Lesson Plans & PDFs",
    integrationType: "Curated Links",
  },
  {
    id: "nerdc",
    name: "NERDC e-Curriculum Portal",
    description: "Official Nigerian government curriculum portal",
    icon: "🏛️",
    badge: "Official",
    badgeColor: "bg-emerald-100 text-emerald-700",
    url: "https://nerdc.gov.ng",
    coverage: ["Nursery", "Primary", "Secondary"],
    type: "Official Curriculum",
    integrationType: "Reference Link",
  },
  {
    id: "stoplearn",
    name: "StopLearn",
    description: "Secondary-focused with video lessons for JSS & SSS",
    icon: "🎥",
    badge: "Video Support",
    badgeColor: "bg-purple-100 text-purple-700",
    url: "https://stoplearn.com",
    coverage: ["Secondary"],
    type: "Videos & Notes",
    integrationType: "Deep Link",
  },
  {
    id: "kofastudy",
    name: "KofaStudy",
    description: "Interactive learning platform for secondary students",
    icon: "🎓",
    badge: "Interactive",
    badgeColor: "bg-pink-100 text-pink-700",
    url: "https://kofastudy.com",
    coverage: ["Secondary"],
    type: "Interactive Lessons",
    integrationType: "Deep Link",
  },
  {
    id: "passnownow",
    name: "PassNowNow",
    description: "Comprehensive resources for primary and secondary education",
    icon: "✏️",
    badge: "Free",
    badgeColor: "bg-cyan-100 text-cyan-700",
    url: "https://passnownow.com",
    coverage: ["Primary", "Secondary"],
    type: "Notes & Tests",
    integrationType: "Deep Link",
  },
];
