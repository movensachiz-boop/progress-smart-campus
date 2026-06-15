import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import pccLogo from "@/assets/pcc-logo.png";

export interface TargetsStudent {
  studentName?: string;
  regNo?: string;
  form?: string;
  stream?: string;
}

export interface TargetsFormInput extends TargetsStudent {
  term?: string;
  year?: string;
  level: "O" | "A";
  subjects?: string[];
}

export interface TargetsBatchInput {
  level: "O" | "A";
  term?: string;
  year?: string;
  subjects?: string[];
  students: TargetsStudent[];
  className?: string; // used for file name
}

const loadImage = (src: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });

const renderPage = (
  doc: jsPDF,
  logo: string,
  input: TargetsFormInput,
) => {
  const navy: [number, number, number] = [0, 51, 102];
  const gold: [number, number, number] = [255, 215, 0];
  const pageW = 297;
  const pageH = 210;

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 30, pageW, 1.2, "F");

  if (logo) {
    try { doc.addImage(logo, "PNG", 8, 4, 22, 22); } catch {}
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PROGRESS CHRISTIAN COLLEGE", 34, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("LOT E Bonnyvale, Shurugwi Road  •  Tel: 2255629", 34, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...gold);
  doc.text("STUDENT ACADEMIC TARGETS FORM", 34, 25);

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.text(`${input.level} LEVEL`, pageW - 10, 12, { align: "right" });
  doc.text(new Date().toLocaleDateString(), pageW - 10, 18, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 40;
  const labelVal = (label: string, val: string, x: number, w: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth(label);
    doc.line(x + lw + 2, y + 0.8, x + w, y + 0.8);
    if (val) doc.text(val, x + lw + 4, y);
  };
  labelVal("NAME:", input.studentName || "", 10, 110);
  labelVal("REG NO:", input.regNo || "", 125, 200);
  labelVal("CLASS:", `${input.form || ""} ${input.stream || ""}`.trim(), 210, 290);
  y += 8;
  labelVal("TERM:", input.term || "", 10, 80);
  labelVal("YEAR:", input.year || String(new Date().getFullYear()), 95, 165);
  labelVal("DATE:", "", 180, 290);
  y += 8;

  doc.setFillColor(245, 247, 250);
  doc.rect(10, y, pageW - 20, 10, "F");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text(
    "Set realistic, measurable targets for each subject. Targets must be agreed and signed by the student, subject teacher, parent/guardian and class teacher.",
    pageW / 2,
    y + 6,
    { align: "center" }
  );
  y += 14;

  const rowCount = input.level === "O" ? 10 : 4;
  const subs = (input.subjects || []).slice(0, rowCount);
  const filled = [...subs, ...Array(Math.max(0, rowCount - subs.length)).fill("")];

  const body = filled.map((s, i) => [String(i + 1), s, "", "", "", "", "", ""]);

  autoTable(doc, {
    startY: y,
    head: [[
      "#", "SUBJECT", "PREV. GRADE", "CURRENT MARK", "TARGET MARK",
      "TARGET GRADE", "STRATEGIES TO ACHIEVE TARGET", "TEACHER'S SIGNATURE",
    ]],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, valign: "middle", minCellHeight: input.level === "O" ? 11 : 18 },
    headStyles: { fillColor: navy, textColor: 255, fontSize: 9, halign: "center" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 25, halign: "center" },
      5: { cellWidth: 25, halign: "center" },
      6: { cellWidth: 80 },
      7: { cellWidth: 52 },
    },
    margin: { left: 10, right: 10 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const sigY = Math.min(finalY, pageH - 22);
  const sigLine = (label: string, x: number, w: number) => {
    doc.line(x, sigY, x + w, sigY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(label, x, sigY + 4);
  };
  sigLine("Student Signature / Date", 12, 60);
  sigLine("Class Teacher Signature / Date", 85, 70);
  sigLine("Parent / Guardian Signature / Date", 165, 70);
  sigLine("Principal Signature / Date", 245, 42);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Progress Christian College — LOT E Bonnyvale, Shurugwi Road  •  Tel: 2255629",
    pageW / 2,
    pageH - 6,
    { align: "center" }
  );
};

export const generateTargetsForm = async (input: TargetsFormInput) => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const logo = await loadImage(pccLogo).catch(() => "");
  renderPage(doc, logo, input);
  doc.save(`Targets-Form-${input.level}Level-${(input.studentName || "Student").replace(/\s+/g, "_")}.pdf`);
};

export const generateTargetsFormBatch = async (input: TargetsBatchInput) => {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const logo = await loadImage(pccLogo).catch(() => "");
  const students = input.students.length ? input.students : [{} as TargetsStudent];
  students.forEach((s, idx) => {
    if (idx > 0) doc.addPage("a4", "landscape");
    renderPage(doc, logo, {
      level: input.level,
      term: input.term,
      year: input.year,
      subjects: input.subjects,
      studentName: s.studentName,
      regNo: s.regNo,
      form: s.form,
      stream: s.stream,
    });
  });
  const safe = (input.className || "Class").replace(/\s+/g, "_");
  doc.save(`Targets-${input.level}Level-${safe}-${input.term || ""}-${input.year || ""}.pdf`);
};
