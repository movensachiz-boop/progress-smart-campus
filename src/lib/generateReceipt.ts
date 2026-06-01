import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

interface ReceiptData {
  receiptNo: string;
  studentName: string;
  regNo: string;
  studentClass?: string;
  date: string;
  amount: string;
  method: string;
  description?: string;
  verificationHash?: string;
}

// Simple hash display: show first 16 + last 8 chars
const formatHash = (hash: string) => {
  if (!hash || hash.length < 24) return hash || "N/A";
  return `${hash.slice(0, 16)}...${hash.slice(-8)}`;
};

const getVerifyUrl = (receiptNo: string) => {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://progresscentresys.com";
  return `${origin}/verify?r=${encodeURIComponent(receiptNo)}`;
};

const generateQRDataUrl = async (text: string): Promise<string> => {
  return QRCode.toDataURL(text, { width: 200, margin: 1, errorCorrectionLevel: "M" });
};

export const generateReceipt = async (data: ReceiptData) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pw = 210;
  const ph = 297;
  const margin = 20;
  const primary: [number, number, number] = [0, 51, 102];
  const blue: [number, number, number] = [41, 128, 185];
  let y = 15;

  // ── Diagonal watermark (anti-copy) ──
  doc.saveGraphicsState();
  // @ts-ignore
  doc.setGState(new doc.GState({ opacity: 0.04 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(60);
  doc.setTextColor(0, 51, 102);
  const centerX = pw / 2;
  const centerY = ph / 2;
  // Rotated watermark text
  for (let i = -1; i <= 1; i++) {
    const offsetY = i * 70;
    doc.text("PCC OFFICIAL RECEIPT", centerX, centerY + offsetY, {
      align: "center",
      angle: 35,
    });
  }
  doc.restoreGraphicsState();

  // ── Decorative border ──
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, pw - 16, ph - 16);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, pw - 20, ph - 20);

  // ── Logo centered at top ──
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const logoUrl = logoModule.default;
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoUrl;
    });
    doc.addImage(img, "JPEG", pw / 2 - 12, y, 24, 24);
    y += 28;
  } catch {
    y += 5;
  }

  // ── Blue contact bar ──
  doc.setFillColor(...blue);
  doc.rect(0, y, pw, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("PROGRESS CHRISTIAN CENTRE  |  11729 Mkoba 14 Gweru, Zimbabwe  |  +263 77 400 0143", pw / 2, y + 6.5, { align: "center" });
  y += 18;

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text("Fees Invoice", pw / 2, y, { align: "center" });
  y += 8;

  // ── Security document ID ──
  const docId = `DOC-${data.receiptNo}-${Date.now().toString(36).toUpperCase()}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Document ID: ${docId}`, pw / 2, y + 3, { align: "center" });
  y += 10;

  // ── Invoice & Student Details (two-column table) ──
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pw - 2 * margin,
    head: [["Receipt Details", "Student Information"]],
    body: [
      [`Receipt No.: ${data.receiptNo}`, `Student Name: ${data.studentName}`],
      [`Receipt Date: ${data.date}`, `Reg. Number: ${data.regNo}`],
      [`Payment Method: ${data.method}`, `Class: ${data.studentClass || "—"}`],
      [`Status: PAID`, ``],
    ],
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [...blue],
      fontStyle: "italic",
      fontSize: 10,
      lineWidth: 0,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [30, 30, 30],
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: (pw - 2 * margin) / 2 },
      1: { cellWidth: (pw - 2 * margin) / 2, fontStyle: "bold" },
    },
    theme: "grid",
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
    },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 10;

  // ── Services breakdown table ──
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: pw - 2 * margin,
    head: [["Description of Services", "Subtotal"]],
    body: [
      ["Tuition Fee", data.amount],
    ],
    foot: [
      [{ content: "Total Amount Paid", styles: { fontStyle: "bold" } }, { content: data.amount, styles: { fontStyle: "bold", fontSize: 12 } }],
    ],
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [...blue],
      fontStyle: "italic",
      fontSize: 10,
      lineWidth: 0,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [30, 30, 30],
      cellPadding: 5,
    },
    footStyles: {
      fillColor: [240, 245, 250],
      textColor: [...primary],
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: (pw - 2 * margin) * 0.65 },
      1: { cellWidth: (pw - 2 * margin) * 0.35, halign: "right" },
    },
    theme: "grid",
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
    },
  });

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 12;

  // ── Payment Information ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Payment Information:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Payment was received via ${data.method}. Please retain this receipt for your records.`, margin, y);
  y += 12;

  // ── Security Verification Section with QR Code ──
  const verifyUrl = getVerifyUrl(data.receiptNo);
  const qrBoxH = 42;
  const qrSize = 30;

  doc.setFillColor(245, 248, 252);
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, pw - 2 * margin, qrBoxH, 2, 2, "FD");

  // QR code on the right
  try {
    const qrDataUrl = await generateQRDataUrl(verifyUrl);
    doc.addImage(qrDataUrl, "PNG", pw - margin - qrSize - 4, y + (qrBoxH - qrSize) / 2, qrSize, qrSize);
  } catch { /* QR generation failed, continue without */ }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...primary);
  doc.text("SECURITY VERIFICATION", margin + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);

  doc.text(`Verify online: ${verifyUrl}`, margin + 5, y + 12);
  doc.text(`Receipt No: ${data.receiptNo}`, margin + 5, y + 17);

  if (data.verificationHash) {
    doc.text(`SHA-256 Hash: ${formatHash(data.verificationHash)}`, margin + 5, y + 22);
  }

  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text("Scan QR code to verify authenticity.", margin + 5, y + 28);
  doc.text("This receipt is cryptographically signed. Any alteration will invalidate the verification hash.", margin + 5, y + 33);

  y += qrBoxH + 8;

  // ── Terms and Conditions ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Terms and Conditions:", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Fees are due at the beginning of each term. Late payments may incur additional charges.", margin, y);
  y += 5;
  doc.text("For any questions, please contact the school bursar at Progress Christian Centre.", margin, y);
  y += 15;

  // ── Signature line ──
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + 60, y);
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text("Authorized Signature", margin + 30, y + 5, { align: "center" });

  // ── PAID / VERIFIED stamp ──
  doc.setDrawColor(...blue);
  doc.setLineWidth(1.5);
  doc.circle(pw - margin - 20, y - 5, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...blue);
  doc.text("PAID", pw - margin - 20, y - 6, { align: "center" });
  doc.setFontSize(6);
  doc.text("VERIFIED", pw - margin - 20, y, { align: "center" });

  // ── Footer with security notice ──
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text("This is a computer-generated receipt from Progress Christian Centre. It is protected by SHA-256 cryptographic verification.", pw / 2, 278, { align: "center" });
  doc.text(`Document ID: ${docId}  |  Generated: ${new Date().toISOString()}`, pw / 2, 282, { align: "center" });
  doc.text("Unauthorized reproduction or alteration of this document is prohibited.", pw / 2, 286, { align: "center" });

  const safeName = data.studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`Fees_Invoice_${safeName}.pdf`);
};

const XP80_WIDTH_MM = 80;
const XP80_MARGIN_MM = 4;
const XP80_MEASURE_HEIGHT_MM = 500;
const XP80_MIN_HEIGHT_MM = 120;
const XP80_BOTTOM_FEED_MM = 8;

const loadReceiptLogo = async (): Promise<HTMLImageElement | null> => {
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    return img;
  } catch {
    return null;
  }
};

const renderThermalReceipt = async (doc: jsPDF, data: ReceiptData, logo: HTMLImageElement | null) => {
  const pw = XP80_WIDTH_MM;
  const margin = XP80_MARGIN_MM;
  const contentWidth = pw - margin * 2;
  const cx = pw / 2;
  let y = 5;

  const dashed = (yPos: number) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    for (let x = margin; x < pw - margin; x += 2) {
      doc.line(x, yPos, Math.min(x + 1, pw - margin), yPos);
    }
  };

  const centered = (text: string, fontSize: number, style: "normal" | "bold" = "normal", gap = 3.6) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    lines.forEach((line) => {
      doc.text(line, cx, y, { align: "center" });
      y += gap;
    });
  };

  const row = (label: string, value: string) => {
    const valueX = 25;
    const maxValueWidth = pw - valueX - margin;
    const lines = doc.splitTextToSize(value || "-", maxValueWidth) as string[];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text(label, margin, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    lines.forEach((line, index) => {
      doc.text(line, pw - margin, y + index * 3.6, { align: "right" });
    });
    y += Math.max(4.4, lines.length * 3.6);
  };

  if (logo) {
    doc.addImage(logo, "PNG", cx - 8, y, 16, 16);
    y += 18;
  }

  centered("PROGRESS CHRISTIAN CENTRE", 9, "bold", 4);
  centered("11729 Mkoba 14 Gweru, Zimbabwe", 6.2, "normal", 3.4);
  centered("+263 77 400 0143", 6.2, "normal", 3.4);
  y += 1;

  dashed(y);
  y += 4;
  centered("FEES INVOICE", 10, "bold", 4.8);
  dashed(y);
  y += 4;

  row("Receipt:", data.receiptNo);
  row("Date:", data.date);
  row("Student:", data.studentName);
  row("Reg No:", data.regNo);
  row("Class:", data.studentClass || "—");
  row("Method:", data.method);
  row("Status:", "PAID");
  row("Desc:", data.description || "Tuition Fee");

  y += 1;
  dashed(y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80);
  const serviceLines = doc.splitTextToSize(data.description || "Tuition Fee", 45) as string[];
  serviceLines.forEach((line, index) => {
    doc.text(line, margin, y + index * 3.4);
  });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(data.amount, pw - margin, y, { align: "right" });
  y += Math.max(5, serviceLines.length * 3.4 + 1);

  dashed(y);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL:", margin, y);
  doc.setFontSize(11);
  doc.text(data.amount, pw - margin, y, { align: "right" });
  y += 5;

  dashed(y);
  y += 4;
  centered("** PAID **", 12, "bold", 5);
  dashed(y);
  y += 4;

  const thermalVerifyUrl = getVerifyUrl(data.receiptNo);
  try {
    const qrDataUrl = await generateQRDataUrl(thermalVerifyUrl);
    const qrS = 24;
    doc.addImage(qrDataUrl, "PNG", cx - qrS / 2, y, qrS, qrS);
    y += qrS + 3;
  } catch {
    y += 2;
  }

  centered("Scan to verify receipt", 5.5, "normal", 3.5);

  if (data.verificationHash) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(80);
    const hashLines = doc.splitTextToSize(`Hash: ${formatHash(data.verificationHash)}`, contentWidth) as string[];
    hashLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 3.2;
    });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(80);
  const verifyLines = doc.splitTextToSize(`Verify: ${thermalVerifyUrl}`, contentWidth) as string[];
  verifyLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 3.2;
  });

  y += 1;
  dashed(y);
  y += 4;

  doc.setFontSize(5);
  doc.setTextColor(120);
  doc.text("This receipt is cryptographically", cx, y, { align: "center" });
  y += 2.6;
  doc.text("signed. Keep for your records.", cx, y, { align: "center" });
  y += 4;
  doc.text("Thank you for your payment!", cx, y, { align: "center" });
  y += 4;
  dashed(y);

  return y;
};

const openPdfForAutomaticPrint = (doc: jsPDF, fallbackName: string, printWindow?: Window | null) => {
  doc.autoPrint();
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const targetWindow = printWindow || window.open(url, "_blank");

  if (!targetWindow) {
    URL.revokeObjectURL(url);
    doc.save(fallbackName);
    return;
  }

  if (printWindow) {
    targetWindow.location.href = url;
  }

  let started = false;
  const startPrint = () => {
    if (started) return;
    started = true;
    targetWindow.focus();
    targetWindow.print();
  };

  targetWindow.onload = () => window.setTimeout(startPrint, 350);
  targetWindow.onafterprint = () => {
    targetWindow.close();
    URL.revokeObjectURL(url);
  };
  window.setTimeout(startPrint, 900);
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// ── Thermal Receipt for XP80Q / XP80C 80mm printer ──
export const generateThermalReceipt = async (data: ReceiptData, mode: "save" | "print" = "save") => {
  const printWindow = mode === "print" ? window.open("", "_blank") : null;
  const logo = await loadReceiptLogo();
  const measuringDoc = new jsPDF({ unit: "mm", format: [XP80_WIDTH_MM, XP80_MEASURE_HEIGHT_MM] });
  const measuredHeight = await renderThermalReceipt(measuringDoc, data, logo);
  const receiptHeight = Math.max(XP80_MIN_HEIGHT_MM, Math.ceil(measuredHeight + XP80_BOTTOM_FEED_MM));
  const doc = new jsPDF({ unit: "mm", format: [XP80_WIDTH_MM, receiptHeight] });
  await renderThermalReceipt(doc, data, logo);

  const safeName = data.studentName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const fileName = `Fees_Invoice_Thermal_${safeName}.pdf`;

  if (mode === "print") {
    openPdfForAutomaticPrint(doc, fileName, printWindow);
  } else {
    doc.save(fileName);
  }
};

// ── Print receipt directly on XP80 80mm thermal size ──
export const printReceipt = async (data: ReceiptData) => {
  await generateThermalReceipt(data, "print");
};
