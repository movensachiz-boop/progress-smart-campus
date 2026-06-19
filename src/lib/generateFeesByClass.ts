import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface FeesByClassEntry {
  className: string;
  paid: { name: string; regNo: string; amount: number; expected: number; balance: number }[];
  unpaid: { name: string; regNo: string; paid: number; expected: number; balance: number }[];
}

export const generateFeesByClassPDF = (groups: FeesByClassEntry[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const navy: [number, number, number] = [0, 51, 102];

  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Fees Status by Class", 14, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleString(), 196, 12, { align: "right" });

  let y = 26;
  doc.setTextColor(0, 0, 0);

  // ── Grand totals across all classes ──
  let grandExpected = 0;
  let grandCollected = 0;
  let grandOwing = 0;
  let grandStudents = 0;
  let grandPaidCount = 0;
  groups.forEach((g) => {
    grandExpected += [...g.paid, ...g.unpaid].reduce((s, x) => s + (x.expected || 0), 0);
    grandCollected += g.paid.reduce((s, x) => s + (x.amount || 0), 0) + g.unpaid.reduce((s, x) => s + (x.paid || 0), 0);
    grandOwing += g.unpaid.reduce((s, x) => s + (x.balance || 0), 0);
    grandStudents += g.paid.length + g.unpaid.length;
    grandPaidCount += g.paid.length;
  });
  const grandPct = grandStudents ? Math.round((grandPaidCount / grandStudents) * 100) : 0;

  doc.setFillColor(...navy);
  doc.rect(10, y - 5, 190, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SCHOOL-WIDE TOTALS", 12, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Students: ${grandStudents}  •  Fully Paid: ${grandPaidCount} (${grandPct}%)`,
    12,
    y + 5
  );
  doc.text(
    `Total Expected: $${grandExpected.toFixed(2)}  •  Total Collected: $${grandCollected.toFixed(2)}  •  Total Owing to Date: $${grandOwing.toFixed(2)}`,
    12,
    y + 10
  );
  doc.setTextColor(0, 0, 0);
  y += 22;


  groups.forEach((g) => {
    const total = g.paid.length + g.unpaid.length;
    const pct = total ? Math.round((g.paid.length / total) * 100) : 0;
    const totalExpected = [...g.paid, ...g.unpaid].reduce((s, x) => s + (x.expected || 0), 0);
    const totalCollected = g.paid.reduce((s, x) => s + (x.amount || 0), 0) + g.unpaid.reduce((s, x) => s + (x.paid || 0), 0);
    const totalOutstanding = g.unpaid.reduce((s, x) => s + (x.balance || 0), 0);

    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFillColor(240, 240, 245);
    doc.rect(10, y - 5, 190, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text(g.className, 12, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(
      `Students: ${total}  •  Fully Paid: ${g.paid.length} (${pct}%)  •  Outstanding: ${g.unpaid.length}  •  Expected: $${totalExpected.toFixed(2)}  •  Collected: $${totalCollected.toFixed(2)}  •  Owing: $${totalOutstanding.toFixed(2)}`,
      198,
      y,
      { align: "right" }
    );
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["#", "FULLY PAID — Name", "Reg No.", "Expected ($)", "Paid ($)"]],
      body: g.paid.length
        ? g.paid.map((s, i) => [i + 1, s.name, s.regNo, s.expected.toFixed(2), s.amount.toFixed(2)])
        : [["—", "No fully paid students", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: [34, 139, 87], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 10, right: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    autoTable(doc, {
      startY: y,
      head: [["#", "OUTSTANDING — Name", "Reg No.", "Expected ($)", "Paid ($)", "Balance ($)"]],
      body: g.unpaid.length
        ? g.unpaid.map((s, i) => [i + 1, s.name, s.regNo, s.expected.toFixed(2), s.paid.toFixed(2), s.balance.toFixed(2)])
        : [["—", "All students fully paid", "", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: [180, 40, 40], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 10, right: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  });

  doc.save(`fees-by-class-${new Date().toISOString().slice(0, 10)}.pdf`);
};
