import jsPDF from "jspdf";

export interface BusinessLetterOptions {
  recipientName?: string;
  recipientAddress?: string;
  senderAddress?: string;
  date?: string;
  subject?: string;
  salutation?: string;
  body: string;
  closing?: string;
  senderName?: string;
  senderTitle?: string;
  reference?: string;
}

export const generateBusinessLetter = async (opts: BusinessLetterOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;

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

  // Letterhead bar
  const headerY = logoH > 0 ? 32 : 8;
  doc.setFillColor(0, 51, 102);
  doc.rect(0, headerY, pageW, 20, "F");
  doc.setTextColor(255, 215, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, headerY + 8, { align: "center" });
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Bonnyvale Campus, Gweru  |  +263 77 400 0143  |  info@progresschristiansys.com", pageW / 2, headerY + 14, { align: "center" });

  // Gold separator
  doc.setDrawColor(255, 215, 0);
  doc.setLineWidth(0.8);
  doc.line(margin, headerY + 22, pageW - margin, headerY + 22);

  let y = headerY + 30;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  // Sanitize unicode chars that helvetica can't render (bullets, smart quotes, dashes)
  const sanitize = (s: string) => s
    .replace(/[•·●∙]/g, "- ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");

  // Sender address (right side)
  let senderEndY = y;
  if (opts.senderAddress) {
    const senderLines = sanitize(opts.senderAddress).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    senderLines.forEach(line => {
      doc.text(line, pageW - margin, senderEndY, { align: "right" });
      senderEndY += 5;
    });
  }

  // Reference (left)
  if (opts.reference) {
    doc.text(`Ref: ${sanitize(opts.reference)}`, margin, y);
  }
  // Date sits below the sender address block
  y = Math.max(senderEndY, y + 5);
  const dateStr = opts.date || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  doc.text(dateStr, pageW - margin, y, { align: "right" });
  y += 10;

  // Recipient (left side)
  if (opts.recipientName) {
    doc.setFont("helvetica", "bold");
    doc.text(sanitize(opts.recipientName), margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
  }
  if (opts.recipientAddress) {
    const addrLines = sanitize(opts.recipientAddress).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    addrLines.forEach(line => {
      doc.text(line, margin, y);
      y += 5;
    });
  }
  y += 4;

  // Salutation
  doc.text(sanitize(opts.salutation || "Dear Sir/Madam,"), margin, y);
  y += 8;

  // Subject - strip any existing RE: prefix to avoid "RE: RE:"
  if (opts.subject) {
    doc.setFont("helvetica", "bold");
    const cleanSubject = sanitize(opts.subject).replace(/^\s*RE\s*:\s*/i, "").trim();
    const subjLines = doc.splitTextToSize(`RE: ${cleanSubject.toUpperCase()}`, contentW);
    doc.text(subjLines, margin, y);
    const w = doc.getTextWidth(subjLines[0]);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 1, margin + w, y + 1);
    y += subjLines.length * 5 + 4;
    doc.setFont("helvetica", "normal");
  }

  // Body - preserve paragraphs
  const paragraphs = (opts.body || "").split(/\n\s*\n/);
  paragraphs.forEach(p => {
    const clean = p.replace(/\s*\n\s*/g, " ").trim();
    if (!clean) return;
    const lines = doc.splitTextToSize(clean, contentW);
    // page break
    lines.forEach((line: string) => {
      if (y > pageH - 50) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y, { align: "justify", maxWidth: contentW });
      y += 5.5;
    });
    y += 3;
  });

  y += 6;
  if (y > pageH - 40) { doc.addPage(); y = margin; }

  // Closing
  doc.text(opts.closing || "Yours faithfully,", margin, y);
  y += 18;

  // Signature line
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, y, margin + 70, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(opts.senderName || "", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (opts.senderTitle) doc.text(opts.senderTitle, margin, y);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Progress Christian College • Bonnyvale Campus, Gweru, Zimbabwe",
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );

  const fname = `letter_${(opts.subject || "business").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}.pdf`;
  doc.save(fname);
};
