import jsPDF from "jspdf";

export interface AttendanceRegisterOptions {
  title?: string;
  meetingTitle?: string;
  meetingDate?: string;
  rows?: number;
}

export const generateAttendanceRegister = (opts: AttendanceRegisterOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  const drawHeader = () => {
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, 9, { align: "center" });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text("PARENT / GUARDIAN ATTENDANCE REGISTER", pageW / 2, 16, { align: "center" });

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const infoY = 28;
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
  let y = 40;

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
      y = 40;
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

