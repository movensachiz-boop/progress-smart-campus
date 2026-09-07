import jsPDF from "jspdf";

export interface AgendaItem {
  time?: string;
  topic: string;
  presenter?: string;
}

export interface MeetingAgendaOptions {
  title: string;
  date?: string;
  time?: string;
  venue?: string;
  chairperson?: string;
  attendees?: string;
  items: AgendaItem[];
  notes?: string;
}

export const generateMeetingAgenda = async (opts: MeetingAgendaOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

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
    logoImg = null;
  }

  const logoH = logoImg ? 18 : 0;

  const drawHeader = () => {
    if (logoImg) doc.addImage(logoImg, "PNG", pageW / 2 - 9, 6, 18, logoH);

    const headerY = logoH > 0 ? 28 : 0;
    const headerH = logoH > 0 ? 20 : 22;
    doc.setFillColor(0, 51, 102);
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
    doc.text("MEETING PROGRAMME / AGENDA", pageW / 2, headerY + 18, { align: "center" });

    doc.setTextColor(0, 0, 0);
    return headerY + headerH;
  };

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Progress Christian College — Meeting Programme", pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  };

  let y = drawHeader() + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 51, 102);
  doc.text(opts.title.toUpperCase(), pageW / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  const meta: [string, string][] = [
    ["Date", opts.date || "____________"],
    ["Time", opts.time || "____________"],
    ["Venue", opts.venue || "____________"],
    ["Chairperson", opts.chairperson || "____________"],
  ];
  doc.setFontSize(9.5);
  meta.forEach((m, i) => {
    const col = i % 2;
    const x = margin + col * ((pageW - margin * 2) / 2);
    if (col === 0 && i > 0) y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`${m[0]}:`, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(m[1], x + 24, y);
  });
  y += 8;

  if (opts.attendees?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Attendees:", margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(opts.attendees.trim(), pageW - margin * 2 - 24);
    doc.text(lines, margin + 24, y);
    y += lines.length * 5 + 4;
  }

  // Table
  const cols = [
    { label: "#", w: 10 },
    { label: "Time", w: 24 },
    { label: "Agenda Item", w: 0 },
    { label: "Led By", w: 42 },
  ];
  const usableW = pageW - margin * 2;
  cols[2].w = usableW - (10 + 24 + 42);

  const drawTableHeader = () => {
    doc.setFillColor(230, 235, 245);
    doc.rect(margin, y, usableW, 8, "F");
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, usableW, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 51, 102);
    let x = margin;
    cols.forEach((c) => {
      doc.text(c.label, x + 2, y + 5.5);
      x += c.w;
      if (x < margin + usableW - 0.1) doc.line(x, y, x, y + 8);
    });
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
  };

  drawTableHeader();

  const items = opts.items.filter((i) => i.topic.trim());
  doc.setFontSize(9.5);
  items.forEach((item, idx) => {
    const topicLines = doc.splitTextToSize(item.topic.trim(), cols[2].w - 4);
    const rowH = Math.max(9, topicLines.length * 5 + 4);

    if (y + rowH > pageH - 20) {
      drawFooter();
      doc.addPage();
      y = drawHeader() + 10;
      drawTableHeader();
    }

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, usableW, rowH);
    let x = margin;
    cols.forEach((c, i) => {
      if (i < cols.length - 1) doc.line(x + c.w, y, x + c.w, y + rowH);
      x += c.w;
    });

    doc.text(String(idx + 1), margin + 2, y + 6);
    doc.text(item.time || "", margin + 10 + 2, y + 6);
    doc.text(topicLines, margin + 10 + 24 + 2, y + 6);
    doc.text(item.presenter || "", margin + 10 + 24 + cols[2].w + 2, y + 6);
    y += rowH;
  });

  y += 10;
  if (opts.notes?.trim()) {
    if (y > pageH - 40) { drawFooter(); doc.addPage(); y = drawHeader() + 10; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Notes / Resolutions", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const nl = doc.splitTextToSize(opts.notes.trim(), usableW);
    doc.text(nl, margin, y);
    y += nl.length * 5 + 6;
  }

  if (y < pageH - 30) {
    doc.setFontSize(9);
    doc.text("Chairperson's Signature: ______________________", margin, pageH - 24);
    doc.text("Date: ______________", pageW - margin - 50, pageH - 24);
  }

  drawFooter();
  doc.save(`${opts.title.replace(/[^a-z0-9]+/gi, "_")}_Agenda.pdf`);
};
