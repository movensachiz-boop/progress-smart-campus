import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

const courses = [
  { name: "Mathematics", code: "MATH401", teacher: "Mr. Otieno", grade: "A-", credits: 4 },
  { name: "Physics", code: "PHY401", teacher: "Mrs. Kamau", grade: "B+", credits: 3 },
  { name: "Chemistry", code: "CHEM401", teacher: "Dr. Njoroge", grade: "A", credits: 3 },
  { name: "English", code: "ENG401", teacher: "Ms. Wanjiku", grade: "B", credits: 3 },
  { name: "Biology", code: "BIO401", teacher: "Mr. Mwangi", grade: "A-", credits: 3 },
  { name: "Geography", code: "GEO401", teacher: "Mrs. Achieng", grade: "B+", credits: 2 },
];

const StudentCourses = () => (
  <DashboardLayout role="student">
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">My Courses</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => (
          <Card key={c.code} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary"><BookOpen size={18} /></div>
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{c.code}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Teacher</span><span className="text-foreground">{c.teacher}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Credits</span><span className="text-foreground">{c.credits}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Grade</span><Badge className="bg-success text-success-foreground">{c.grade}</Badge></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default StudentCourses;
