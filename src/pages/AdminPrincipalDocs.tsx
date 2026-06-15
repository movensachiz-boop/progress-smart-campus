import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateTargetsForm, generateTargetsFormBatch, TargetsStudent } from "@/lib/generateTargetsForm";
import { supabase } from "@/integrations/supabase/client";
import { FileDown, Target, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StudentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  form: string | null;
  stream: string | null;
}

const O_FORMS = ["Form 1", "Form 2", "Form 3", "Form 4"];
const A_FORMS = ["Form 5", "Form 6"];

const AdminPrincipalDocs = () => {
  const [level, setLevel] = useState<"O" | "A">("O");
  const [term, setTerm] = useState("Term 1");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [subjects, setSubjects] = useState("");

  // Single
  const [studentName, setStudentName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [singleForm, setSingleForm] = useState("");
  const [singleStream, setSingleStream] = useState("");

  // Class batch
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selForm, setSelForm] = useState<string>("");
  const [selStream, setSelStream] = useState<string>("ALL");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, registration_number, form, stream")
        .not("form", "is", null)
        .order("form")
        .order("stream")
        .order("last_name");
      if (error) toast.error(error.message);
      else setAllStudents((data || []) as StudentRow[]);
      setLoading(false);
    })();
  }, []);

  const availableForms = level === "O" ? O_FORMS : A_FORMS;

  const streamsForForm = useMemo(() => {
    if (!selForm) return [];
    const s = new Set<string>();
    allStudents.filter(x => x.form === selForm).forEach(x => x.stream && s.add(x.stream));
    return Array.from(s).sort();
  }, [allStudents, selForm]);

  const filteredStudents = useMemo(() => {
    if (!selForm) return [];
    return allStudents.filter(s =>
      s.form === selForm && (selStream === "ALL" || s.stream === selStream)
    );
  }, [allStudents, selForm, selStream]);

  const parseSubjects = () =>
    subjects.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);

  const handleSingle = async () => {
    await generateTargetsForm({
      level, studentName, regNo, form: singleForm, stream: singleStream,
      term, year, subjects: parseSubjects(),
    });
    toast.success("Targets form generated");
  };

  const handleBatch = async () => {
    if (!selForm) return toast.error("Select a class/form first");
    if (!filteredStudents.length) return toast.error("No students in this class");
    setGenerating(true);
    try {
      const students: TargetsStudent[] = filteredStudents.map(s => ({
        studentName: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
        regNo: s.registration_number || "",
        form: s.form || "",
        stream: s.stream || "",
      }));
      await generateTargetsFormBatch({
        level, term, year, subjects: parseSubjects(),
        students,
        className: `${selForm}${selStream !== "ALL" ? "-" + selStream : ""}`,
      });
      toast.success(`Generated ${students.length} targets forms`);
    } finally {
      setGenerating(false);
    }
  };

  const handleBlank = async (lvl: "O" | "A") => {
    await generateTargetsForm({ level: lvl, term, year });
    toast.success(`Blank ${lvl}-Level targets form generated`);
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Principal's Documents</h1>
          <p className="text-sm text-muted-foreground">Generate official school documents and forms.</p>
        </div>

        <Tabs defaultValue="targets">
          <TabsList>
            <TabsTrigger value="targets"><Target size={14} className="mr-1.5" /> Student Targets Form</TabsTrigger>
          </TabsList>

          <TabsContent value="targets" className="space-y-4">
            {/* Shared settings */}
            <Card>
              <CardHeader>
                <CardTitle>Form Settings</CardTitle>
                <CardDescription>
                  Applied to all generated forms. O-Level = 10 subjects, A-Level = 4 subjects. Landscape A4 with school logo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Level</Label>
                    <Select value={level} onValueChange={(v) => { setLevel(v as "O" | "A"); setSelForm(""); setSelStream("ALL"); }}>
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
                <div className="space-y-1.5">
                  <Label>Subjects (optional — one per line or comma separated)</Label>
                  <Textarea
                    rows={4}
                    value={subjects}
                    onChange={(e) => setSubjects(e.target.value)}
                    placeholder={level === "O"
                      ? "Mathematics\nEnglish\nShona\nCombined Science\n..."
                      : "Mathematics\nPhysics\nChemistry\nBiology"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to print without subjects. Extra entries beyond {level === "O" ? 10 : 4} are ignored.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Class batch */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users size={18} /> Download by Class</CardTitle>
                <CardDescription>
                  Generates one targets form per student in the selected class. Names and registration numbers are auto-filled from registration records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Form</Label>
                    <Select value={selForm} onValueChange={(v) => { setSelForm(v); setSelStream("ALL"); }}>
                      <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                      <SelectContent>
                        {availableForms.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stream / Class</Label>
                    <Select value={selStream} onValueChange={setSelStream} disabled={!selForm}>
                      <SelectTrigger><SelectValue placeholder="All streams" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All streams</SelectItem>
                        {streamsForForm.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Badge variant="secondary" className="h-9 px-3 flex items-center">
                      {loading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                      {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleBatch} disabled={generating || !selForm || !filteredStudents.length} className="gap-2">
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                    Download Class Pack ({filteredStudents.length})
                  </Button>
                </div>

                {filteredStudents.length > 0 && (
                  <div className="border rounded-md max-h-64 overflow-auto text-sm">
                    <table className="w-full">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Reg No.</th>
                          <th className="text-left px-3 py-2 font-medium">Name</th>
                          <th className="text-left px-3 py-2 font-medium">Class</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s, i) => (
                          <tr key={s.id} className="border-t">
                            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-1.5 font-mono">{s.registration_number}</td>
                            <td className="px-3 py-1.5">{[s.first_name, s.last_name].filter(Boolean).join(" ")}</td>
                            <td className="px-3 py-1.5">{s.form} {s.stream}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Single / Blank */}
            <Card>
              <CardHeader>
                <CardTitle>Single Student / Blank Form</CardTitle>
                <CardDescription>Generate one form manually or print a blank fillable copy.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Student Name</Label>
                    <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Leave blank for fillable form" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Registration No.</Label>
                    <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Form</Label>
                    <Input value={singleForm} onChange={(e) => setSingleForm(e.target.value)} placeholder="e.g. Form 4" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stream / Class</Label>
                    <Input value={singleStream} onChange={(e) => setSingleStream(e.target.value)} placeholder="e.g. Blue / Sciences" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={handleSingle} className="gap-2"><FileDown size={16} /> Generate Single Form</Button>
                  <Button variant="outline" onClick={() => handleBlank("O")} className="gap-2"><FileDown size={16} /> Blank O-Level</Button>
                  <Button variant="outline" onClick={() => handleBlank("A")} className="gap-2"><FileDown size={16} /> Blank A-Level</Button>
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
