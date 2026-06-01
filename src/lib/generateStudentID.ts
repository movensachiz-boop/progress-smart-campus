import { jsPDF } from "jspdf";

interface StudentIDData {
  name: string;
  regNumber: string;
  form: string;
  stream: string;
  year: string;
  photoUrl?: string;
}

export const generateStudentID = async (student: StudentIDData) => {
  // Card size: 86mm x 54mm (standard credit card)
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [86, 54] });

  const cw = 86;
  const ch = 54;
  const primary: [number, number, number] = [0, 51, 102];
  const blue: [number, number, number] = [41, 128, 185];
  const gold: [number, number, number] = [196, 164, 105];

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, cw, ch, "F");

  // Top navy band (reduced height)
  doc.setFillColor(...primary);
  doc.rect(0, 0, cw, 14, "F");

  // Gold accent line
  doc.setFillColor(...gold);
  doc.rect(0, 14, cw, 1, "F");

  // Logo
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
    doc.addImage(img, "JPEG", 3, 1.5, 11, 11);
  } catch {
    // continue without logo
  }

  // School name in header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("PROGRESS CHRISTIAN CENTRE", 50, 6, { align: "center" });

  doc.setFontSize(5);
  doc.setTextColor(...gold);
  doc.text("STUDENT IDENTIFICATION CARD", 50, 12, { align: "center" });

  // Photo
  if (student.photoUrl) {
    try {
      const photoImg = new Image();
      photoImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        photoImg.onload = () => resolve();
        photoImg.onerror = () => reject();
        photoImg.src = student.photoUrl!;
      });
      doc.addImage(photoImg, "JPEG", 5, 17, 16, 20);
    } catch {
      // fallback placeholder
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(240, 240, 245);
      doc.roundedRect(5, 17, 16, 20, 1, 1, "FD");
      doc.setFontSize(4.5);
      doc.setTextColor(160, 160, 160);
      doc.text("PHOTO", 13, 28, { align: "center" });
    }
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(240, 240, 245);
    doc.roundedRect(5, 17, 16, 20, 1, 1, "FD");
    doc.setFontSize(4.5);
    doc.setTextColor(160, 160, 160);
    doc.text("PHOTO", 13, 28, { align: "center" });
  }

  // Student details
  const detailX = 25;
  let y = 19;

  const addField = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(120, 120, 120);
    doc.text(label, detailX, y);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 30, 30);
    doc.text(value, detailX, y);
    y += 4.5;
  };

  addField("FULL NAME", student.name);
  addField("REG NUMBER", student.regNumber);
  addField("CLASS / STREAM", `Form ${student.form} - ${student.stream}`);

  // Year badge
  doc.setFillColor(...blue);
  doc.roundedRect(65, 34, 17, 6, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(student.year, 73.5, 38.5, { align: "center" });

  // Bottom bar
  doc.setFillColor(...primary);
  doc.rect(0, ch - 3.5, cw, 3.5, "F");
  doc.setFontSize(4);
  doc.setTextColor(200, 200, 210);
  doc.text("Property of Progress Christian Centre", cw / 2, ch - 1, { align: "center" });

  doc.save(`StudentID_${student.regNumber}.pdf`);
};

export const generateBulkStudentIDs = async (students: StudentIDData[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const cardW = 86;
  const cardH = 54;
  const marginX = 12;
  const marginY = 15;
  const gapX = 10;
  const gapY = 8;
  const cols = 2;
  const rowsPerPage = 4;

  const primary: [number, number, number] = [0, 51, 102];
  const blue: [number, number, number] = [41, 128, 185];
  const gold: [number, number, number] = [196, 164, 105];

  let logoImg: HTMLImageElement | null = null;
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    logoImg = img;
  } catch {
    // continue without logo
  }

  for (let i = 0; i < students.length; i++) {
    const pageIndex = Math.floor(i / (cols * rowsPerPage));
    const posOnPage = i % (cols * rowsPerPage);
    const col = posOnPage % cols;
    const row = Math.floor(posOnPage / cols);

    if (i > 0 && posOnPage === 0) doc.addPage();

    const x = marginX + col * (cardW + gapX);
    const y = marginY + row * (cardH + gapY);

    const s = students[i];

    // Card border
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");

    // Top navy band
    doc.setFillColor(...primary);
    doc.rect(x, y, cardW, 14, "F");

    // Gold line
    doc.setFillColor(...gold);
    doc.rect(x, y + 14, cardW, 1, "F");

    // Logo
    if (logoImg) {
      doc.addImage(logoImg, "JPEG", x + 3, y + 1.5, 11, 11);
    }

    // School name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("PROGRESS CHRISTIAN CENTRE", x + cardW / 2 + 5, y + 6, { align: "center" });
    doc.setFontSize(5);
    doc.setTextColor(...gold);
    doc.text("STUDENT IDENTIFICATION CARD", x + cardW / 2 + 5, y + 12, { align: "center" });

    // Photo
    if (s.photoUrl) {
      try {
        const photoImg = new Image();
        photoImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          photoImg.onload = () => resolve();
          photoImg.onerror = () => reject();
          photoImg.src = s.photoUrl!;
        });
        doc.addImage(photoImg, "JPEG", x + 5, y + 17, 16, 20);
      } catch {
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 245);
        doc.roundedRect(x + 5, y + 17, 16, 20, 1, 1, "FD");
        doc.setFontSize(4.5);
        doc.setTextColor(160, 160, 160);
        doc.text("PHOTO", x + 13, y + 28, { align: "center" });
      }
    } else {
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(240, 240, 245);
      doc.roundedRect(x + 5, y + 17, 16, 20, 1, 1, "FD");
      doc.setFontSize(4.5);
      doc.setTextColor(160, 160, 160);
      doc.text("PHOTO", x + 13, y + 28, { align: "center" });
    }

    // Details
    const dx = x + 25;
    let dy = y + 19;

    const addField = (label: string, value: string) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text(label, dx, dy);
      dy += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 30, 30);
      doc.text(value, dx, dy);
      dy += 4.5;
    };

    addField("FULL NAME", s.name);
    addField("REG NUMBER", s.regNumber);
    addField("CLASS / STREAM", `Form ${s.form} - ${s.stream}`);

    // Year badge
    doc.setFillColor(...blue);
    doc.roundedRect(x + 65, y + 34, 17, 6, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(s.year, x + 73.5, y + 38.5, { align: "center" });

    // Bottom bar
    doc.setFillColor(...primary);
    doc.rect(x, y + cardH - 3.5, cardW, 3.5, "F");
    doc.setFontSize(4);
    doc.setTextColor(200, 200, 210);
    doc.text("Property of Progress Christian Centre", x + cardW / 2, y + cardH - 1, { align: "center" });
  }

  doc.save(`Student_IDs_${new Date().getFullYear()}.pdf`);
};
