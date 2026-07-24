import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface SpendingItem {
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
}

export interface SpendingPO {
  po_number: string;
  created_at: string;
  supplier_name?: string;
  currency: string;
  total_amount: number;
  items: SpendingItem[];
}

export interface SpendingGRN {
  grn_number: string;
  purchase_order_id?: string;
  received_date?: string;
  received_by?: string;
  currency?: string;
  items: SpendingItem[];
}

export interface SpendingVoucher {
  voucher_number: string;
  purchase_order_id?: string;
  paid_to: string;
  paid_by: string;
  received_by: string;
  amount: number;
  currency: string;
  method: string;
  payment_date?: string;
}

const blue: [number, number, number] = [41, 128, 185];
const primary: [number, number, number] = [0, 51, 102];

const header = async (doc: jsPDF, title: string, subtitle: string) => {
  const pw = 210;
  const margin = 15;
  let y = 12;
  doc.setDrawColor(...blue);
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
    doc.addImage(img, "PNG", margin, y, 22, 22);
  } catch {}
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text("PROGRESS CHRISTIAN COLLEGE", margin + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("Procurement Spending Report — Finance Director", margin + 26, y + 11);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin + 26, y + 15);
  y += 26;
  doc.setFillColor(...blue);
  doc.rect(margin, y, pw - 2 * margin, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pw / 2, y + 6, { align: "center" });
  y += 13;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text(subtitle, pw / 2, y, { align: "center" });
    y += 5;
  }
  return y + 2;
};

const itemsTotal = (items: SpendingItem[]) =>
  items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

export const generatePOSpendingReport = async (
  po: SpendingPO,
  grns: SpendingGRN[],
  vouchers: SpendingVoucher[]
) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 15;
  const currency = po.currency || "USD";

  let y = await header(doc, "FUND USAGE — PURCHASE ORDER", `${po.po_number} • ${po.supplier_name || "—"}`);

  const poTotal = Number(po.total_amount) || itemsTotal(po.items || []);
  const paid = vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const variance = paid - poTotal;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ["PO Number", po.po_number, "Date", new Date(po.created_at).toLocaleDateString()],
      ["Supplier", po.supplier_name || "—", "Currency", currency],
      ["PO Total (Budgeted)", `${currency} ${poTotal.toFixed(2)}`, "Total Paid Out", `${currency} ${paid.toFixed(2)}`],
      ["Variance (Paid − PO)", `${currency} ${variance.toFixed(2)}`, "Vouchers Issued", String(vouchers.length)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [210, 210, 210] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 40 },
      2: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 40 },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // Items
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Items Purchased", margin, y);
  y += 2;
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["#", "Description", "Qty", "Unit", "Unit Price", "Total"]],
    body: (po.items || []).map((it, i) => [
      String(i + 1),
      it.description || "",
      String(it.quantity ?? ""),
      it.unit || "—",
      `${currency} ${Number(it.unit_price || 0).toFixed(2)}`,
      `${currency} ${((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toFixed(2)}`,
    ]),
    foot: [[
      { content: "PO TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      { content: `${currency} ${poTotal.toFixed(2)}`, styles: { fontStyle: "bold" } },
    ]],
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9.5 },
    bodyStyles: { fontSize: 9, cellPadding: 2.2 },
    footStyles: { fillColor: [240, 245, 250], textColor: [...primary] },
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: "right", cellWidth: 14 },
      3: { cellWidth: 18 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 30 },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // Payment vouchers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Money Paid Out (Payment Vouchers)", margin, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["Voucher #", "Date", "Paid To", "Method", "Paid By", "Received By", "Amount"]],
    body: vouchers.length
      ? vouchers.map((v) => [
          v.voucher_number,
          v.payment_date ? new Date(v.payment_date).toLocaleDateString() : "—",
          v.paid_to,
          (v.method || "cash").toUpperCase(),
          v.paid_by,
          v.received_by,
          `${v.currency} ${Number(v.amount).toFixed(2)}`,
        ])
      : [["—", "—", "No payment vouchers recorded", "—", "—", "—", "—"]],
    foot: [[
      { content: "TOTAL PAID", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } },
      { content: `${currency} ${paid.toFixed(2)}`, styles: { fontStyle: "bold" } },
    ]],
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2 },
    footStyles: { fillColor: [240, 245, 250], textColor: [...primary] },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // Goods received
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Goods Received", margin, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["GRN #", "Date", "Received By", "Items", "Value"]],
    body: grns.length
      ? grns.map((g) => [
          g.grn_number,
          g.received_date ? new Date(g.received_date).toLocaleDateString() : "—",
          g.received_by || "—",
          String((g.items || []).length),
          `${g.currency || currency} ${itemsTotal(g.items || []).toFixed(2)}`,
        ])
      : [["—", "—", "No goods received recorded yet", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2 },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // Summary box
  doc.setFillColor(240, 245, 250);
  doc.rect(margin, y, pw - 2 * margin, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Summary for Finance Director", margin + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(`Budgeted (PO Total): ${currency} ${poTotal.toFixed(2)}`, margin + 3, y + 11);
  doc.text(`Disbursed (Vouchers): ${currency} ${paid.toFixed(2)}`, margin + 3, y + 16);
  doc.text(
    `Variance: ${currency} ${variance.toFixed(2)} ${variance === 0 ? "(balanced)" : variance > 0 ? "(overpaid)" : "(underpaid)"}`,
    pw - margin - 3, y + 11, { align: "right" }
  );
  doc.text(`Goods Received Notes: ${grns.length}`, pw - margin - 3, y + 16, { align: "right" });
  y += 28;

  // Signatures
  const colW = (pw - 2 * margin) / 3;
  ["Prepared By", "Finance Director", "Authorized By"].forEach((label, i) => {
    const x = margin + i * colW + 5;
    doc.setDrawColor(120, 120, 120);
    doc.line(x, y + 10, x + colW - 10, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(label, x, y + 14);
    doc.text("Signature & Date", x, y + 18);
  });

  doc.save(`Procurement_Spending_${po.po_number}.pdf`);
};

export const generatePeriodSpendingReport = async (
  from: string,
  to: string,
  pos: SpendingPO[],
  grns: SpendingGRN[],
  vouchers: SpendingVoucher[]
) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 15;

  let y = await header(
    doc,
    "PROCUREMENT SPENDING — PERIOD REPORT",
    `${new Date(from).toLocaleDateString()} → ${new Date(to).toLocaleDateString()}`
  );

  const poTotal = pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
  const paid = vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const grnVal = grns.reduce((s, g) => s + itemsTotal(g.items || []), 0);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ["Purchase Orders", String(pos.length), "Total PO Value", `USD ${poTotal.toFixed(2)}`],
      ["Payment Vouchers", String(vouchers.length), "Total Paid Out", `USD ${paid.toFixed(2)}`],
      ["Goods Received Notes", String(grns.length), "Value of Goods", `USD ${grnVal.toFixed(2)}`],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 45 },
      2: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 45 },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // By supplier
  const bySupplier = new Map<string, { po: number; paid: number; vouchers: number }>();
  for (const p of pos) {
    const k = p.supplier_name || "—";
    const r = bySupplier.get(k) || { po: 0, paid: 0, vouchers: 0 };
    r.po += Number(p.total_amount) || 0;
    bySupplier.set(k, r);
  }
  for (const v of vouchers) {
    const k = v.paid_to || "—";
    const r = bySupplier.get(k) || { po: 0, paid: 0, vouchers: 0 };
    r.paid += Number(v.amount) || 0;
    r.vouchers += 1;
    bySupplier.set(k, r);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Spending by Supplier", margin, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["Supplier", "POs Value", "Vouchers", "Paid Out"]],
    body: Array.from(bySupplier.entries())
      .sort((a, b) => b[1].paid - a[1].paid)
      .map(([name, r]) => [
        name,
        `USD ${r.po.toFixed(2)}`,
        String(r.vouchers),
        `USD ${r.paid.toFixed(2)}`,
      ]),
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // PO breakdown
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("Purchase Orders in Period", margin, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margin, right: margin },
    head: [["PO #", "Date", "Supplier", "Items", "Total"]],
    body: pos.length
      ? pos.map((p) => [
          p.po_number,
          new Date(p.created_at).toLocaleDateString(),
          p.supplier_name || "—",
          String((p.items || []).length),
          `${p.currency} ${Number(p.total_amount).toFixed(2)}`,
        ])
      : [["—", "—", "No purchase orders in this period", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 4: { halign: "right" } },
  });

  doc.save(`Procurement_Spending_${from}_to_${to}.pdf`);
};

export const buildPOSpendingSMS = (po: SpendingPO, vouchers: SpendingVoucher[]) => {
  const poTotal = Number(po.total_amount) || itemsTotal(po.items || []);
  const paid = vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const lines = (po.items || [])
    .slice(0, 8)
    .map((it, i) => `${i + 1}. ${it.description} x${it.quantity} = ${po.currency} ${((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toFixed(2)}`)
    .join("\n");
  const more = (po.items || []).length > 8 ? `\n…and ${(po.items || []).length - 8} more` : "";
  return `PROCUREMENT RUNDOWN\nPO ${po.po_number}\nSupplier: ${po.supplier_name || "—"}\n\nItems bought:\n${lines}${more}\n\nPO Total: ${po.currency} ${poTotal.toFixed(2)}\nPaid Out: ${po.currency} ${paid.toFixed(2)}\nVariance: ${po.currency} ${(paid - poTotal).toFixed(2)}`;
};

export const buildPeriodSpendingSMS = (
  from: string,
  to: string,
  pos: SpendingPO[],
  vouchers: SpendingVoucher[]
) => {
  const poTotal = pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
  const paid = vouchers.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  return `PROCUREMENT PERIOD REPORT\n${from} → ${to}\nPOs: ${pos.length} (USD ${poTotal.toFixed(2)})\nVouchers: ${vouchers.length} (USD ${paid.toFixed(2)})\nVariance: USD ${(paid - poTotal).toFixed(2)}`;
};
