import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, LogIn, Loader2, GraduationCap, Shield, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLog";
import pccLogo from "@/assets/pcc-logo.png";

const Login = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [regNumber, setRegNumber] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffList, setStaffList] = useState<{ name: string; role: string }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "staff" || staffList.length > 0) return;
    setLoadingStaff(true);
    supabase.functions
      .invoke("student-login", { body: { action: "list_staff" } })
      .then(({ data }) => {
        if (data?.staff) setStaffList(data.staff);
      })
      .finally(() => setLoadingStaff(false));
  }, [mode, staffList.length]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const identifier = mode === "staff" ? staffName : regNumber.trim();
      if (!identifier) {
        setError(mode === "staff" ? "Please select your name" : "Please enter your registration number");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("student-login", {
        body: { registrationNumber: identifier, password },
      });

      if (fnError) {
        let errorMsg = "Login failed. Please try again.";
        try {
          if (fnError.context && typeof fnError.context.json === "function") {
            const body = await fnError.context.json();
            if (body?.error) errorMsg = body.error;
          }
        } catch {}
        setError(errorMsg);
        await logActivity("login_failed", { identifier, mode, reason: errorMsg });
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        await logActivity("login_failed", { identifier, mode, reason: data.error });
        setLoading(false);
        return;
      }

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      await logActivity("login", { identifier, mode, role: data.role });

      if (data.role === "cashier") navigate("/admin/students");
      else if (data.role === "timetable_manager") navigate("/admin/timetable");
      else if (data.role === "admin") navigate("/admin");
      else if (data.role === "teacher") navigate("/teacher");
      else if (data.role === "owner") navigate("/owner");
      else navigate("/student");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="absolute inset-0 bg-primary" />

      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative z-10 px-12">
        <div className="max-w-md text-center space-y-6">
          <img src={pccLogo} alt="Progress Christian Centre" width={120} height={120} className="mx-auto drop-shadow-2xl animate-float" />
          <h1 className="text-4xl font-bold text-primary-foreground leading-tight">Progress Christian Centre</h1>
          <p className="text-lg text-primary-foreground/70">Finance & Student Management Portal</p>
          <div className="flex items-center justify-center gap-8 pt-4">
            <div className="flex items-center gap-2 text-primary-foreground/60">
              <GraduationCap size={20} />
              <span className="text-sm">Student Portal</span>
            </div>
            <div className="flex items-center gap-2 text-primary-foreground/60">
              <Shield size={20} />
              <span className="text-sm">Secure Access</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 px-4 py-8">
        <Card className="w-full max-w-[420px] shadow-glow border-0 animate-fade-in">
          <CardHeader className="text-center pb-2 pt-8">
            <img src={pccLogo} alt="Progress Christian Centre" width={72} height={72} className="mx-auto mb-3 lg:hidden" />
            <h2 className="text-2xl font-bold text-foreground">
              {mode === "staff" ? "Admin / Staff Sign In" : "Welcome Back"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "staff" ? "Select your name and enter your password" : "Sign in to your account"}
            </p>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5 mt-4">
              {mode === "staff" ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account Holder</Label>
                  <Select value={staffName} onValueChange={setStaffName} disabled={loadingStaff}>
                    <SelectTrigger className="h-11 bg-muted/50 border-border/50">
                      <SelectValue placeholder={loadingStaff ? "Loading staff..." : "Select your name"} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                      ))}
                      {staffList.length === 0 && !loadingStaff && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No staff accounts found</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="regNumber" className="text-sm font-medium">Registration Number</Label>
                  <Input
                    id="regNumber"
                    placeholder="e.g. K0023T"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    className="h-11 bg-muted/50 border-border/50 focus:bg-card transition-colors"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 bg-muted/50 border-border/50 focus:bg-card transition-colors pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{error}</div>
              )}

              <Button type="submit" className="w-full h-11 gap-2 text-base font-semibold shadow-lg hover:shadow-xl transition-all" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {loading ? "Signing In..." : "Sign In"}
              </Button>

              <div className="space-y-2 pt-2">
                {mode === "student" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 gap-2"
                      onClick={() => { setMode("staff"); setError(""); setPassword(""); }}
                    >
                      <Shield size={16} />
                      Admin / Staff Login
                    </Button>
                    <p className="text-sm text-center text-muted-foreground">
                      New student?{" "}
                      <button type="button" className="text-primary font-medium hover:underline" onClick={() => navigate("/setup-account")}>
                        Set up your account
                      </button>
                    </p>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full h-11 gap-2"
                    onClick={() => { setMode("student"); setError(""); setPassword(""); setStaffName(""); }}
                  >
                    <ArrowLeft size={16} />
                    Back to Student Login
                  </Button>
                )}
                <p className="text-xs text-center text-muted-foreground">
                  Forgot password? Contact your administrator.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
