import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateTargetsForm } from "@/lib/generateTargetsForm";
import { FileDown, Target } from "lucide-react";
import { toast } from "sonner";

const AdminPrincipalDocs = () => {
  const [level, setLevel] = useState<"O" | "A">("O");
  const [studentName, setStudentName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [form, setForm] = useState("");
  const [stream, setStream] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [subjects, setSubjects] = useState("");

  const handleGenerate = async () => {
    try {
      const subjectList = subjects
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      await generateTargetsForm({
        level,
        studentName,
        regNo,
        form,
        stream,
        term,
        year,
        subjects: subjectList,
      });
      toast.success("Targets form generated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate");
    }
  };

  const handleBlank = async (lvl: "O" | "A") => {
    await generateTargetsForm({ level: lvl, term, year });
    toast.success(`Blank ${lvl}-Level targets form generated`);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Principal's Documents</h1>
          <p className="text-sm text-muted-foreground">Generate official school documents and forms.</p>
        </div>

        <Tabs defaultValue="targets">
          <TabsList>
            <TabsTrigger value="targets"><Target size={14} className="mr-1.5" /> Student Targets Form</TabsTrigger>
          </TabsList>

          <TabsContent value="targets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Student Academic Targets</CardTitle>
                <CardDescription>
                  Landscape A4 form with school logo. O-Level covers 10 subjects, A-Level covers 4 subjects.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Level</Label>
                    <Select value={level} onValueChange={(v) => setLevel(v as "O" | "A")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="O">O Level (10 subjects)</SelectItem>
                        <SelectItem value="A">A Level (4 subjects)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Term</Label>
                    <Select value={term} onValueChange={setTerm}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Term 1">Term 1</SelectItem>
                        <SelectItem value="Term 2">Term 2</SelectItem>
                        <SelectItem value="Term 3">Term 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Year</Label>
                    <Input value={year} onChange={(e) => setYear(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Student Name (optional)</Label>
                    <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Leave blank for fillable form" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Registration No. (optional)</Label>
                    <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Form (optional)</Label>
                    <Input value={form} onChange={(e) => setForm(e.target.value)} placeholder="e.g. Form 4" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stream / Class (optional)</Label>
                    <Input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="e.g. Blue / Sciences" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Subjects (optional — one per line or comma separated)</Label>
                  <Textarea
                    rows={5}
                    value={subjects}
                    onChange={(e) => setSubjects(e.target.value)}
                    placeholder={level === "O"
                      ? "Mathematics\nEnglish\nShona\nCombined Science\n..."
                      : "Mathematics\nPhysics\nChemistry\nBiology"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to print a fully blank form. Extra entries beyond {level === "O" ? 10 : 4} are ignored.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={handleGenerate} className="gap-2">
                    <FileDown size={16} /> Generate Targets Form
                  </Button>
                  <Button variant="outline" onClick={() => handleBlank("O")} className="gap-2">
                    <FileDown size={16} /> Blank O-Level
                  </Button>
                  <Button variant="outline" onClick={() => handleBlank("A")} className="gap-2">
                    <FileDown size={16} /> Blank A-Level
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdminPrincipalDocs;
