import jsPDF from "jspdf";

export interface AttendanceRegisterOptions {
  title?: string;
  meetingTitle?: string;
  meetingDate?: string;
  rows?: number;
}

export const generateAttendanceRegister = async (opts: AttendanceRegisterOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // ── Load logo ──
  let logoH = 0;
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
    const logoW = 18;
    logoH = 18;
    doc.addImage(img, "PNG", pageW / 2 - logoW / 2, 6, logoW, logoH);
  } catch {
    // logo failed — continue without it
  }

  const drawHeader = () => {
    // Blue header bar
    doc.setFillColor(0, 51, 102);
    const headerY = logoH > 0 ? 28 : 0;
    const headerH = logoH > 0 ? 20 : 22;
    doc.rect(0, headerY, pageW, headerH, "F");

    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, headerY + 7, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("BONNYVALE, GWERU  |  +263 77 400 0143", pageW / 2, headerY + 13, { align: "center" });

    doc.setTextColor(255, 215, 0);
    doc.setFontSize(10);
    doc.text("PARENT / GUARDIAN ATTENDANCE REGISTER", pageW / 2, headerY + 18, { align: "center" });

    // Meeting info below header
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const infoY = headerY + headerH + 6;
    if (opts.meetingTitle) {
      doc.setFont("helvetica", "bold");
      doc.text(`Meeting: ${opts.meetingTitle}`, margin, infoY);
      doc.setFont("helvetica", "normal");
    }
    doc.text(`Date: ${opts.meetingDate || "____________"}`, pageW - margin, infoY, { align: "right" });
  };

  const cols = [
    { key: "no", label: "#", w: 8 },
    { key: "parent", label: "Name of Parent / Guardian", w: 55 },
    { key: "learner", label: "Name of Learner", w: 50 },
    { key: "contact", label: "Contact", w: 30 },
    { key: "signature", label: "Signature", w: 0 },
  ];
  const usableW = pageW - margin * 2;
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = usableW - fixedW;

  const rowH = 10;
  const headerRowH = 8;
  const startY = logoH > 0 ? 58 : 40;
  let y = startY;

  const drawTableHeader = () => {
    doc.setFillColor(230, 235, 245);
    doc.rect(margin, y, usableW, headerRowH, "F");
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, usableW, headerRowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 51, 102);
    let x = margin;
    cols.forEach((c) => {
      doc.text(c.label, x + 2, y + 5.5);
      x += c.w;
      if (x < margin + usableW - 0.1) doc.line(x, y, x, y + headerRowH);
    });
    y += headerRowH;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
  };

  const drawBlankRow = (index: number) => {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, usableW, rowH);
    let x = margin;
    cols.forEach((c, i) => {
      if (i < cols.length - 1) doc.line(x + c.w, y, x + c.w, y + rowH);
      x += c.w;
    });
    doc.setFontSize(9);
    doc.text(String(index + 1), margin + 2, y + 6.5);
    y += rowH;
  };

  drawHeader();
  drawTableHeader();

  const totalRows = opts.rows || 30;
  for (let i = 0; i < totalRows; i++) {
    if (y + rowH > pageH - 20) {
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Progress Christian College — Parent/Guardian Attendance Register", pageW / 2, pageH - 8, { align: "center" });
      doc.addPage();
      y = startY;
      drawHeader();
      drawTableHeader();
    }
    drawBlankRow(i);
  }

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Progress Christian College — Parent/Guardian Attendance Register", pageW / 2, pageH - 8, { align: "center" });

  const fileName = opts.meetingTitle
    ? `Attendance_Register_${opts.meetingTitle.replace(/\s+/g, "_")}.pdf`
    : "Attendance_Register.pdf";
  doc.save(fileName);
};


