import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import pccLogo from "@/assets/pcc-logo.png";

export interface TermCalendarInput {
  term?: string;
  year?: string;
}

const loadImage = (src: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });

/** Cycle ending -> activities. Source: 2026 Term 3 road map. */
export const TERM3_2026_CYCLES: { cycle: string; activities: string[] }[] = [
  {
    cycle: "SEPTEMBER 15",
    activities: [
      "07 CHECK-IN FOR BOARDERS (TIME 1400 HRS)",
      "07 DEPARTMENTAL MEETINGS",
      "07 HBC PROJECTS FINAL ASSESSMENT (EXAM CLASSES)",
      "07 SUBMISSION OF PREFECTS NOMINATIONS FOR 2026 - 2027 ACADEMIC YEAR",
      "08 - 14 MOCK EXAMS IN PROGRESS (EXAM CLASSES)",
      "08 OPENING DAY AND LEARNER EXERCISE BOOK INSPECTION",
      "11 ASSEMBLY AND OPENING CHURCH SERVICE",
      "11 SCHEMES OF WORK TO PRINCIPAL (JNR CLASSES)",
      "11 CAREERS DAY (JNR CLASSES - RELEVANT STAKEHOLDERS)",
      "15 STATE OF RECORD OF MARKS TO PRINCIPAL",
      "15 REGISTERS TO THE SENIOR TEACHERS",
      "STUDENT DIRECTOR DIALOGUE",
    ],
  },
  {
    cycle: "SEPTEMBER 23",
    activities: [
      "16 MID-TERM EXAMS TO HODs (JNR CLASSES)",
      "LESSON OBSERVATIONS BY HODs AND ADMIN",
      "18 MID-TERM EXAMS QUALITY CONTROL",
      "22 PRE-EXAM PREP SESSION FOR INVIGILATORS CUM STAFF DEVELOPMENT",
      "23 REGISTERS TO SENIOR TEACHERS",
      "23 FORM THREEs CHOOSE SUBJECTS",
      "STUDENT DIRECTOR DIALOGUE",
    ],
  },
  {
    cycle: "OCTOBER 01",
    activities: [
      "24 SEPT PRE-EXAM PREP SESSION FOR CANDIDATES",
      "BOOKS AND RECORDS SUPERVISION BY HODs",
      "25 CIVIES DAY AND CHURCH SERVICE (SEND OFF FOR CANDIDATES)",
      "25 ANNOUNCEMENT OF PREFECTS FOR THE 2026 - 2027 ACADEMIC YEAR",
      "26 PREFECTS AND LEAVERS PARTY",
      "28 SEPT CAMBRIDGE EXAMINATIONS COMMENCE",
      "29 SEPT HBC PROJECTS AUDIT (JNR CLASSES)",
      "01 REGISTERS TO SENIOR TEACHERS",
      "STUDENT DIRECTOR DIALOGUE",
    ],
  },
  {
    cycle: "OCTOBER 09",
    activities: [
      "SCHEMES OF WORK SUPERVISION BY HODs",
      "CAMBRIDGE EXTERNAL EXAMINATIONS IN PROGRESS",
      "09 REGISTERS TO SENIOR TEACHERS",
      "STUDENT DIRECTOR DIALOGUE",
    ],
  },
  {
    cycle: "OCTOBER 19",
    activities: [
      "12 - 15 MID-TERM EXAMS (JNR CLASSES)",
      "19 MID-TERM NEWSLETTER TO PARENTS",
      "19 COMPLETION OF MARK SCHEDULES",
      "STUDENT DIRECTOR DIALOGUE",
      "REGISTERS TO SENIOR TEACHERS",
      "CAMBRIDGE EXAMS IN PROGRESS",
    ],
  },
  {
    cycle: "OCTOBER 27",
    activities: [
      "21 ONLINE PROGRESS REPORTS TO PARENTS",
      "22 EXEAT WEEKEND (NON-EXAM CLASSES)",
      "REVISION OF MID-TERM EXAMS",
      "26 SUBMISSION OF END OF YEAR EXAMS TO HODs",
      "27 END OF YEAR EXAMS QUALITY CONTROL",
      "STUDENT DIRECTOR DIALOGUE",
      "MID-TERM TARGETS REVIEW",
      "CAMBRIDGE EXAMS IN PROGRESS",
    ],
  },
  {
    cycle: "NOVEMBER 04",
    activities: [
      "LESSON OBSERVATIONS BY HODs AND ADMIN",
      "29 OCT MID-TERM DEPARTMENTAL MEETINGS",
      "30 CIVIES DAY AND CHURCH SERVICE",
      "30 GUIDANCE AND COUNSELLING SESSION (ZRP, MSU, SOCIAL WELFARE)",
      "04 LEARNER NOTE-BOOKS INSPECTION",
    ],
  },
  {
    cycle: "NOVEMBER 12",
    activities: [
      "05 HBC PROJECTS AUDIT",
      "05 EXTERNAL SUPERVISION",
      "11 CAREER GUIDANCE",
      "REGISTERS TO SENIOR TEACHERS",
    ],
  },
  {
    cycle: "NOVEMBER 20",
    activities: [
      "16 - 24 END OF YEAR EXAMS",
      "13 CAMBRIDGE EXAMS END",
      "19 HOSTEL SUPERVISION",
      "SCHEMES OF WORK SUPERVISION BY HODs AND ADMIN",
      "STUDENT DIRECTOR DIALOGUE",
      "20 RELEASE OF EXAMINATION FEES BASED ON THE NOVEMBER SERIES TO FORM THREE PARENTS (PLANNING PURPOSES)",
    ],
  },
  {
    cycle: "NOVEMBER 30",
    activities: [
      "STUDENT DIRECTOR DIALOGUE",
      "MARKING AND REVISION OF END OF YEAR EXAMS",
      "30 COMPLETION OF MARK SCHEDULES",
      "02 COMPLETION OF REPORTS AND SUBMISSION FOR SIGNING BY ADMIN",
    ],
  },
  {
    cycle: "DECEMBER 03",
    activities: [
      "02 DEPARTMENTAL MEETINGS",
      "02 END OF TERM STAFF MEETING",
      "03 SUBMISSION OF REGISTERS AND SUBMISSION OF RECORD OF MARKS",
      "03 CONSULTATION DAY",
      "03 CLOSING DAY",
    ],
  },
];

export const generateTermCalendar = async (input: TermCalendarInput = {}) => {
  const term = input.term || "TERM 3";
  const year = input.year || "2026";

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await loadImage(pccLogo).catch(() => "");
  const pageW = 210;
  const pageH = 297;
  const black: [number, number, number] = [0, 0, 0];
  const gray: [number, number, number] = [80, 80, 80];

  const header = () => {
    doc.setFillColor(...black);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setFillColor(...gray);
    doc.rect(0, 30, pageW, 1.2, "F");
    if (logo) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(7, 3.5, 23, 23, 2, 2, "F");
        doc.addImage(logo, "PNG", 8, 4, 21, 21);
      } catch { /* ignore */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PROGRESS CHRISTIAN COLLEGE", 34, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Lot E Bonnyvale, Shurugwi Road, Gweru  •  Tel: 0773107774", 34, 16.5);
    doc.text("progresschristiancollege@gmail.com", 34, 21);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${year} ${term.toUpperCase()} ROAD MAP`, 34, 26.5);
  };

  const footer = () => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      "Progress Christian College (Boarding School) — Lot E Bonnyvale, Shurugwi Road, Gweru  •  0773107774",
      pageW / 2,
      pageH - 7,
      { align: "center" }
    );
  };

  const body = TERM3_2026_CYCLES.map((c) => [
    c.cycle,
    c.activities.map((a) => `•  ${a}`).join("\n"),
  ]);

  autoTable(doc, {
    startY: 38,
    head: [["CYCLE ENDING", "ACTIVITY"]],
    body,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 3,
      valign: "top",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
    },
    headStyles: { fillColor: black, textColor: 255, fontSize: 9.5, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 150 },
    },
    margin: { left: 10, right: 10, top: 38, bottom: 14 },
    didDrawPage: () => { header(); footer(); },
  });

  doc.save(`PCC-${year}-${term.replace(/\s+/g, "-")}-Road-Map.pdf`);
};
