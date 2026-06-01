import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportDef {
  name: string;
  type: string;
  date: string;
  headers: string[];
  rows: string[][];
  filename: string;
}

const reports: ReportDef[] = [
  {
    name: "Term 1 Fee Collection Summary",
    type: "Financial",
    date: "2025-03-30",
    filename: "fee_collection_summary",
    headers: ["Form", "Students", "Total Fees", "Collected", "Outstanding", "Collection Rate"],
    rows: [
      ["Form 1", "220", "$99,000", "$85,000", "$14,000", "85.9%"],
      ["Form 2", "210", "$94,500", "$82,000", "$12,500", "86.8%"],
      ["Form 3", "200", "$90,000", "$85,000", "$5,000", "94.4%"],
      ["Form 4", "215", "$96,750", "$93,000", "$3,750", "96.1%"],
      ["Form 5", "195", "$87,750", "$72,000", "$15,750", "82.1%"],
      ["Form 6", "207", "$93,150", "$83,000", "$10,150", "89.1%"],
      ["Total", "1,247", "$561,150", "$500,000", "$61,150", "89.1%"],
    ],
  },
  {
    name: "Outstanding Balances by Form",
    type: "Financial",
    date: "2025-03-28",
    filename: "outstanding_balances",
    headers: ["Reg No", "Student Name", "Form", "Total Fees", "Paid", "Outstanding", "Status"],
    rows: [
      ["G0042O", "Grace Otieno", "2", "$4,500", "$3,800", "$700", "Partially Paid"],
      ["D0033O", "David Omondi", "3", "$4,500", "$3,300", "$1,200", "Partially Paid"],
      ["J0001M", "James Mwangi", "4", "$4,500", "$4,050", "$450", "Partially Paid"],
      ["F0088N", "Faith Njeri", "1", "$4,500", "$4,050", "$450", "Partially Paid"],
      ["J0071K", "John Kiplagat", "4", "$4,500", "$4,200", "$300", "Partially Paid"],
      ["S0099A", "Sarah Achieng", "2", "$4,500", "$4,350", "$150", "Partially Paid"],
    ],
  },
  {
    name: "Payment Method Analysis",
    type: "Analytics",
    date: "2025-03-25",
    filename: "payment_method_analysis",
    headers: ["Payment Method", "Transactions", "Total Amount", "Percentage"],
    rows: [
      ["Bank Transfer", "156", "$225,000", "45%"],
      ["Mobile Money", "122", "$175,000", "35%"],
      ["Card Payment", "52", "$75,000", "15%"],
      ["Cash", "18", "$25,000", "5%"],
      ["Total", "348", "$500,000", "100%"],
    ],
  },
  {
    name: "Student Enrollment Report",
    type: "Academic",
    date: "2025-03-20",
    filename: "student_enrollment",
    headers: ["Form", "Male", "Female", "Total", "Science", "Arts", "Commerce"],
    rows: [
      ["Form 1", "115", "105", "220", "80", "85", "55"],
      ["Form 2", "108", "102", "210", "75", "80", "55"],
      ["Form 3", "105", "95", "200", "70", "78", "52"],
      ["Form 4", "112", "103", "215", "82", "75", "58"],
      ["Form 5", "100", "95", "195", "68", "72", "55"],
      ["Form 6", "110", "97", "207", "76", "78", "53"],
      ["Total", "650", "597", "1,247", "451", "468", "328"],
    ],
  },
];

const toCsv = (r: ReportDef) =>
  [r.headers.join(","), ...r.rows.map((row) => row.join(","))].join("\n");

const downloadBlob = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const generatePdf = (r: ReportDef) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.setTextColor(0, 51, 102); // primary blue
  doc.text("Pioneer Christian College", 105, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.text(r.name, 105, 30, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.text(`${r.type} Report · Generated: ${r.date}`, 105, 37, { align: "center" });

  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.line(14, 42, 196, 42);

  // Table
  autoTable(doc, {
    startY: 48,
    head: [r.headers],
    body: r.rows,
    theme: "grid",
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: [51, 51, 51] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Pioneer Christian College · Page ${i} of ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  doc.save(`${r.filename}.pdf`);
};

const AdminReports = () => {
  const { toast } = useToast();

  const handleCSV = (r: ReportDef) => {
    downloadBlob(toCsv(r), `${r.filename}.csv`, "text/csv;charset=utf-8;");
    toast({ title: "CSV Downloaded", description: `${r.filename}.csv has been saved.` });
  };

  const handlePDF = (r: ReportDef) => {
    generatePdf(r);
    toast({ title: "PDF Downloaded", description: `${r.filename}.pdf has been saved.` });
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((r, i) => (
            <Card key={i} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="p-3 rounded-lg bg-primary/10 text-primary">
                  <FileText size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.type} · {r.date}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleCSV(r)}>
                    <Download size={14} /> CSV
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => handlePDF(r)}>
                    <FileDown size={14} /> PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminReports;
