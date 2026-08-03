import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoiceStudent {
  name: string;
  regNo: string;
  className: string;
  residency?: string | null;
  totalFees: number;
  totalPaid: number;
  items?: { label: string; amount: number }[];
}

export interface InvoiceOptions {
  termLabel: string;
  /** Optional due date text */
  dueDate?: string;
}

const NAVY: [number, number, number] = [0, 51, 102];
const GOLD: [number, number, number] = [255, 215, 0];

const TRANSPORT = 100;

interface FeePackage { label: string; day: number; boarding: number }

const PACKAGES: FeePackage[] = [
  { label: "Form 1 – 4 (General)", day: 770, boarding: 1300 },
  { label: "Form 3 & 4 Science Classes", day: 820, boarding: 1350 },
  { label: "A' Level Commercials & Arts", day: 800, boarding: 1350 },
  { label: "A' Level Sciences", day: 850, boarding: 1400 },
];

/** Pick the packages relevant to a student's class; fall back to showing all. */
const packagesFor = (className: string): FeePackage[] => {
  const c = (className || "").toLowerCase();
  const isALevel = /form\s*[56]|\b[56]\b|lower\s*6|upper\s*6/.test(c);
  const science = /scien/.test(c);
  if (isALevel) {
    return science
      ? [PACKAGES[3]]
      : /commerc|art/.test(c)
        ? [PACKAGES[2]]
        : [PACKAGES[2], PACKAGES[3]];
  }
  if (/form\s*[34]|\b[34]\b/.test(c)) {
    return science ? [PACKAGES[1]] : [PACKAGES[0], PACKAGES[1]];
  }
  if (/form\s*[12]|\b[12]\b/.test(c)) return [PACKAGES[0]];
  return PACKAGES;
};

const BANK_ROWS: [string, string][] = [
  ["Account Name", "PROGRESS CHRISTIAN COLLEGE – FEES ACCOUNT"],
  ["Fees Account No.", "5722100005910"],
  ["Uniform Account No.", "5722100006968 (USD)"],
  ["Bank", "Ecobank"],
  ["Branch", "Gweru"],
  ["Account Type", "Current Accounts"],
  ["Branch Code", "26000"],
  ["Swift Code", "ECOCZWHX"],
];

let logoCache: HTMLImageElement | null | undefined;
const loadLogo = async (): Promise<HTMLImageElement | null> => {
  if (logoCache !== undefined) return logoCache;
  try {
    const mod = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = mod.default;
    });
    logoCache = img;
  } catch {
    logoCache = null;
  }
  return logoCache;
};

const invoiceNo = (regNo: string, termLabel: string) =>
  `INV-${regNo.toUpperCase()}-${termLabel.replace(/[^0-9]/g, "") || "0000"}`;

const renderInvoice = (
  doc: jsPDF,
  s: InvoiceStudent,
  opts: InvoiceOptions,
  logo: HTMLImageElement | null
) => {
  const pw = doc.internal.pageSize.getWidth();
  

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pw, 30, "F");
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(10, 3.5, 23, 23, 3, 3, "F");
      doc.addImage(logo, "PNG", 12, 5, 20, 20);
    } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PROGRESS CHRISTIAN COLLEGE", logo ? 36 : 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Lot E Bonnyvale, Shurugwi Road  |  0773 107 774", logo ? 36 : 14, 19);
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FEES INVOICE", pw - 14, 13, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(opts.termLabel, pw - 14, 19, { align: "right" });

  let y = 40;
  doc.setTextColor(0, 0, 0);

  // Student details
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    head: [["Student Details", ""]],
    body: [
      ["Student Name", s.name],
      ["Registration Number", s.regNo],
      ["Class", s.className || "—"],
      ...(s.residency ? [["Residency", String(s.residency)]] as [string, string][] : []),
      ["Term", opts.termLabel],
      ["Invoice No.", invoiceNo(s.regNo, opts.termLabel)],
      ["Date Issued", new Date().toLocaleDateString()],
      ...(opts.dueDate ? [["Due Date", opts.dueDate]] as [string, string][] : []),
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Fee package options (returning students — admission fee not applicable)
  const pkgs = packagesFor(s.className);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.6, fontStyle: "bold" },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    head: [["Fee Package (choose one)", "Day Scholar", "Day + Transport", "Boarding"]],
    body: pkgs.map(p => [
      p.label,
      `$${p.day.toFixed(2)}`,
      `$${(p.day + TRANSPORT).toFixed(2)}`,
      `$${p.boarding.toFixed(2)}`,
    ]) as any,
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "right", cellWidth: 30 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFillColor(...GOLD);
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const noticeY = y;
  doc.roundedRect(14, noticeY, pw - 28, 10, 2, 2, "F");
  doc.text("NO CASH PAYMENTS ACCEPTED. BANK DEPOSITS & SWIPE ONLY.", pw / 2, noticeY + 6.5, { align: "center" });
  y = noticeY + 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Transport is optional for day scholars at $${TRANSPORT.toFixed(2)} per term. Boarding fees are inclusive of accommodation and meals. No admission fee is charged for continuing students.`,
    14, y, { maxWidth: pw - 28 }
  );
  y += 8;
  doc.setTextColor(0, 0, 0);


  // Banking details
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    head: [["Banking Details", ""]],
    body: BANK_ROWS as any,
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(
    "Please use the student's registration number as the deposit reference and submit proof of payment to the Bursar's office.",
    14,
    y,
    { maxWidth: pw - 28 }
  );

  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(14, ph - 18, pw - 14, ph - 18);
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Progress Christian College · Computer generated invoice", 14, ph - 12);
  doc.text(opts.termLabel, pw - 14, ph - 12, { align: "right" });
};

/** Single student invoice download. */
export const generateStudentInvoice = async (s: InvoiceStudent, opts: InvoiceOptions) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  renderInvoice(doc, s, opts, logo);
  doc.save(`Invoice_${s.regNo}_${opts.termLabel.replace(/\s+/g, "_")}.pdf`);
};

/** Bulk: one A4 invoice page per student in a single PDF. */
export const generateBulkInvoices = async (students: InvoiceStudent[], opts: InvoiceOptions) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  students.forEach((s, i) => {
    if (i > 0) doc.addPage();
    renderInvoice(doc, s, opts, logo);
  });
  doc.save(`Invoices_${opts.termLabel.replace(/\s+/g, "_")}.pdf`);
};

/** Bulk: a separate PDF file per student (sequential downloads). */
export const generateSeparateInvoices = async (students: InvoiceStudent[], opts: InvoiceOptions) => {
  const logo = await loadLogo();
  for (const s of students) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    renderInvoice(doc, s, opts, logo);
    doc.save(`Invoice_${s.regNo}_${opts.termLabel.replace(/\s+/g, "_")}.pdf`);
    await new Promise(r => setTimeout(r, 350));
  }
};
