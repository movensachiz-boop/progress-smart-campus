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
    const logoW = 22;
    logoH = 22;
    doc.addImage(img, "PNG", pageW / 2 - logoW / 2, 8, logoW, logoH);
  } catch {}

  // Letterhead
  const headerY = logoH > 0 ? 32 : 8;
  doc.setFillColor(0, 51, 102);
  doc.rect(0, headerY, pageW, 22, "F");
  doc.setTextColor(255, 215, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, headerY + 8, { align: "center" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Bonnyvale Campus, Gweru  |  +263 77 400 0143", pageW / 2, headerY + 14, { align: "center" });
  doc.setTextColor(255, 215, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`STUDENT APPLICATION FORM — ${year}`, pageW / 2, headerY + 20, { align: "center" });

  let y = headerY + 30;
  doc.setTextColor(0, 0, 0);

  // Helper to draw a labeled blank line
  const field = (label: string, x: number, yy: number, width: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 51, 102);
    doc.text(label.toUpperCase(), x, yy);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.line(x, yy + 4.2, x + width, yy + 4.2);
  };

  const sectionHeader = (title: string) => {
    doc.setFillColor(0, 51, 102);
    doc.rect(margin, y, pageW - margin * 2, 6, "F");
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin + 2, y + 4.2);
    y += 9;
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

  // Section A — Applicant details
  sectionHeader("A.  APPLICANT (LEARNER) DETAILS");
  field("Surname", margin, y, halfW);
  field("First Name(s)", margin + halfW + 4, y, halfW);
  y += 10;
  field("Date of Birth", margin, y, thirdW);
  field("Gender", margin + thirdW + 4, y, thirdW);
  field("Nationality", margin + (thirdW + 4) * 2, y, thirdW);
  y += 10;
  field("National ID / Birth Cert. No.", margin, y, halfW);
  field("Religion / Denomination", margin + halfW + 4, y, halfW);
  y += 10;
  field("Home Address", margin, y, fullW);
  y += 10;
  field("Form Applying For (1-6)", margin, y, thirdW);
  field("Learning Area / Stream", margin + thirdW + 4, y, thirdW);
  field("Day Scholar / Boarder", margin + (thirdW + 4) * 2, y, thirdW);
  y += 12;

  // Section B — Previous school
  sectionHeader("B.  PREVIOUS SCHOOL");
  field("Name of Previous School", margin, y, halfW);
  field("Last Grade / Form Completed", margin + halfW + 4, y, halfW);
  y += 10;
  field("Year Left", margin, y, thirdW);
  field("Reason for Leaving", margin + thirdW + 4, y, thirdW * 2 + 4);
  y += 12;

  // Section C — Parent / Guardian
  sectionHeader("C.  PARENT / GUARDIAN DETAILS");
  field("Father's Full Name", margin, y, halfW);
  field("Occupation", margin + halfW + 4, y, halfW);
  y += 10;
  field("Father's Contact Number", margin, y, halfW);
  field("Father's Email", margin + halfW + 4, y, halfW);
  y += 10;
  field("Mother's Full Name", margin, y, halfW);
  field("Occupation", margin + halfW + 4, y, halfW);
  y += 10;
  field("Mother's Contact Number", margin, y, halfW);
  field("Mother's Email", margin + halfW + 4, y, halfW);
  y += 10;
  field("Guardian (if not parent)", margin, y, halfW);
  field("Relationship to Learner", margin + halfW + 4, y, halfW);
  y += 10;
  field("Guardian Contact Number", margin, y, halfW);
  field("Residential Address", margin + halfW + 4, y, halfW);
  y += 12;

  // Section D — Medical
  sectionHeader("D.  MEDICAL INFORMATION");
  field("Known Allergies", margin, y, halfW);
  field("Chronic Conditions", margin + halfW + 4, y, halfW);
  y += 10;
  field("Medical Aid Provider", margin, y, halfW);
  field("Medical Aid Number", margin + halfW + 4, y, halfW);
  y += 10;
  field("Emergency Contact Name", margin, y, halfW);
  field("Emergency Contact Number", margin + halfW + 4, y, halfW);
  y += 12;

  // Section E — Documents checklist
  sectionHeader("E.  DOCUMENTS TO ATTACH");
  const docs = [
    "Certified copy of Birth Certificate",
    "Last school report (most recent)",
    "Transfer letter from previous school",
    "Two (2) passport-size photographs",
    "Copy of parent/guardian National ID",
    "Proof of residence",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  docs.forEach((d) => {
    doc.rect(margin, y - 3.2, 3.5, 3.5);
    doc.text(d, margin + 6, y);
    y += 5.2;
  });
  y += 4;

  // Section F — Declaration
  if (y > pageH - 55) { doc.addPage(); y = margin; }
  sectionHeader("F.  PARENT / GUARDIAN DECLARATION");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const decl =
    "I declare that the information given above is true and correct to the best of my knowledge. I undertake to pay all school fees and levies on time, and to abide by the rules and regulations of Progress Christian College.";
  const lines = doc.splitTextToSize(decl, fullW);
  doc.text(lines, margin, y);
  y += lines.length * 4.5 + 6;

  field("Signature of Parent / Guardian", margin, y, halfW);
  field("Date", margin + halfW + 4, y, halfW);
  y += 14;

  // Office use only
  sectionHeader("FOR OFFICE USE ONLY");
  field("Date Received", margin, y, thirdW);
  field("Received By", margin + thirdW + 4, y, thirdW);
  field("Registration Number Assigned", margin + (thirdW + 4) * 2, y, thirdW);
  y += 10;
  field("Approved By (Principal)", margin, y, halfW);
  field("Signature & Date", margin + halfW + 4, y, halfW);

  // Footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Progress Christian College — Bonnyvale Campus  |  Student Application Form ${year}`,
    pageW / 2,
    pageH - 8,
    { align: "center" },
  );

  doc.save(`Application_Form_${year}.pdf`);
};
