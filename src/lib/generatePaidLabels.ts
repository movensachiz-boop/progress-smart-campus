import { jsPDF } from "jspdf";

export interface PaidStudent {
  name: string;
  regNo: string;
  studentClass: string;
  amount: number;
  date: string;
}

// Label size: 50mm wide x 40mm tall (standard sticker label).
// (User mentioned "50cm x 40cm" — interpreted as mm for printable labels.)
const LABEL_W = 50;
const LABEL_H = 40;

export const generatePaidLabels = (students: PaidStudent[]) => {
  // A4 page: 210 x 297 mm. Grid of labels with small gutter.
  const pageW = 210;
  const pageH = 297;
  const marginX = 5;
  const marginY = 8;
  const gapX = 2;
  const gapY = 2;
  const cols = Math.floor((pageW - 2 * marginX + gapX) / (LABEL_W + gapX)); // 4
  const rows = Math.floor((pageH - 2 * marginY + gapY) / (LABEL_H + gapY)); // 7
  const perPage = cols * rows;

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const navy: [number, number, number] = [0, 51, 102];
  const gold: [number, number, number] = [196, 164, 105];
  const red: [number, number, number] = [200, 30, 30];

  students.forEach((s, i) => {
    const onPage = i % perPage;
    if (i > 0 && onPage === 0) doc.addPage();
    const col = onPage % cols;
    const row = Math.floor(onPage / cols);
    const x = marginX + col * (LABEL_W + gapX);
    const y = marginY + row * (LABEL_H + gapY);

    // Border
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, LABEL_W, LABEL_H, 2, 2, "S");

    // Top band
    doc.setFillColor(...navy);
    doc.rect(x, y, LABEL_W, 7, "F");
    doc.setFillColor(...gold);
    doc.rect(x, y + 7, LABEL_W, 0.6, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("PROGRESS CHRISTIAN CENTRE", x + LABEL_W / 2, y + 4.5, { align: "center" });

    // Name
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const nameLines = doc.splitTextToSize(s.name, LABEL_W - 6);
    doc.text(nameLines.slice(0, 2), x + LABEL_W / 2, y + 13, { align: "center" });

    // Reg & class
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(`Reg: ${s.regNo}`, x + LABEL_W / 2, y + 20, { align: "center" });
    doc.text(`Class: ${s.studentClass}`, x + LABEL_W / 2, y + 23.5, { align: "center" });

    // PAID stamp (rotated, red outlined)
    doc.saveGraphicsState();
    doc.setDrawColor(...red);
    doc.setTextColor(...red);
    doc.setLineWidth(0.8);
    const stampX = x + LABEL_W / 2;
    const stampY = y + 32;
    // outer rect
    doc.roundedRect(stampX - 14, stampY - 5, 28, 9, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PAID", stampX, stampY + 1.5, { align: "center" });
    doc.restoreGraphicsState();

    // Amount tiny under stamp
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text(`$${s.amount.toFixed(2)} • ${s.date}`, x + LABEL_W / 2, y + 38, { align: "center" });
  });

  doc.save(`Paid_Labels_${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const generatePaidStudentsList = (students: PaidStudent[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const navy: [number, number, number] = [0, 51, 102];
  const gold: [number, number, number] = [196, 164, 105];

  // Header
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 22, pageW, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("PROGRESS CHRISTIAN CENTRE", pageW / 2, 10, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text("STUDENTS WHO PAID FEES", pageW / 2, 17, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Total Students: ${students.length}`, pageW - 14, 30, { align: "right" });

  // Table headers
  let y = 38;
  const drawHeader = () => {
    doc.setFillColor(230, 235, 245);
    doc.rect(10, y - 4, pageW - 20, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text("#", 13, y);
    doc.text("Full Name", 22, y);
    doc.text("Reg No.", 95, y);
    doc.text("Class", 125, y);
    doc.text("Amount", 160, y);
    doc.text("Date", 182, y);
    y += 6;
  };
  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  const total = students.reduce((s, x) => s + x.amount, 0);

  students.forEach((s, i) => {
    if (y > 278) {
      doc.addPage();
      y = 20;
      drawHeader();
    }
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(10, y - 4, pageW - 20, 6, "F");
    }
    doc.setTextColor(30, 30, 30);
    doc.text(String(i + 1), 13, y);
    doc.text(s.name.slice(0, 38), 22, y);
    doc.text(s.regNo, 95, y);
    doc.text(s.studentClass.slice(0, 18), 125, y);
    doc.text(`$${s.amount.toFixed(2)}`, 160, y);
    doc.text(s.date, 182, y);
    y += 6;
  });

  // Total
  y += 4;
  if (y > 280) { doc.addPage(); y = 20; }
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.4);
  doc.line(10, y - 2, pageW - 10, y - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(`TOTAL COLLECTED: $${total.toFixed(2)}`, pageW - 14, y + 4, { align: "right" });

  doc.save(`Paid_Students_List_${new Date().toISOString().slice(0, 10)}.pdf`);
};
