import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimetableProvider } from "@/context/TimetableContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SetupAccount from "./pages/SetupAccount";
import ForgotPassword from "./pages/ForgotPassword";
import StudentDashboard from "./pages/StudentDashboard";
import StudentPayments from "./pages/StudentPayments";
import StudentTimetable from "./pages/StudentTimetable";
import StudentCourses from "./pages/StudentCourses";
import AdminDashboard from "./pages/AdminDashboard";
import AdminStudents from "./pages/AdminStudents";
import AdminPayments from "./pages/AdminPayments";
import AdminReports from "./pages/AdminReports";
import AdminSettings from "./pages/AdminSettings";
import AdminSubjects from "./pages/AdminSubjects";
import AdminTeachers from "./pages/AdminTeachers";
import AdminClasses from "./pages/AdminClasses";
import AdminTimetableGenerate from "./pages/AdminTimetableGenerate";
import AdminTimetableView from "./pages/AdminTimetableView";
import AdminMasterTimetable from "./pages/AdminMasterTimetable";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import AdminClassRoster from "./pages/AdminClassRoster";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherAttendance from "./pages/TeacherAttendance";
import TeacherClassRoster from "./pages/TeacherClassRoster";
import TeacherTimetable from "./pages/TeacherTimetable";
import NotFound from "./pages/NotFound";
import VerifyReceipt from "./pages/VerifyReceipt";
import AdminFees from "./pages/AdminFees";
import StudentRequirements from "./pages/StudentRequirements";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminAuditTrail from "./pages/AdminAuditTrail";
import AdminInventory from "./pages/AdminInventory";
import AdminProcurement from "./pages/AdminProcurement";
import AdminKitchen from "./pages/AdminKitchen";
import AdminFundTracker from "./pages/AdminFundTracker";
import StudentInventory from "./pages/StudentInventory";
import StaffGuard from "./components/StaffGuard";
import PhoneScan from "./pages/PhoneScan";
import AdminExams from "./pages/AdminExams";
import TeacherMarks from "./pages/TeacherMarks";
import StudentReports from "./pages/StudentReports";
import VerifyReport from "./pages/VerifyReport";
import ScanMarks from "./pages/ScanMarks";
import AdminPrincipalDocs from "./pages/AdminPrincipalDocs";

// Sub-roles
const DENY_TM_AND_CASHIER: ("cashier" | "timetable_manager")[] = ["cashier", "timetable_manager"];
const DENY_TM: ("timetable_manager")[] = ["timetable_manager"];

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <TimetableProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/setup-account" element={<SetupAccount />} />
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/payments" element={<StudentPayments />} />
            <Route path="/student/timetable" element={<StudentTimetable />} />
            <Route path="/student/courses" element={<StudentCourses />} />
            <Route path="/student/announcements" element={<AnnouncementsPage role="student" />} />
            <Route path="/student/requirements" element={<StudentRequirements />} />
            <Route path="/student/shop" element={<StudentInventory />} />
            <Route path="/admin" element={<StaffGuard deny={DENY_TM_AND_CASHIER}><AdminDashboard /></StaffGuard>} />
            <Route path="/admin/students" element={<StaffGuard deny={DENY_TM}><AdminStudents /></StaffGuard>} />
            <Route path="/admin/payments" element={<StaffGuard deny={DENY_TM}><AdminPayments /></StaffGuard>} />
            <Route path="/admin/reports" element={<StaffGuard deny={DENY_TM}><AdminReports /></StaffGuard>} />
            <Route path="/admin/announcements" element={<StaffGuard deny={DENY_TM}><AnnouncementsPage role="admin" /></StaffGuard>} />
            <Route path="/admin/settings" element={<StaffGuard deny={DENY_TM_AND_CASHIER}><AdminSettings /></StaffGuard>} />
            <Route path="/admin/subjects" element={<AdminSubjects />} />
            <Route path="/admin/teachers" element={<AdminTeachers />} />
            <Route path="/admin/classes" element={<AdminClasses />} />
            <Route path="/admin/timetable" element={<AdminTimetableGenerate />} />
            <Route path="/admin/timetable/view" element={<AdminTimetableView />} />
            <Route path="/admin/timetable/master" element={<AdminMasterTimetable />} />
            <Route path="/admin/roster" element={<StaffGuard deny={DENY_TM}><AdminClassRoster /></StaffGuard>} />
            <Route path="/admin/fees" element={<StaffGuard deny={DENY_TM}><AdminFees /></StaffGuard>} />
            <Route path="/admin/inventory" element={<StaffGuard deny={DENY_TM}><AdminInventory /></StaffGuard>} />
            <Route path="/admin/procurement" element={<StaffGuard deny={DENY_TM_AND_CASHIER}><AdminProcurement /></StaffGuard>} />
            <Route path="/admin/kitchen" element={<StaffGuard allow={["kitchen"]} deny={DENY_TM_AND_CASHIER}><AdminKitchen /></StaffGuard>} />
            <Route path="/admin/audit" element={<StaffGuard deny={DENY_TM_AND_CASHIER}><AdminAuditTrail /></StaffGuard>} />
            <Route path="/admin/funds" element={<StaffGuard deny={DENY_TM}><AdminFundTracker /></StaffGuard>} />
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/attendance" element={<TeacherAttendance />} />
            <Route path="/teacher/roster" element={<TeacherClassRoster />} />
            <Route path="/teacher/timetable" element={<TeacherTimetable />} />
            <Route path="/teacher/announcements" element={<AnnouncementsPage role="teacher" />} />
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/verify" element={<VerifyReceipt />} />
            <Route path="/verify-report/:examId/:studentId" element={<VerifyReport />} />
            <Route path="/scan-marks/:examId" element={<ScanMarks />} />
            <Route path="/admin/exams" element={<StaffGuard deny={DENY_TM}><AdminExams /></StaffGuard>} />
            <Route path="/admin/principal-docs" element={<StaffGuard deny={DENY_TM_AND_CASHIER}><AdminPrincipalDocs /></StaffGuard>} />
            <Route path="/teacher/marks" element={<TeacherMarks />} />
            <Route path="/student/results" element={<StudentReports />} />
            <Route path="/phone-scan/:sessionId" element={<PhoneScan />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TimetableProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
