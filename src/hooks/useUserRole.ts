import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "student" | "teacher" | "owner" | "cashier" | "timetable_manager";

export function useUserRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) { setRole(null); setLoading(false); } return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data || []).map((r: any) => r.role as AppRole);
      const preferred: AppRole =
        roles.find(r => r === "cashier" || r === "timetable_manager") ||
        roles.find(r => r === "owner" || r === "teacher") ||
        roles.find(r => r === "admin") ||
        "student";
      if (mounted) { setRole(preferred); setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  return { role, loading };
}
