import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface EnrolmentOptions {
  year?: string | number;
}

const FEES = [
  { class: "Admission Fee", day: "$50.00", boarding: "$50.00" },
  { class: "Form 1-4", day: "$770.00 + $100 Transport", boarding: "$1300.00" },
  { class: "Form 3 and 4 Science Classes", day: "$820.00 + $100 Transport", boarding: "$1350.00" },
  { class: "A' Level Commercials & Arts", day: "$800.00 + $100 Transport", boarding: "$1350.00" },
  { class: "A' Level Sciences", day: "$850.00 + $100 Transport", boarding: "$1400.00" },
];

const GIRLS_UNIFORMS: Array<[string, number | "", number, number]> = [
  ["White short sleeved blouse", 2, 15, 30],
  ["White long sleeved blouse", 2, 20, 40],
  ["Black Slack (Barathea)", 2, 20, 40],
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
  ["Labcoat", 1, 20, 20],
  ["Worksuit", 1, 20, 20],
  ["Basher hat", 1, 25, 25],
  ["Satchel", 1, 25, 25],
  ["White Socks", 5, 1, 5],
  ["School Cap", 1, 5, 5],
  ["Golf T. Shirt", 1, 10, 10],
  ["School ID", 1, 10, 10],
  ["Wool hat & Scarf", "", 6, 6],
];

const BOYS_UNIFORMS: Array<[string, number | "", number, number]> = [
  ["White short sleeved shirt", 2, 15, 30],
  ["White long sleeved shirt", 2, 20, 40],
  ["Black Trouser", 2, 20, 40],
  ["Plain Black Tie", 1, 7, 7],
  ["Blazer", 1, 50, 50],
  ["Black Jersey", 1, 25, 25],
  ["Black Cardigan", 1, 20, 20],
  ["Anorak", 1, 60, 60],
  ["Tracksuit", 2, 50, 100],
  ["Boxer shorts (Sports)", 1, 10, 10],
  ["Sports T. Shirt", 1, 10, 10],
  ["Sunhat", 1, 10, 10],
  ["Report Book", 1, 8, 8],
  ["Labcoat", 1, 20, 20],
  ["Worksuit", 1, 20, 20],
  ["Satchel", 1, 25, 25],
  ["Grey Socks", 5, 1, 5],
  ["School Cap", 1, 5, 5],
  ["Golf T. Shirt", 1, 10, 10],
  ["School ID", 1, 10, 10],
  ["Wool hat & Scarf", "", 6, 6],
];

const ADDITIONAL: Array<[string, string, string, string]> = [
  ["Bed Cover", "1", "$20.00", "$20.00"],
  ["Sheets", "2", "$15.00", "$30.00"],
  ["Mattress Protector", "1", "$10.00", "$10.00"],
  ["Stationery", "", "", "$55.00"],
  ["Coverpages", "", "", "$5.00"],
  ["Storage Box", "", "", ""],
  ["Plate, Cup & Cutlery", "", "", ""],
  ["Water Bottle", "", "", ""],
  ["Laptop", "", "", ""],
];

const STATIONERY: Array<[string, string, string]> = [
  ["Counter books 2 Quire", "12", "12"],
  ["72 Paged Exercise books", "35", "35"],
  ["Mathematical Set", "1", "1"],
  ["Bond paper", "1", "1"],
  ["Calculator", "", "1"],
  ["Flat file", "13", "1"],
];

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

  const renderUniformTable = (
    heading: string,
    rows: Array<[string, number | "", number, number]>,
  ) => {
    doc.setTextColor(0, 51, 102);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(heading, margin, y);
    y += 3;

    const total = rows.reduce((s, r) => s + (r[3] as number), 0);

    autoTable(doc, {
      startY: y,
      head: [["Uniform", "Quantity", "Price / item", "Total Price"]],
      body: [
        ...rows.map(r => [
          r[0],
          r[1] === "" ? "" : String(r[1]),
          `$${(r[2] as number).toFixed(2)}`,
          `$${(r[3] as number).toFixed(2)}`,
        ]),
        [
          { content: "Total", styles: { fontStyle: "bold", halign: "right" } as any },
          "",
          "",
          { content: `$${total.toFixed(2)}`, styles: { fontStyle: "bold" } as any },
        ],
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
  };

  // Girls
  renderUniformTable("Uniform Requirements for Form 1 – 4 Girls", GIRLS_UNIFORMS);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total uniforms for Form 1 & 2 Girls: $591.00", margin, y);
  y += 5;
  doc.text("Total uniforms for Form 3 & 4 Girls: $586.00", margin, y);
  y += 8;

  // New page for boys if needed
  if (y > pageH - 80) {
    doc.addPage();
    y = 20;
  }

  // Boys
  renderUniformTable("Uniform Requirements for Form 1 – 4 Boys", BOYS_UNIFORMS);

  // Additional Requirements
  if (y > pageH - 80) {
    doc.addPage();
    y = 20;
  }
  doc.setTextColor(0, 51, 102);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Additional Requirements", margin, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Item", "Quantity", "Price / item", "Total"]],
    body: ADDITIONAL,
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

  // Stationery
  if (y > pageH - 60) {
    doc.addPage();
    y = 20;
  }
  doc.setTextColor(0, 51, 102);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Stationery Requirements for Form 1 – 4", margin, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Item", "Form 1 & 2 Quantity", "Form 3 & 4 Quantity"]],
    body: STATIONERY,
    theme: "grid",
    headStyles: { fillColor: [0, 51, 102], textColor: [255, 215, 0], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "center" },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

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
