import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

export interface InventoryReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface InventoryReceiptData {
  receiptNo: string;
  studentName: string;
  regNo: string;
  studentClass?: string;
  date: string;
  method: string;
  items: InventoryReceiptItem[];
  total: number;
  currency?: string;
}

const getVerifyUrl = (receiptNo: string) =>
  `https://progresscentresys.com/verify?r=${encodeURIComponent(receiptNo)}`;

const qr = (text: string) => QRCode.toDataURL(text, { width: 200, margin: 1, errorCorrectionLevel: "M" });

const fmt = (n: number, c = "USD") => `${c === "USD" ? "US$" : c} ${n.toFixed(2)}`;

const openPdfForAutomaticPrint = (doc: jsPDF, fallbackName: string) => {
  doc.autoPrint();
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) { URL.revokeObjectURL(url); doc.save(fallbackName); return; }
  let started = false;
  const startPrint = () => { if (started) return; started = true; w.focus(); w.print(); };
  w.onload = () => window.setTimeout(startPrint, 350);
  w.onafterprint = () => { w.close(); URL.revokeObjectURL(url); };
  window.setTimeout(startPrint, 900);
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const generateInventoryReceipt = async (data: InventoryReceiptData, mode: "save" | "print" = "print") => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 20;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  const cur = data.currency || "USD";
  let y = 15;

  // Border
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.8); doc.rect(8, 8, pw - 16, 281);
  doc.setLineWidth(0.3); doc.rect(10, 10, pw - 20, 277);

  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve(); img.onerror = () => reject(); img.src = logoModule.default;
    });
    doc.addImage(img, "PNG", pw / 2 - 12, y, 24, 24);
    y += 28;
  } catch { y += 5; }

  doc.setFillColor(...blue);
  doc.rect(0, y, pw, 10, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text("PROGRESS CHRISTIAN CENTRE  |  11729 Mkoba 14 Gweru, Zimbabwe  |  +263 77 400 0143", pw / 2, y + 6.5, { align: "center" });
  y += 18;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(30, 30, 30);
  doc.text("Inventory Sale Receipt", pw / 2, y, { align: "center" });
  y += 10;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pw - 2 * margin,
    head: [["Receipt Details", "Customer Information"]],
    body: [
      [`Receipt No.: ${data.receiptNo}`, `Name: ${data.studentName}`],
      [`Date: ${data.date}`, `Reg No: ${data.regNo}`],
      [`Payment Method: ${data.method}`, `Class: ${data.studentClass || "—"}`],
      [`Status: PAID`, ``],
    ],
    headStyles: { fillColor: [255, 255, 255], textColor: blue, fontStyle: "italic", fontSize: 10 },
    bodyStyles: { fontSize: 9.5, cellPadding: 4 },
    theme: "grid",
    styles: { lineColor: [200, 200, 200], lineWidth: 0.3 },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pw - 2 * margin,
    head: [["Item", "Qty", "Unit Price", "Subtotal"]],
    body: data.items.map(i => [i.name, String(i.quantity), fmt(i.unit_price, cur), fmt(i.subtotal, cur)]),
    foot: [[
      { content: "TOTAL", colSpan: 3, styles: { halign: "right", fontStyle: "bold" } },
      { content: fmt(data.total, cur), styles: { fontStyle: "bold", fontSize: 12 } },
    ]],
    headStyles: { fillColor: [255, 255, 255], textColor: blue, fontStyle: "italic", fontSize: 10 },
    bodyStyles: { fontSize: 10, cellPadding: 4 },
    footStyles: { fillColor: [240, 245, 250], textColor: primary },
    columnStyles: {
      0: { cellWidth: (pw - 2 * margin) * 0.5 },
      1: { cellWidth: (pw - 2 * margin) * 0.1, halign: "center" },
      2: { cellWidth: (pw - 2 * margin) * 0.2, halign: "right" },
      3: { cellWidth: (pw - 2 * margin) * 0.2, halign: "right" },
    },
    theme: "grid",
    styles: { lineColor: [200, 200, 200], lineWidth: 0.3 },
  });
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 12;

  // QR
  const verifyUrl = getVerifyUrl(data.receiptNo);
  const qrSize = 30;
  doc.setFillColor(245, 248, 252); doc.setDrawColor(...blue); doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, pw - 2 * margin, 42, 2, 2, "FD");
  try {
    const qrUrl = await qr(verifyUrl);
    doc.addImage(qrUrl, "PNG", pw - margin - qrSize - 4, y + 6, qrSize, qrSize);
  } catch {}
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...primary);
  doc.text("VERIFICATION", margin + 5, y + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  doc.text(`Verify online: ${verifyUrl}`, margin + 5, y + 16);
  doc.text(`Receipt No: ${data.receiptNo}`, margin + 5, y + 22);
  doc.text("Scan QR to verify this purchase.", margin + 5, y + 30);
  y += 50;

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Thank you for your purchase. Items sold are non-refundable unless faulty.", pw / 2, y, { align: "center" });

  const safe = data.studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const fileName = `Inventory_Receipt_${safe}_${data.receiptNo}.pdf`;
  if (mode === "print") openPdfForAutomaticPrint(doc, fileName);
  else doc.save(fileName);
};

// 80mm thermal
export const generateInventoryThermalReceipt = async (data: InventoryReceiptData, mode: "save" | "print" = "print") => {
  const W = 80, M = 4;
  const measure = new jsPDF({ unit: "mm", format: [W, 500] });
  const cur = data.currency || "USD";

  const render = async (doc: jsPDF) => {
    const cx = W / 2; let y = 5;
    const dashed = (yp: number) => {
      doc.setDrawColor(0); doc.setLineWidth(0.1);
      for (let x = M; x < W - M; x += 2) doc.line(x, yp, Math.min(x + 1, W - M), yp);
    };
    const center = (t: string, fs: number, st: "normal" | "bold" = "normal", g = 3.6) => {
      doc.setFont("helvetica", st); doc.setFontSize(fs); doc.setTextColor(0);
      const lines = doc.splitTextToSize(t, W - 2 * M) as string[];
      lines.forEach(l => { doc.text(l, cx, y, { align: "center" }); y += g; });
    };
    try {
      const m = await import("@/assets/pcc-logo.png");
      const img = new Image(); img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = m.default; });
      doc.addImage(img, "PNG", cx - 8, y, 16, 16); y += 18;
    } catch {}
    center("PROGRESS CHRISTIAN CENTRE", 9, "bold", 4);
    center("Mkoba 14 Gweru | +263 77 400 0143", 6, "normal", 3.4);
    y += 1; dashed(y); y += 4;
    center("PURCHASE RECEIPT", 10, "bold", 4.8);
    dashed(y); y += 4;

    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    const row = (l: string, v: string) => {
      doc.setFont("helvetica", "normal"); doc.text(l, M, y);
      doc.setFont("helvetica", "bold"); doc.text(v, W - M, y, { align: "right" });
      y += 4;
    };
    row("Receipt:", data.receiptNo);
    row("Date:", data.date);
    row("Customer:", data.studentName);
    row("Reg No:", data.regNo);
    row("Class:", data.studentClass || "—");
    row("Method:", data.method);
    y += 1; dashed(y); y += 4;

    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.text("ITEM", M, y); doc.text("QTY", 45, y); doc.text("AMT", W - M, y, { align: "right" });
    y += 3.5; dashed(y); y += 3;
    doc.setFont("helvetica", "normal");
    data.items.forEach(it => {
      const lines = doc.splitTextToSize(it.name, 38) as string[];
      lines.forEach((l, idx) => {
        doc.text(l, M, y);
        if (idx === 0) {
          doc.text(String(it.quantity), 45, y);
          doc.text(fmt(it.subtotal, cur), W - M, y, { align: "right" });
        }
        y += 3.4;
      });
      y += 0.5;
    });
    dashed(y); y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("TOTAL:", M, y);
    doc.setFontSize(11); doc.text(fmt(data.total, cur), W - M, y, { align: "right" });
    y += 5; dashed(y); y += 4;
    center("** PAID **", 11, "bold", 5);
    dashed(y); y += 4;
    try {
      const url = getVerifyUrl(data.receiptNo);
      const q = await qr(url);
      doc.addImage(q, "PNG", cx - 12, y, 24, 24); y += 27;
      center("Scan to verify", 6, "normal", 3.5);
    } catch {}
    y += 2;
    center("Thank you for your purchase!", 6, "normal", 3.5);
    return y;
  };

  const measured = await render(measure);
  const h = Math.max(120, Math.ceil(measured + 8));
  const doc = new jsPDF({ unit: "mm", format: [W, h] });
  await render(doc);
  const safe = data.studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const fileName = `Inventory_Receipt_Thermal_${safe}_${data.receiptNo}.pdf`;
  if (mode === "print") openPdfForAutomaticPrint(doc, fileName);
  else doc.save(fileName);
};
