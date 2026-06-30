import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Hard-blocks any /student/* page until profile_completed=true.
 * Skips redirect for the complete-profile route itself.
 */
const StudentProfileGate = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "ok" | "incomplete" | "noauth">("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setState("noauth"); return; }
      // Only enforce on students
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const isStudent = (roles || []).some((r: any) => r.role === "student");
      if (!isStudent) { if (active) setState("ok"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      setState((profile as any)?.profile_completed ? "ok" : "incomplete");
    })();
    return () => { active = false; };
  }, [location.pathname]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }
  if (state === "noauth") return <Navigate to="/login" replace />;
  if (state === "incomplete" && location.pathname !== "/student/complete-profile") {
    return <Navigate to="/student/complete-profile" replace />;
  }
  return <>{children}</>;
};

export default StudentProfileGate;
