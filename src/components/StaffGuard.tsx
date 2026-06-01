import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useUserRole, AppRole } from "@/hooks/useUserRole";

interface Props {
  children: ReactNode;
  /** Sub-roles allowed in addition to admin. If omitted, any admin/cashier/timetable_manager allowed unless `denySubRoles` set. */
  allow?: AppRole[];
  /** Sub-roles to explicitly deny */
  deny?: AppRole[];
  /** Where to redirect if not allowed */
  redirectTo?: string;
}

/** Wrap admin pages to enforce sub-role access. */
const StaffGuard = ({ children, allow, deny, redirectTo = "/admin/students" }: Props) => {
  const { role, loading } = useUserRole();
  if (loading) return null;
  if (!role) return <Navigate to="/login" replace />;

  const isFullAdmin = role === "admin";
  if (isFullAdmin) return <>{children}</>;

  if (allow && allow.includes(role)) return <>{children}</>;
  if (deny && deny.includes(role)) {
    const fallback = role === "timetable_manager" ? "/admin/timetable" : redirectTo;
    return <Navigate to={fallback} replace />;
  }
  if (!allow && (!deny || !deny.includes(role))) {
    // default: cashier OK, timetable_manager only on allowed pages
    if (role === "cashier") return <>{children}</>;
    if (role === "timetable_manager") {
      return <Navigate to="/admin/timetable" replace />;
    }
  }
  return <Navigate to={redirectTo} replace />;
};

export default StaffGuard;
