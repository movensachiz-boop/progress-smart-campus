import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface StaffDirectoryColumn {
  header: string;
  key: string;
}

export interface StaffDirectoryOptions {
  title: string;
  columns: StaffDirectoryColumn[];
  rows: Record<string, string>[];
  fileName: string;
}

const loadLogo = async (): Promise<HTMLImageElement | null> => {
  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Logo could not be loaded"));
      image.src = logoModule.default;
    });
    return image;
  } catch {
    return null;
  }
};

export const generateStaffDirectory = async (opts: StaffDirectoryOptions) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();

  const drawHeader = () => {
    if (logo) doc.addImage(logo, "PNG", pageW / 2 - 9, 5, 18, 18);

    doc.setFillColor(0, 51, 102);
    doc.rect(0, 27, pageW, 24, "F");
    doc.setTextColor(255, 215, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PROGRESS CHRISTIAN COLLEGE", pageW / 2, 34, { align: "center" });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.text("BONNYVALE, GWERU  |  +263 77 400 0143", pageW / 2, 40, { align: "center" });
    doc.setTextColor(255, 215, 0);
    doc.setFontSize(11);
    doc.text(opts.title.toUpperCase(), pageW / 2, 47, { align: "center" });
  };

  drawHeader();
  const body = opts.rows
    .filter((row) => opts.columns.some((column) => row[column.key]?.trim()))
    .map((row) => opts.columns.map((column) => row[column.key]?.trim() || ""));

  autoTable(doc, {
    startY: 59,
    head: [opts.columns.map((column) => column.header.toUpperCase())],
    body,
    theme: "grid",
    margin: { left: 14, right: 14, top: 59, bottom: 18 },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3.2,
      valign: "middle",
      textColor: [30, 41, 59],
      lineColor: [185, 196, 211],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: [255, 215, 0],
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [237, 242, 249] },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(255, 215, 0);
    doc.setLineWidth(0.6);
    doc.line(14, pageH - 14, pageW - 14, pageH - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Progress Christian College  |  Page ${page} of ${pageCount}`, pageW / 2, pageH - 8, { align: "center" });
  }

  doc.save(opts.fileName);
};