import jsPDF from "jspdf";

export interface ApplicationFormOptions {
  year?: string | number;
}

export const generateApplicationForm = async (opts: ApplicationFormOptions = {}) => {
  const year = String(opts.year || new Date().getFullYear() + 1);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Row heights — generous so there is actual writing space
  const ROW = 14;            // vertical space per field row
  const LINE_OFFSET = 10;    // distance from label baseline down to the writing line
  const SECTION_GAP = 6;

  let pageNum = 1;

  const drawHeader = async () => {
    // Logo
    let logoH = 0;
    try {
      const logoModule = await import("@/assets/pcc-logo.png");
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = logoModule.default;
      });
      const logoW = 20;
      logoH = 20;
      doc.addImage(img, "PNG", pageW / 2 - logoW / 2, 6, logoW, logoH);
    } catch {}

    const headerY = logoH > 0 ? 28 : 6;
    doc.setFillColor(0, 51, 102);
    doc.rect(0, headerY, pageW, 20, "F");
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, headerY + 7, { align: "center" });
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Bonnyvale Campus, Gweru  |  +263 77 400 0143", pageW / 2, headerY + 12, { align: "center" });
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`STUDENT APPLICATION FORM — ${year}`, pageW / 2, headerY + 18, { align: "center" });

    doc.setTextColor(0, 0, 0);
    return headerY + 26;
  };

  const drawFooter = () => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Progress Christian College — Bonnyvale Campus  |  Application Form ${year}  |  Page ${pageNum}`,
      pageW / 2,
      pageH - 6,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  };

  let y = await drawHeader();

  const ensureSpace = async (needed: number) => {
    if (y + needed > pageH - 12) {
      drawFooter();
      doc.addPage();
      pageNum += 1;
      y = await drawHeader();
    }
  };

  const field = (label: string, x: number, yy: number, width: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 51, 102);
    doc.text(label.toUpperCase(), x, yy);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(x, yy + LINE_OFFSET, x + width, yy + LINE_OFFSET);
    doc.setTextColor(0, 0, 0);
  };

  const sectionHeader = async (title: string) => {
    await ensureSpace(14);
    doc.setFillColor(0, 51, 102);
    doc.rect(margin, y, pageW - margin * 2, 6.5, "F");
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin + 2, y + 4.6);
    y += 6.5 + 4;
    doc.setTextColor(0, 0, 0);
  };

  const fullW = pageW - margin * 2;
  const halfW = (fullW - 4) / 2;
  const thirdW = (fullW - 8) / 3;

  // Instructions
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Please complete this form in BLOCK LETTERS and submit it to the school office together with the required supporting documents.",
    margin, y,
  );
  y += 6;
  doc.setTextColor(0, 0, 0);

  // Two-column row helper
  const row2 = async (l1: string, l2: string) => {
    await ensureSpace(ROW);
    field(l1, margin, y, halfW);
    field(l2, margin + halfW + 4, y, halfW);
    y += ROW;
  };
  const row3 = async (l1: string, l2: string, l3: string) => {
    await ensureSpace(ROW);
    field(l1, margin, y, thirdW);
    field(l2, margin + thirdW + 4, y, thirdW);
    field(l3, margin + (thirdW + 4) * 2, y, thirdW);
    y += ROW;
  };
  const row1 = async (l: string) => {
    await ensureSpace(ROW);
    field(l, margin, y, fullW);
    y += ROW;
  };

  // Section A
  await sectionHeader("A.  APPLICANT (LEARNER) DETAILS");
  await row2("Surname", "First Name(s)");
  await row3("Date of Birth", "Gender", "Nationality");
  await row2("National ID / Birth Cert. No.", "Religion / Denomination");
  await row1("Home Address");
  await row3("Form Applying For (1-6)", "Learning Area / Stream", "Day Scholar / Boarder");
  y += SECTION_GAP - 4;

  // Section B
  await sectionHeader("B.  PREVIOUS SCHOOL");
  await row2("Name of Previous School", "Last Grade / Form Completed");
  await ensureSpace(ROW);
  field("Year Left", margin, y, thirdW);
  field("Reason for Leaving", margin + thirdW + 4, y, thirdW * 2 + 4);
  y += ROW;
  y += SECTION_GAP - 4;

  // Section C
  await sectionHeader("C.  PARENT / GUARDIAN DETAILS");
  await row2("Father's Full Name", "Occupation");
  await row2("Father's Contact Number", "Father's Email");
  await row2("Mother's Full Name", "Occupation");
  await row2("Mother's Contact Number", "Mother's Email");
  await row2("Guardian (if not parent)", "Relationship to Learner");
  await row2("Guardian Contact Number", "Residential Address");
  y += SECTION_GAP - 4;

  // Section D
  await sectionHeader("D.  MEDICAL INFORMATION");
  await row2("Known Allergies", "Chronic Conditions");
  await row2("Medical Aid Provider", "Medical Aid Number");
  await row2("Emergency Contact Name", "Emergency Contact Number");
  y += SECTION_GAP - 4;

  // Section E
  await sectionHeader("E.  DOCUMENTS TO ATTACH");
  const docs = [
    "Certified copy of Birth Certificate",
    "Last school report (most recent)",
    "Transfer letter from previous school",
    "Two (2) passport-size photographs",
    "Copy of parent/guardian National ID",
    "Proof of residence",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const d of docs) {
    await ensureSpace(7);
    doc.rect(margin, y - 3.6, 4, 4);
    doc.text(d, margin + 7, y);
    y += 7;
  }
  y += 4;

  // Section F
  await sectionHeader("F.  PARENT / GUARDIAN DECLARATION");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const decl =
    "I declare that the information given above is true and correct to the best of my knowledge. I undertake to pay all school fees and levies on time, and to abide by the rules and regulations of Progress Christian College.";
  const lines = doc.splitTextToSize(decl, fullW);
  await ensureSpace(lines.length * 5 + 8);
  doc.text(lines, margin, y);
  y += lines.length * 5 + 6;
  await row2("Signature of Parent / Guardian", "Date");
  y += SECTION_GAP - 2;

  // Office use
  await sectionHeader("FOR OFFICE USE ONLY");
  await row3("Date Received", "Received By", "Registration Number Assigned");
  await row2("Approved By (Principal)", "Signature & Date");

  drawFooter();
  doc.save(`Application_Form_${year}.pdf`);
};
