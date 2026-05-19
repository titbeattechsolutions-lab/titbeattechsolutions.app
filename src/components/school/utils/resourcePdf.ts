// PDF generation utilities for NAPPS Curriculum Guide and E-Notes
// Uses jsPDF loaded dynamically from CDN (declared globally in main app file)
declare const jspdf: any;

async function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureJsPDF(): Promise<boolean> {
  if (typeof jspdf !== "undefined") return true;
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    return true;
  } catch {
    return false;
  }
}

export async function downloadCurriculumGuidePDF(
  level: string,
  data: { classes: string[]; subjects: string[]; description: string }
): Promise<boolean> {
  const ok = await ensureJsPDF();
  if (!ok) return false;
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 14;
  let y = 20;

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, W, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("NAPPS Curriculum Guide", margin, 15);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(level, margin, 25);

  y = 45;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.text(data.description, margin, y);
  y += 10;

  // Classes section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Classes", margin, y);
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  data.classes.forEach((cls, idx) => {
    doc.text(`${idx + 1}. ${cls}`, margin + 5, y);
    y += 6;
  });
  y += 5;

  // Subjects section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text("Subjects", margin, y);
  y += 7;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  data.subjects.forEach((sub, idx) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(`${idx + 1}. ${sub}`, margin + 5, y);
    y += 6;
  });

  // Footer
  const pages = doc.internal.pages.length - 1;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`NAPPS Curriculum Guide - ${level} | Page ${i} of ${pages}`, margin, 290);
  }

  doc.save(`NAPPS_Curriculum_${level.replace(/\s+/g, "_")}.pdf`);
  return true;
}

export async function downloadENotePDF(
  level: string,
  subject: string,
  notes: { title: string; content: string; topics: string[] }[]
): Promise<boolean> {
  const ok = await ensureJsPDF();
  if (!ok) return false;
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 14;
  let y = 20;

  // Header
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, W, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("E-Notes", margin, 15);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${level} - ${subject}`, margin, 25);

  y = 45;
  doc.setTextColor(0, 0, 0);

  notes.forEach((note, idx) => {
    if (y > 250) { doc.addPage(); y = 20; }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(16, 185, 129);
    doc.text(`${idx + 1}. ${note.title}`, margin, y);
    y += 7;

    // Content
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(note.content, W - 2 * margin);
    lines.forEach((line: string) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    });
    y += 3;

    // Topics
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Topics Covered:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    note.topics.forEach((topic) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`• ${topic}`, margin + 5, y);
      y += 5;
    });
    y += 8;
  });

  // Footer
  const pages = doc.internal.pages.length - 1;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`NAPPS E-Notes - ${level}/${subject} | Page ${i} of ${pages}`, margin, 290);
  }

  doc.save(`NAPPS_ENotes_${level.replace(/\s+/g, "_")}_${subject.replace(/\s+/g, "_")}.pdf`);
  return true;
}
