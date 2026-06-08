import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface PrepaidReportRow {
  supplier: string;
  item: string;
  unit?: string | null;
  currency: string;
  unitPrice: number;
  totalPaid: number;
  deliveredQty: number;
  deliveredValue: number;
  balance: number; // positive = supplier owes us
}

export const generatePrepaidReport = (rows: PrepaidReportRow[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const date = new Date().toLocaleString();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Prepaid Suppliers — Outstanding Balances", 15, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${date}`, 15, 25);

  const owed = rows.filter(r => r.balance > 0.001);
  const totalsByCurrency: Record<string, number> = {};
  for (const r of owed) totalsByCurrency[r.currency] = (totalsByCurrency[r.currency] || 0) + r.balance;

  autoTable(doc, {
    startY: 32,
    head: [["Supplier", "Item", "Unit Price", "Paid", "Delivered Qty", "Delivered Value", "Balance Owed", "~Qty Owed"]],
    body: owed.map(r => {
      const qtyOwed = r.unitPrice > 0 ? (r.balance / r.unitPrice).toFixed(1) : "-";
      return [
        r.supplier,
        `${r.item}${r.unit ? ` / ${r.unit}` : ""}`,
        `${r.currency} ${r.unitPrice.toFixed(2)}`,
        `${r.currency} ${r.totalPaid.toFixed(2)}`,
        String(r.deliveredQty),
        `${r.currency} ${r.deliveredValue.toFixed(2)}`,
        `${r.currency} ${r.balance.toFixed(2)}`,
        `${qtyOwed} ${r.unit || ""}`.trim(),
      ];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 51, 102] },
  });

  let y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.text("Totals owed by suppliers:", 15, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  if (Object.keys(totalsByCurrency).length === 0) {
    doc.text("All accounts settled.", 15, y);
  } else {
    for (const [cur, amt] of Object.entries(totalsByCurrency)) {
      doc.text(`${cur} ${amt.toFixed(2)}`, 15, y);
      y += 5;
    }
  }

  doc.save(`prepaid-balances-${new Date().toISOString().slice(0, 10)}.pdf`);
};
