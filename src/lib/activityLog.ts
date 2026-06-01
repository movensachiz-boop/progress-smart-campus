import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "login"
  | "logout"
  | "login_failed"
  | "page_view"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "print";

export async function logActivity(action: ActivityAction | string, details?: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let label: string | null = null;
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("first_name, last_name, registration_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof) label = `${prof.first_name} ${prof.last_name} (${prof.registration_number})`;
    }
    await supabase.from("activity_log").insert({
      user_id: user?.id || null,
      actor_email: user?.email || null,
      actor_label: label,
      action,
      details: details || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    } as any);
  } catch {
    // best-effort logging — never block UX
  }
}
