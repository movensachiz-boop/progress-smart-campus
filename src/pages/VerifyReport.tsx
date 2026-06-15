import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { formToLevel } from "@/lib/grading";

const VerifyReport = () => {
  const { examId, studentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [exam, setExam] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!examId || !studentId) return setLoading(false);
      const { data: e } = await supabase.from("exams").select("*").eq("id", examId).eq("published", true).maybeSingle();
      if (!e) { setLoading(false); return; }
      const { data: s } = await supabase.from("profiles").select("first_name, last_name, form, stream, registration_number").eq("id", studentId).maybeSingle();
      const { data: rs } = await supabase.from("exam_results").select("*").eq("exam_id", examId).eq("student_profile_id", studentId);
      setExam(e); setStudent(s); setResults(rs || []);
      setValid(!!(e && s && rs && rs.length));
      setLoading(false);
    })();
  }, [examId, studentId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          {valid
            ? <ShieldCheck className="mx-auto text-emerald-600" size={48}/>
            : <ShieldX className="mx-auto text-destructive" size={48}/>}
          <CardTitle>{valid ? "Verified Results" : "Not Found / Unpublished"}</CardTitle>
        </CardHeader>
        <CardContent>
          {valid ? (
            <>
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold">{student?.last_name} {student?.first_name}</h3>
                <p className="text-xs text-muted-foreground">Reg #{student?.registration_number} · Form {student?.form} {student?.stream}</p>
                <p className="text-sm mt-1">{exam?.name}</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-center">Mark</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    {formToLevel(student?.form) === "alevel" && <TableHead className="text-center">Pts</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.subject_name || r.subject_code}</TableCell>
                      <TableCell className="text-center">{r.mark}</TableCell>
                      <TableCell className="text-center"><Badge variant={r.grade === "U" ? "destructive" : "outline"}>{r.grade}</Badge></TableCell>
                      {formToLevel(student?.form) === "alevel" && <TableCell className="text-center">{r.points}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-[10px] text-center text-muted-foreground mt-3">Issued by Progress Christian College. These results are official.</p>
            </>
          ) : (
            <p className="text-center text-muted-foreground">No published results exist for this link.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyReport;
