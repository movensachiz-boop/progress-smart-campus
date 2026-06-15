import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import pccLogo from "@/assets/pcc-logo.png";

export interface TargetsStudent {
  studentName?: string;
  regNo?: string;
  form?: string;
  stream?: string;
  subjects?: string[]; // per-student subject override
}

export interface TargetsFormInput extends TargetsStudent {
  term?: string;
  year?: string;
  level: "O" | "A";
}

export interface TargetsBatchInput {
  level: "O" | "A";
  term?: string;
  year?: string;
  students: TargetsStudent[];
  className?: string;
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
  const black: [number, number, number] = [0, 0, 0];
  const gray: [number, number, number] = [80, 80, 80];
  const pageW = 297;
  const pageH = 210;

  doc.setFillColor(...black);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(...gray);
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
  doc.setTextColor(255, 255, 255);
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
    doc.setFontSize(10);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lw = doc.getTextWidth(label);
    doc.line(x + lw + 2, y + 0.8, x + w, y + 0.8);
    if (val) doc.text(val, x + lw + 4, y);
  };
  // Top header row: NAME | LEVEL | YEAR
  labelVal("NAME:", input.studentName || "", 10, 130);
  labelVal("LEVEL:", `${input.level} Level ${input.form || ""} ${input.stream || ""}`.trim(), 140, 220);
  labelVal("YEAR:", `${input.term ? input.term + " / " : ""}${input.year || new Date().getFullYear()}`, 230, 287);
  y += 6;
  if (input.regNo) {
    labelVal("REG NO:", input.regNo, 10, 130);
    y += 6;
  }
  y += 2;

  const rowCount = input.level === "O" ? 10 : 4;
  const subs = (input.subjects || []).slice(0, rowCount);
  const filled = [...subs, ...Array(Math.max(0, rowCount - subs.length)).fill("")];

  const body = filled.map((s) => [s, "", "", "", "", "", "", ""]);

  autoTable(doc, {
    startY: y,
    head: [[
      "SUBJECT", "INITIAL TARGET", "RESULT %", "VARIANCE",
      "MID TERM TARGET", "RESULT", "VARIANCE", "COMMENTS",
    ]],
    body,
    theme: "grid",
    styles: { fontSize: 9.5, cellPadding: 3, valign: "middle", minCellHeight: input.level === "O" ? 12 : 22, lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { fillColor: black, textColor: 255, fontSize: 9, halign: "center" },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 22, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
      6: { cellWidth: 22, halign: "center" },
      7: { cellWidth: 97 },
    },
    margin: { left: 10, right: 10 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const sigY = Math.min(finalY, pageH - 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Student's Signature:", 12, sigY);
  doc.line(58, sigY + 0.8, 160, sigY + 0.8);
  doc.text("Principal's Signature:", 170, sigY);
  doc.line(218, sigY + 0.8, 287, sigY + 0.8);

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
      subjects: s.subjects,
      studentName: s.studentName,
      regNo: s.regNo,
      form: s.form,
      stream: s.stream,
    });
  });
  const safe = (input.className || "Class").replace(/\s+/g, "_");
  doc.save(`Targets-${input.level}Level-${safe}-${input.term || ""}-${input.year || ""}.pdf`);
};
