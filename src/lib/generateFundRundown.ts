import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface FundExpenseRow {
  description: string;
  category?: string | null;
  amount: number;
  spent_at: string;
}

export interface FundRundownData {
  source: string;
  reference?: string | null;
  amount: number;
  currency?: string;
  received_at: string;
  note?: string | null;
  expenses: FundExpenseRow[];
}

export const generateFundRundown = async (data: FundRundownData) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 15;
  const primary: [number, number, number] = [0, 51, 102];
  const gold: [number, number, number] = [255, 215, 0];
  const currency = data.currency || "USD";
  let y = 14;

  doc.setDrawColor(...primary);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pw - 16, 297 - 16);

  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    doc.addImage(img, "PNG", margin, y, 18, 18);
  } catch { /* ignore */ }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...primary);
  doc.text("PROGRESS CHRISTIAN CENTRE", margin + 22, y + 7);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Fund Rundown — Money Received & How It Was Used", margin + 22, y + 13);
  y += 24;

  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // Summary box
  const totalSpent = data.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const balance = Number(data.amount) - totalSpent;

  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const meta = [
    [`Source:`, data.source],
    [`Reference:`, data.reference || "—"],
    [`Received:`, new Date(data.received_at).toLocaleString()],
    [`Note:`, data.note || "—"],
  ];
  meta.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold"); doc.text(k, margin, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v), margin + 28, y);
    y += 5;
  });

  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["#", "Date", "Description", "Category", `Amount (${currency})`]],
    body: data.expenses.length
      ? data.expenses.map((e, i) => [
          String(i + 1),
          new Date(e.spent_at).toLocaleDateString(),
          e.description,
          e.category || "—",
          Number(e.amount).toFixed(2),
        ])
      : [["—", "—", "No expenses recorded yet", "—", "0.00"]],
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: margin, right: margin },
  });

  // @ts-ignore
  let endY = (doc as any).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text(`Received:  ${currency} ${Number(data.amount).toFixed(2)}`, margin, endY); endY += 6;
  doc.text(`Spent:     ${currency} ${totalSpent.toFixed(2)}`, margin, endY); endY += 6;
  doc.setTextColor(balance < 0 ? 200 : 0, balance < 0 ? 0 : 102, 0);
  doc.text(`Balance:   ${currency} ${balance.toFixed(2)}`, margin, endY);

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.setFont("helvetica", "italic");
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, 285);

  doc.save(`Fund-Rundown-${data.source.replace(/\s+/g, "_")}-${Date.now()}.pdf`);
};
