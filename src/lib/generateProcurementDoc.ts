import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ProcurementLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
}

export interface ProcurementDocData {
  docType: "REQUISITION" | "PURCHASE ORDER" | "GOODS RECEIVED NOTE";
  number: string;
  date: string;
  currency?: string;
  // Requisition
  requestedBy?: string;
  department?: string;
  purpose?: string;
  // PO
  supplierName?: string;
  expectedDelivery?: string;
  // GRN
  receivedBy?: string;
  poNumber?: string;
  // Common
  items: ProcurementLineItem[];
  notes?: string;
}

export const generateProcurementDoc = async (data: ProcurementDocData) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ph = 297;
  const margin = 15;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  const currency = data.currency || "USD";
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

  // School details (right of logo)
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

  y += 26;

  // Blue title bar
  doc.setFillColor(...blue);
  doc.rect(margin, y, pw - 2 * margin, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(data.docType, pw / 2, y + 6, { align: "center" });
  y += 14;

  // Meta info
  const meta: string[][] = [];
  meta.push(["Document No.", data.number, "Date", data.date]);
  if (data.docType === "REQUISITION") {
    meta.push(["Requested By", data.requestedBy || "—", "Department", data.department || "—"]);
    if (data.purpose) meta.push(["Purpose", data.purpose, "", ""]);
  } else if (data.docType === "PURCHASE ORDER") {
    meta.push(["Supplier", data.supplierName || "—", "Expected Delivery", data.expectedDelivery || "—"]);
  } else {
    meta.push(["Supplier", data.supplierName || "—", "Received By", data.receivedBy || "—"]);
    if (data.poNumber) meta.push(["Related PO", data.poNumber, "", ""]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: meta,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 30, 30], lineColor: [210, 210, 210] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 32 },
      1: { cellWidth: (pw - 2 * margin - 64) / 2 },
      2: { fontStyle: "bold", fillColor: [240, 245, 250], cellWidth: 32 },
      3: { cellWidth: (pw - 2 * margin - 64) / 2 },
    },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 6;

  // Items table
  const showCost = true;
  const head = showCost
    ? [["#", "Description", "Qty", "Unit", "Unit Price", "Total"]]
    : [["#", "Description", "Qty", "Unit", "Notes"]];

  const body = data.items.map((it, i) => {
    if (showCost) {
      const total = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
      return [
        String(i + 1),
        it.description || "",
        String(it.quantity ?? ""),
        it.unit || "—",
        `${currency} ${Number(it.unit_price || 0).toFixed(2)}`,
        `${currency} ${total.toFixed(2)}`,
      ];
    }
    return [String(i + 1), it.description || "", String(it.quantity ?? ""), it.unit || "—", ""];
  });

  const grandTotal = data.items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head,
    body,
    foot: showCost
      ? [[
          { content: "GRAND TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
          { content: `${currency} ${grandTotal.toFixed(2)}`, styles: { fontStyle: "bold" } },
        ]]
      : undefined,
    theme: "grid",
    headStyles: { fillColor: [...primary], textColor: [255, 255, 255], fontSize: 9.5 },
    bodyStyles: { fontSize: 9, cellPadding: 2.5 },
    footStyles: { fillColor: [240, 245, 250], textColor: [...primary], fontSize: 10 },
    columnStyles: showCost
      ? { 0: { cellWidth: 10 }, 2: { halign: "right", cellWidth: 14 }, 3: { cellWidth: 18 }, 4: { halign: "right", cellWidth: 28 }, 5: { halign: "right", cellWidth: 30 } }
      : { 0: { cellWidth: 10 }, 2: { halign: "right", cellWidth: 18 }, 3: { cellWidth: 22 } },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8;

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...primary);
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(data.notes, pw - 2 * margin);
    doc.text(lines, margin, y + 5);
    y += 5 + lines.length * 4;
  }

  // Signatures
  y = Math.max(y + 10, ph - 50);
  const colW = (pw - 2 * margin) / 3;
  ["Prepared By", "Approved By", "Received / Issued By"].forEach((label, i) => {
    const x = margin + i * colW + 5;
    doc.setDrawColor(120, 120, 120);
    doc.line(x, y, x + colW - 10, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(label, x, y + 4);
    doc.text("Signature & Date", x, y + 8);
  });

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generated ${new Date().toLocaleString()} • Progress Christian Centre Procurement`,
    pw / 2,
    ph - 10,
    { align: "center" }
  );

  doc.save(`${data.docType.replace(/\s+/g, "_")}_${data.number}.pdf`);
};
