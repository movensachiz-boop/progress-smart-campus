import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface PrepaidReportEntry {
  date: string;
  type: "deposit" | "delivery";
  amount: number;     // for deposits
  quantity: number;   // for deliveries
  unitPrice: number;  // for deliveries
  note?: string | null;
}

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
  entries?: PrepaidReportEntry[];
  notes?: string | null;
}

const fmt = (c: string, n: number) => `${c} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generatePrepaidReport = async (rows: PrepaidReportRow[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ph = 297;
  const margin = 15;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  let y = 12;

  // Border
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pw - 16, ph - 16);

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
  doc.text("PROGRESS CHRISTIAN COLLEGE", margin + 26, y + 6);
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
  doc.text("PREPAID SUPPLIERS — DETAILED RECONCILIATION REPORT", pw / 2, y + 6, { align: "center" });
  y += 14;

  const now = new Date();
  const refNo = `PSR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Report Ref: ${refNo}`, margin, y);
  doc.text(`Generated: ${now.toLocaleString()}`, pw - margin, y, { align: "right" });
  y += 4;
  doc.text(`Accounts on file: ${rows.length}`, margin, y);

  // Grand totals by currency
  const owedTotals: Record<string, number> = {};
  const weOweTotals: Record<string, number> = {};
  const paidTotals: Record<string, number> = {};
  const deliveredTotals: Record<string, number> = {};
  for (const r of rows) {
    paidTotals[r.currency] = (paidTotals[r.currency] || 0) + r.totalPaid;
    deliveredTotals[r.currency] = (deliveredTotals[r.currency] || 0) + r.deliveredValue;
    if (r.balance > 0.001) owedTotals[r.currency] = (owedTotals[r.currency] || 0) + r.balance;
    else if (r.balance < -0.001) weOweTotals[r.currency] = (weOweTotals[r.currency] || 0) + Math.abs(r.balance);
  }
  y += 6;

  // ============= EXECUTIVE SUMMARY =============
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("EXECUTIVE SUMMARY", margin, y);
  y += 2;

  const summaryBody: string[][] = [];
  const currencies = Array.from(new Set([
    ...Object.keys(paidTotals), ...Object.keys(deliveredTotals),
    ...Object.keys(owedTotals), ...Object.keys(weOweTotals),
  ]));
  for (const c of currencies) {
    summaryBody.push([
      c,
      fmt(c, paidTotals[c] || 0),
      fmt(c, deliveredTotals[c] || 0),
      fmt(c, owedTotals[c] || 0),
      fmt(c, weOweTotals[c] || 0),
    ]);
  }
  if (summaryBody.length === 0) summaryBody.push(["—", "—", "—", "—", "—"]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["Currency", "Total Paid Upfront", "Value Delivered", "Owed by Suppliers", "We Owe Suppliers"]],
    body: summaryBody,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" }, 2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold", textColor: [140, 90, 0] },
      4: { halign: "right", fontStyle: "bold", textColor: [150, 30, 30] },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // ============= ACCOUNTS OVERVIEW =============
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("ACCOUNTS OVERVIEW", margin, y);

  const overview = rows.map((r, i) => {
    const status = r.balance > 0.001 ? `Supplier owes ${fmt(r.currency, r.balance)}`
      : r.balance < -0.001 ? `We owe ${fmt(r.currency, Math.abs(r.balance))}` : "Settled";
    const qtyOwed = r.balance > 0.001 && r.unitPrice > 0 ? `${(r.balance / r.unitPrice).toFixed(1)} ${r.unit || ""}`.trim() : "—";
    return [
      String(i + 1), r.supplier, `${r.item}${r.unit ? ` / ${r.unit}` : ""}`,
      fmt(r.currency, r.unitPrice), fmt(r.currency, r.totalPaid),
      String(r.deliveredQty), fmt(r.currency, r.deliveredValue),
      status, qtyOwed,
    ];
  });

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["#", "Supplier", "Item", "Unit Price", "Total Paid", "Qty Del.", "Delivered Value", "Status", "~Qty Owed"]],
    body: overview.length ? overview : [["—", "No accounts on file", "—", "—", "—", "—", "—", "—", "—"]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [30, 30, 30] },
    headStyles: { fillColor: blue, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    columnStyles: {
      3: { halign: "right" }, 4: { halign: "right" },
      5: { halign: "right" }, 6: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7 && rows[data.row.index]) {
        const b = rows[data.row.index].balance;
        if (b > 0.001) data.cell.styles.fillColor = [255, 243, 205];
        else if (b < -0.001) data.cell.styles.fillColor = [248, 215, 218];
        else data.cell.styles.fillColor = [212, 237, 218];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // ============= DETAILED LEDGER PER ACCOUNT =============
  rows.forEach((r, idx) => {
    const entries = (r.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const needed = 40 + entries.length * 6;
    if (y + needed > ph - 30) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...primary);
    doc.text(`#${idx + 1}. ${r.supplier} — ${r.item}${r.unit ? ` (per ${r.unit})` : ""}`, margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Agreed unit price: ${fmt(r.currency, r.unitPrice)}    •    Currency: ${r.currency}`, margin, y);
    if (r.notes) { y += 4; doc.text(`Notes: ${r.notes}`, margin, y); }
    y += 3;

    // Running balance ledger
    let runPaid = 0, runDelValue = 0, runDelQty = 0;
    const body = entries.map(e => {
      if (e.type === "deposit") {
        runPaid += e.amount;
      } else {
        runDelValue += e.quantity * e.unitPrice;
        runDelQty += e.quantity;
      }
      const bal = runPaid - runDelValue;
      return [
        e.date,
        e.type === "deposit" ? "Payment" : "Delivery",
        e.type === "deposit" ? fmt(r.currency, e.amount) : "—",
        e.type === "delivery" ? String(e.quantity) : "—",
        e.type === "delivery" ? fmt(r.currency, e.unitPrice) : "—",
        e.type === "delivery" ? fmt(r.currency, e.quantity * e.unitPrice) : "—",
        fmt(r.currency, bal),
        e.note || "",
      ];
    });

    if (body.length === 0) {
      body.push(["—", "No transactions recorded", "—", "—", "—", "—", fmt(r.currency, 0), ""]);
    }

    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [["Date", "Type", "Payment In", "Qty Recvd", "Unit Price", "Delivery Value", "Running Balance", "Note"]],
      body,
      foot: [[
        "TOTALS", "",
        fmt(r.currency, r.totalPaid),
        String(r.deliveredQty),
        "",
        fmt(r.currency, r.deliveredValue),
        fmt(r.currency, r.balance),
        r.balance > 0.001 ? `Supplier owes us` : r.balance < -0.001 ? `We owe supplier` : "Settled",
      ]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [230, 236, 245], textColor: primary, fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      columnStyles: {
        2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "right" },
      },
    });
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8;
  });

  // ============= SIGNATURES (on last page, fixed bottom area) =============
  if (y > ph - 40) { doc.addPage(); y = 30; }
  const sigY = Math.max(y + 10, ph - 35);
  doc.setDrawColor(150);
  doc.line(margin, sigY, margin + 70, sigY);
  doc.line(pw - margin - 70, sigY, pw - margin, sigY);
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Prepared by — Procurement Officer", margin, sigY + 4);
  doc.text("Approved by — Bursar / Administrator", pw - margin - 70, sigY + 4);

  // Page numbers + footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`Ref ${refNo}  •  Procurement Dept — PCC  •  Page ${p} of ${pages}`, pw / 2, ph - 6, { align: "center" });
  }

  doc.save(`prepaid-reconciliation-${now.toISOString().slice(0, 10)}.pdf`);
};
