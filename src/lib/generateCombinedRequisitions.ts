import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ProcurementLineItem } from "./generateProcurementDoc";

export interface CombinedRequisition {
  requisition_number: string;
  created_at: string;
  requested_by: string;
  department?: string;
  purpose?: string;
  currency: string;
  items: ProcurementLineItem[];
  notes?: string;
}

export const generateCombinedRequisitions = async (reqs: CombinedRequisition[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ph = 297;
  const margin = 15;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  let y = 12;

  doc.setDrawColor(...blue);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pw - 16, ph - 16);

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
  doc.text("PROGRESS CHRISTIAN CENTRE", margin + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("11729 Mkoba 14, Gweru, Zimbabwe", margin + 26, y + 11);
  doc.text("Procurement Department", margin + 26, y + 15);
  doc.text("Tel: +263 77 400 0143  |  www.progresscentresys.com", margin + 26, y + 19);

  y += 26;

  doc.setFillColor(...blue);
  doc.rect(margin, y, pw - 2 * margin, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("COMBINED REQUISITIONS SUMMARY", pw / 2, y + 6, { align: "center" });
  y += 14;

  // Meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  doc.text(`Requisitions included: ${reqs.length}`, pw - margin, y, { align: "right" });
  y += 6;

  // Overview table
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Req No.", "Date", "Requested By", "Department", "Items", "Total"]],
    body: reqs.map((r, i) => [
      String(i + 1),
      r.requisition_number,
      new Date(r.created_at).toLocaleDateString(),
      r.requested_by || "—",
      r.department || "—",
      String((r.items || []).length),
      `${r.currency} ${(r.items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0).toFixed(2)}`,
    ]),
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9.5 },
    bodyStyles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: 10 }, 5: { halign: "right" }, 6: { halign: "right" } },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // Totals by currency
  const byCcy: Record<string, number> = {};
  for (const r of reqs) {
    const t = (r.items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    byCcy[r.currency] = (byCcy[r.currency] || 0) + t;
  }

  // Consolidated line items across all reqs
  const allItems = reqs.flatMap((r) =>
    (r.items || []).map((it) => ({
      req: r.requisition_number,
      description: it.description,
      qty: Number(it.quantity) || 0,
      unit: it.unit || "—",
      unit_price: Number(it.unit_price) || 0,
      currency: r.currency,
      total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    }))
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text("Consolidated Line Items", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Req", "Description", "Qty", "Unit", "Unit Price", "Total"]],
    body: allItems.map((it) => [
      it.req,
      it.description,
      String(it.qty),
      it.unit,
      `${it.currency} ${it.unit_price.toFixed(2)}`,
      `${it.currency} ${it.total.toFixed(2)}`,
    ]),
    theme: "striped",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9.5 },
    bodyStyles: { fontSize: 8.8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold" },
      2: { halign: "right", cellWidth: 14 },
      3: { cellWidth: 16 },
      4: { halign: "right", cellWidth: 28 },
      5: { halign: "right", cellWidth: 30 },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  // Grand totals
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text("Grand Totals", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Currency", "Total Amount"]],
    body: Object.entries(byCcy).map(([c, v]) => [c, `${c} ${v.toFixed(2)}`]),
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 10 },
    bodyStyles: { fontSize: 10, cellPadding: 3, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 10;

  // Signatures
  if (y > ph - 40) { doc.addPage(); y = 20; }
  const colW = (pw - 2 * margin) / 2;
  ["Prepared By — Procurement Officer", "Approved By — Bursar / Administrator"].forEach((label, i) => {
    const x = margin + i * colW + 5;
    doc.setDrawColor(120, 120, 120);
    doc.line(x, y + 12, x + colW - 10, y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text(label, x, y + 16);
    doc.text("Signature & Date", x, y + 20);
  });

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Progress Christian Centre Procurement — Combined Requisitions Report",
    pw / 2,
    ph - 10,
    { align: "center" }
  );

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`combined-requisitions-${stamp}.pdf`);
};
