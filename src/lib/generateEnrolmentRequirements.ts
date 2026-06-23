import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface EnrolmentOptions {
  year?: string | number;
}

const FEES = [
  { class: "Form 1-4", day: "$770.00 + $60 Transport", boarding: "$1300.00" },
  { class: "Form 3 and 4 Science Classes", day: "$820.00 + $60 Transport", boarding: "$1350.00" },
  { class: "A' Level Commercials & Arts", day: "$800.00 + $60 Transport", boarding: "$1350.00" },
  { class: "A' Level Sciences", day: "$850.00 + $60 Transport", boarding: "$1400.00" },
];

const UNIFORMS = [
  ["White short sleeved blouse", 2, 15, 30],
  ["White long sleeved blouse", 2, 20, 40],
  ["Black Slack (Barathea)", 1, 20, 20],
  ["Pinafore Dress", 2, 25, 50],
  ["Black Pleated Skirt (Form 3 & 4)", 2, 25, 50],
  ["Blazer", 1, 50, 50],
  ["Black Jersey", 1, 25, 25],
  ["Black Cardigan", 1, 20, 20],
  ["Anorak", 1, 60, 60],
  ["Tracksuit", 2, 50, 100],
  ["Chiffon Form 1 & 2", 1, 5, 5],
  ["School Tie", 1, 7, 7],
  ["Boxer shorts (Sports)", 1, 10, 10],
  ["Sports T. Shirt", 1, 10, 10],
  ["Sunhat", 1, 10, 10],
  ["Report book", 1, 8, 8],
  ["Labcoat (Sciences)", 1, 20, 20],
  ["Basher hat", 1, 25, 25],
  ["Satchel", 1, 25, 25],
  ["White Socks", 5, 1, 5],
  ["School Cap", 1, 5, 5],
  ["Golf T. Shirt", 1, 10, 10],
  ["School ID", 1, 10, 10],
] as const;

export const generateEnrolmentRequirements = async (opts: EnrolmentOptions = {}) => {
  const year = String(opts.year || new Date().getFullYear());
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Logo
  let logoH = 0;
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    const logoW = 22;
    logoH = 22;
    doc.addImage(img, "PNG", pageW / 2 - logoW / 2, 8, logoW, logoH);
  } catch {}

  // Letterhead
  const headerY = logoH > 0 ? 32 : 8;
  doc.setFillColor(0, 51, 102);
  doc.rect(0, headerY, pageW, 22, "F");
  doc.setTextColor(255, 215, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, headerY + 8, { align: "center" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Bonnyvale Campus, Gweru  |  +263 77 400 0143", pageW / 2, headerY + 14, { align: "center" });
  doc.setTextColor(255, 215, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`ENROLMENT REQUIREMENTS — ${year}`, pageW / 2, headerY + 20, { align: "center" });

  let y = headerY + 30;

  // Title
  doc.setTextColor(0, 51, 102);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Progress Christian College Enrolment Requirements for Bonnyvale Campus`, margin, y);
  y += 5;

  // Fees table
  autoTable(doc, {
    startY: y,
    head: [["Class", "Day Scholar", "Boarding Fee"]],
    body: FEES.map(f => [f.class, f.day, f.boarding]),
    theme: "grid",
    headStyles: { fillColor: [0, 51, 102], textColor: [255, 215, 0], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Uniforms heading
  doc.setTextColor(0, 51, 102);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Uniform Requirements for Form 1 – 4 Girls", margin, y);
  y += 3;

  const totalPrice = UNIFORMS.reduce((s, r) => s + (r[3] as number), 0);

  autoTable(doc, {
    startY: y,
    head: [["Uniform", "Quantity", "Price / item", "Total Price"]],
    body: [
      ...UNIFORMS.map(r => [r[0], String(r[1]), `$${(r[2] as number).toFixed(2)}`, `$${(r[3] as number).toFixed(2)}`]),
      [{ content: "Total", styles: { fontStyle: "bold", halign: "right" } as any }, "", "", { content: `$${totalPrice.toFixed(2)}`, styles: { fontStyle: "bold" } as any }],
    ],
    theme: "grid",
    headStyles: { fillColor: [0, 51, 102], textColor: [255, 215, 0], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: {
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "right", cellWidth: 28 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total uniforms for Form 1 & 2 Girls: $525.00", margin, y);
  y += 5;
  doc.text("Total uniforms for Form 3 & 4 Girls: $540.00", margin, y);
  y += 8;

  // Footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Progress Christian College — Bonnyvale Campus  |  Enrolment Requirements ${year}`,
    pageW / 2,
    pageH - 8,
    { align: "center" },
  );

  doc.save(`Enrolment_Requirements_${year}.pdf`);
};
