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

export const generatePrepaidReport = async (rows: PrepaidReportRow[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 15;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  let y = 12;

  // Border
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pw - 16, 297 - 16);

  // Logo
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    doc.addImage(img, "PNG", margin, y, 22, 22);
  } catch {}

  // Letterhead
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text("PROGRESS CHRISTIAN CENTRE", margin + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("11729 Mkoba 14, Gweru, Zimbabwe", margin + 26, y + 11);
  doc.text("Tel: +263 77 400 0143  |  www.progresscentresys.com", margin + 26, y + 15);
  doc.text("Email: info@progresscentresys.com", margin + 26, y + 19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.setFontSize(9);
  doc.text("PROCUREMENT DEPARTMENT", margin + 26, y + 24);

  y += 30;

  // Title bar
  doc.setFillColor(...blue);
  doc.rect(margin, y, pw - 2 * margin, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("PREPAID SUPPLIERS — OUTSTANDING BALANCES REPORT", pw / 2, y + 6, { align: "center" });
  y += 14;

  // Meta
  const now = new Date();
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Generated: ${now.toLocaleString()}`, margin, y);
  doc.text(`Accounts on file: ${rows.length}`, pw - margin, y, { align: "right" });
  y += 5;

  // Build body — include ALL accounts, mark settled/we-owe/owed-to-us
  const body = rows.map(r => {
    const status =
      r.balance > 0.001 ? `Supplier owes` :
      r.balance < -0.001 ? `We owe` : `Settled`;
    const qtyOwed = r.balance > 0.001 && r.unitPrice > 0 ? `${(r.balance / r.unitPrice).toFixed(1)} ${r.unit || ""}`.trim() : "—";
    return [
      r.supplier,
      `${r.item}${r.unit ? ` / ${r.unit}` : ""}`,
      `${r.currency} ${r.unitPrice.toFixed(2)}`,
      `${r.currency} ${r.totalPaid.toFixed(2)}`,
      `${r.deliveredQty}`,
      `${r.currency} ${r.deliveredValue.toFixed(2)}`,
      `${status}\n${r.currency} ${Math.abs(r.balance).toFixed(2)}`,
      qtyOwed,
    ];
  });

  if (body.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text("No prepaid supplier accounts have been recorded yet.", margin, y + 10);
  } else {
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [["Supplier", "Item", "Unit Price", "Total Paid", "Qty Delivered", "Delivered Value", "Balance", "~Qty Owed"]],
      body,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, textColor: [30, 30, 30], lineColor: [210, 210, 210] },
      headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const row = rows[data.row.index];
          if (row.balance > 0.001) data.cell.styles.fillColor = [255, 243, 205];
          else if (row.balance < -0.001) data.cell.styles.fillColor = [248, 215, 218];
          else data.cell.styles.fillColor = [212, 237, 218];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8;

    // Totals by currency
    const owedTotals: Record<string, number> = {};
    const weOweTotals: Record<string, number> = {};
    for (const r of rows) {
      if (r.balance > 0.001) owedTotals[r.currency] = (owedTotals[r.currency] || 0) + r.balance;
      else if (r.balance < -0.001) weOweTotals[r.currency] = (weOweTotals[r.currency] || 0) + Math.abs(r.balance);
    }

    const summary: string[][] = [];
    summary.push(["Summary", "Amount"]);
    if (Object.keys(owedTotals).length === 0 && Object.keys(weOweTotals).length === 0) {
      summary.push(["All accounts settled", "—"]);
    } else {
      for (const [c, a] of Object.entries(owedTotals)) summary.push([`Total owed by suppliers (${c})`, `${c} ${a.toFixed(2)}`]);
      for (const [c, a] of Object.entries(weOweTotals)) summary.push([`Total we owe suppliers (${c})`, `${c} ${a.toFixed(2)}`]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: pw / 2, right: margin },
      head: [summary[0]],
      body: summary.slice(1),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: blue, textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 14;
  }

  // Signatures
  const sigY = 250;
  doc.setDrawColor(150);
  doc.line(margin, sigY, margin + 70, sigY);
  doc.line(pw - margin - 70, sigY, pw - margin, sigY);
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Prepared by — Procurement Officer", margin, sigY + 4);
  doc.text("Approved by — Bursar / Administrator", pw - margin - 70, sigY + 4);

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text("This document is generated by the PCC Procurement System.", pw / 2, 285, { align: "center" });

  doc.save(`prepaid-balances-${now.toISOString().slice(0, 10)}.pdf`);
};
