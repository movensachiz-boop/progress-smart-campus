import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * Public landing for the mark sheet QR. After ensuring the user is signed in as
 * an admin/teacher, redirect them straight to the exam editor (Admin Exams page)
 * so they can OCR-scan that exam's mark sheet.
 */
const ScanMarks = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Checking your account…");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMsg("Please sign in to capture marks for this exam.");
        navigate(`/login?redirect=/scan-marks/${examId}`, { replace: true });
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const canEnter = (roles || []).some((r: any) => r.role === "admin" || r.role === "teacher");
      if (!canEnter) {
        setMsg("Your account does not have permission to enter marks.");
        return;
      }
      // Open exam editor by hash so admin page can auto-open the editor (optional improvement).
      navigate(`/admin/exams#open=${examId}`, { replace: true });
    })();
  }, [examId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="text-center">Mark Sheet Scan</CardTitle></CardHeader>
        <CardContent className="text-center space-y-3">
          <Loader2 className="mx-auto animate-spin" size={28}/>
          <p className="text-sm text-muted-foreground">{msg}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScanMarks;
