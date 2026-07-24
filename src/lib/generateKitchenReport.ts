import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type KitchenReportKind = "stock" | "receipts" | "issues" | "meals";

export interface KitchenStockRow {
  name: string; category: string; unit: string;
  stock_quantity: number; low_stock_threshold: number;
  unit_cost: number; currency: string; supplier?: string | null;
}
export interface KitchenReceiptRow {
  receipt_number: string; date: string; item: string; unit: string;
  quantity: number; unit_cost: number; total_cost: number; supplier?: string | null; invoice?: string | null;
}
export interface KitchenIssueRow {
  issue_number: string; date: string; item: string; unit: string;
  quantity: number; purpose?: string | null;
}
export interface KitchenMealRow {
  meal_number: string; date: string; meal_name: string; meal_type: string;
  portions_served: number; total_cost: number; cost_per_portion: number;
}

interface GenArgs {
  kind: KitchenReportKind;
  title: string;
  subtitle?: string;
  rows: any[];
  dateRange?: { from?: string; to?: string };
}

const fmtMoney = (n: number) => `US$ ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

export const generateKitchenReport = async (args: GenArgs) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210, ph = 297, margin = 15;
  const blue: [number, number, number] = [41, 128, 185];
  const primary: [number, number, number] = [0, 51, 102];
  let y = 12;

  doc.setDrawColor(...blue);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, pw - 16, ph - 16);

  try {
    const logoModule = await import("@/assets/pcc-logo.png");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoModule.default;
    });
    doc.addImage(img, "PNG", margin, y, 22, 22);
  } catch {}

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text("PROGRESS CHRISTIAN COLLEGE", margin + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text("11729 Mkoba 14, Gweru, Zimbabwe", margin + 26, y + 11);
  doc.text("Tel: +263 77 400 0143  |  www.progresscentresys.com", margin + 26, y + 15);
  doc.text("Email: info@progresscentresys.com", margin + 26, y + 19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.setFontSize(9);
  doc.text("KITCHEN DEPARTMENT", margin + 26, y + 24);
  y += 30;

  doc.setFillColor(...blue);
  doc.rect(margin, y, pw - 2 * margin, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(args.title.toUpperCase(), pw / 2, y + 6, { align: "center" });
  y += 13;

  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleString();
  doc.text(`Generated: ${dateStr}`, margin, y);
  if (args.dateRange?.from || args.dateRange?.to) {
    doc.text(`Period: ${args.dateRange.from || "—"} to ${args.dateRange.to || "—"}`, pw - margin, y, { align: "right" });
  }
  y += 5;
  if (args.subtitle) {
    doc.text(args.subtitle, margin, y);
    y += 5;
  }

  let head: string[][] = [];
  let body: any[][] = [];
  let foot: any[][] | undefined;

  if (args.kind === "stock") {
    head = [["#", "Item", "Category", "Unit", "On hand", "Reorder at", "Unit Cost", "Stock Value", "Supplier"]];
    let total = 0;
    body = (args.rows as KitchenStockRow[]).map((r, i) => {
      const value = (r.stock_quantity || 0) * (r.unit_cost || 0);
      total += value;
      const low = r.stock_quantity <= r.low_stock_threshold;
      return [
        i + 1, r.name, r.category, r.unit,
        { content: fmtQty(r.stock_quantity), styles: { textColor: low ? [200, 30, 30] : [0, 0, 0], fontStyle: low ? "bold" : "normal" } },
        fmtQty(r.low_stock_threshold), fmtMoney(r.unit_cost), fmtMoney(value), r.supplier || "—"
      ];
    });
    foot = [[{ content: "TOTAL STOCK VALUE", colSpan: 7, styles: { halign: "right", fontStyle: "bold" } }, { content: fmtMoney(total), styles: { fontStyle: "bold" } }, ""]];
  } else if (args.kind === "receipts") {
    head = [["#", "KRC #", "Date", "Item", "Qty", "Unit", "Unit Cost", "Total", "Supplier", "Invoice"]];
    let total = 0;
    body = (args.rows as KitchenReceiptRow[]).map((r, i) => {
      total += Number(r.total_cost || 0);
      return [i + 1, r.receipt_number, r.date, r.item, fmtQty(r.quantity), r.unit, fmtMoney(r.unit_cost), fmtMoney(r.total_cost), r.supplier || "—", r.invoice || "—"];
    });
    foot = [[{ content: "TOTAL DELIVERIES", colSpan: 7, styles: { halign: "right", fontStyle: "bold" } }, { content: fmtMoney(total), styles: { fontStyle: "bold" } }, "", ""]];
  } else if (args.kind === "issues") {
    head = [["#", "KIS #", "Date", "Item", "Qty", "Unit", "Purpose"]];
    body = (args.rows as KitchenIssueRow[]).map((r, i) => [i + 1, r.issue_number, r.date, r.item, fmtQty(r.quantity), r.unit, r.purpose || "—"]);
  } else if (args.kind === "meals") {
    head = [["#", "Meal #", "Date", "Meal", "Type", "Portions", "Total Cost", "Cost / portion"]];
    let totCost = 0, totPort = 0;
    body = (args.rows as KitchenMealRow[]).map((r, i) => {
      totCost += Number(r.total_cost || 0);
      totPort += Number(r.portions_served || 0);
      return [i + 1, r.meal_number, r.date, r.meal_name, r.meal_type, r.portions_served, fmtMoney(r.total_cost), fmtMoney(r.cost_per_portion)];
    });
    const avg = totPort > 0 ? totCost / totPort : 0;
    foot = [[
      { content: "TOTALS", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      { content: totPort.toLocaleString(), styles: { fontStyle: "bold" } },
      { content: fmtMoney(totCost), styles: { fontStyle: "bold" } },
      { content: `Avg ${fmtMoney(avg)}`, styles: { fontStyle: "bold" } },
    ]];
  }

  autoTable(doc, {
    head, body, foot,
    startY: y,
    margin: { left: margin, right: margin, bottom: 18 },
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [230, 230, 230], textColor: 0 },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    didDrawPage: () => {
      const total = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Page ${(doc as any).internal.getCurrentPageInfo().pageNumber} of ${total}`, pw - margin, ph - 10, { align: "right" });
      doc.text("Progress Christian College — Kitchen Stock Report", margin, ph - 10);
    },
  });

  doc.save(`Kitchen_${args.kind}_${new Date().toISOString().split("T")[0]}.pdf`);
};
