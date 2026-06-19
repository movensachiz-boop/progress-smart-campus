import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export interface StudentReportInput {
  id: string;
  registration_number: string;
  first_name: string;
  last_name: string;
  form?: string | null;
  stream?: string | null;
  gender?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  status?: string | null;
  total_fees?: number;
  total_paid?: number;
  computed_balance?: number;
  payment_status?: string;
}

export async function generateStudentReport(student: StudentReportInput) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Pioneer Christian College", pageWidth / 2, 12, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Student Comprehensive Report", pageWidth / 2, 20, { align: "center" });

  doc.setTextColor(51, 51, 51);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 34, { align: "right" });

  // Student details
  let y = 42;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 51, 102);
  doc.text(`${student.first_name} ${student.last_name}`.toUpperCase(), 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.text(`Reg No: ${student.registration_number}`, 14, y);
  y += 5;
  doc.text(`Form: ${student.form || "—"}   Stream: ${student.stream || "—"}   Gender: ${student.gender || "—"}   Status: ${student.status || "—"}`, 14, y);
  y += 5;
  doc.text(`Guardian: ${student.guardian_name || "—"}   Phone: ${student.guardian_phone || "—"}`, 14, y);
  y += 6;

  // Fees summary box
  const totalFees = student.total_fees ?? 0;
  const totalPaid = student.total_paid ?? 0;
  const bal = student.computed_balance ?? totalFees - totalPaid;
  doc.setFillColor(245, 247, 250);
  doc.rect(14, y, pageWidth - 28, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 51, 102);
  doc.text("FEES SUMMARY", 18, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 51, 51);
  doc.text(`Total Expected: $${totalFees.toFixed(2)}`, 18, y + 13);
  doc.text(`Total Paid: $${totalPaid.toFixed(2)}`, 80, y + 13);
  const balLabel = bal > 0 ? `Outstanding: $${bal.toFixed(2)}` : bal < 0 ? `Overpaid: $${Math.abs(bal).toFixed(2)}` : "Cleared";
  doc.setFont("helvetica", "bold");
  doc.setTextColor(bal > 0 ? 200 : bal < 0 ? 0 : 0, bal > 0 ? 30 : bal < 0 ? 102 : 128, bal > 0 ? 30 : bal < 0 ? 204 : 0);
  doc.text(balLabel, 140, y + 13);
  y += 28;

  // Fetch payments
  const { data: payments } = await supabase
    .from("payments")
    .select("created_at, amount, method, receipt_number, description, status")
    .eq("student_profile_id", student.id)
    .order("created_at", { ascending: false });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 51, 102);
  doc.text("Payment History", 14, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Date", "Amount", "Method", "Receipt", "Description", "Status"]],
    body: (payments || []).map((p: any) => [
      p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
      `$${Number(p.amount).toFixed(2)}`,
      p.method || "—",
      p.receipt_number || "—",
      p.description || "—",
      p.status || "—",
    ]),
    theme: "grid",
    headStyles: { fillColor: [0, 51, 102], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Attendance summary
  const { data: att } = await supabase
    .from("attendance")
    .select("status")
    .eq("student_profile_id", student.id);
  const attTotal = att?.length || 0;
  const present = att?.filter(a => a.status === "present").length || 0;
  const absent = att?.filter(a => a.status === "absent").length || 0;
  const late = att?.filter(a => a.status === "late").length || 0;
  const attPct = attTotal ? Math.round(((present + late) / attTotal) * 100) : 0;

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 51, 102);
  doc.text("Attendance Summary", 14, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [["Total Days", "Present", "Absent", "Late", "Attendance %"]],
    body: [[String(attTotal), String(present), String(absent), String(late), `${attPct}%`]],
    theme: "grid",
    headStyles: { fillColor: [0, 51, 102], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Exam results
  const { data: results } = await supabase
    .from("exam_results")
    .select("subject, mark, grade, exam_id, exams(name, term, year)")
    .eq("student_profile_id", student.id);

  if (results && results.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 51, 102);
    doc.text("Academic Performance", 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [["Exam", "Term", "Year", "Subject", "Mark", "Grade"]],
      body: results.map((r: any) => [
        r.exams?.name || "—",
        r.exams?.term || "—",
        r.exams?.year || "—",
        r.subject || "—",
        r.mark != null ? String(r.mark) : "—",
        r.grade || "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [0, 51, 102], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Pioneer Christian College · Confidential · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 8,
      { align: "center" }
    );
  }

  doc.save(`Student_Report_${student.registration_number}.pdf`);
}
