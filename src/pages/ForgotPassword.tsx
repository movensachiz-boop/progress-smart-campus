import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eye, EyeOff, ArrowLeft, Loader2, Lock, UserCheck, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import pccLogo from "@/assets/pcc-logo.png";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"identity" | "reset" | "success">("identity");
  const [mode, setMode] = useState<"student" | "staff">("student");
  const [identifier, setIdentifier] = useState("");
  const [userName, setUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("student-login", {
        body: { action: "verify_identity", registrationNumber: identifier.trim() },
      });

      if (fnError) {
        let errorMsg = "Verification failed. Please try again.";
        try {
          if (fnError.context && typeof fnError.context.json === "function") {
            const body = await fnError.context.json();
            if (body?.error) errorMsg = body.error;
          }
        } catch {}
        setError(errorMsg);
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      if (data?.found) {
        setUserName(data.name);
        setStep("reset");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("student-login", {
        body: { action: "reset_password", registrationNumber: identifier.trim(), newPassword },
      });

      if (fnError) {
        let errorMsg = "Reset failed. Please try again.";
        try {
          if (fnError.context && typeof fnError.context.json === "function") {
            const body = await fnError.context.json();
            if (body?.error) errorMsg = body.error;
          }
        } catch {}
        setError(errorMsg);
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setStep("success");

      // Auto-navigate after a short delay if session exists
      if (data?.session) {
        setTimeout(() => {
          if (data.role === "cashier") navigate("/admin/students");
          else if (data.role === "timetable_manager") navigate("/admin/timetable");
          else if (data.role === "kitchen") navigate("/admin/kitchen");
          else if (data.role === "admin") navigate("/admin");
          else if (data.role === "teacher") navigate("/teacher");
          else if (data.role === "owner") navigate("/owner");
          else navigate("/student");
        }, 1500);
      }
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
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 px-4 py-8">
        <Card className="w-full max-w-[420px] shadow-glow border-0 animate-fade-in">
          <CardHeader className="text-center pb-2 pt-8">
            <img src={pccLogo} alt="Progress Christian Centre" width={72} height={72} className="mx-auto mb-3 lg:hidden" />
            <h2 className="text-2xl font-bold text-foreground">
              {step === "success" ? "Password Reset" : "Reset Password"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === "identity" && "Enter your details to find your account"}
              {step === "reset" && `Hello, ${userName}. Set your new password below.`}
              {step === "success" && "Your password has been reset successfully."}
            </p>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {step === "identity" && (
              <form onSubmit={handleVerify} className="space-y-5 mt-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={mode === "student" ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => setMode("student")}
                  >
                    Student
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "staff" ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => setMode("staff")}
                  >
                    Staff
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="identifier" className="text-sm font-medium">
                    {mode === "student" ? "Registration Number" : "Full Name"}
                  </Label>
                  <Input
                    id="identifier"
                    placeholder={mode === "student" ? "e.g. K0023T" : "e.g. Mavunga Mitchell"}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className="h-11 bg-muted/50 border-border/50 focus:bg-card transition-colors"
                  />
                </div>

                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{error}</div>
                )}

                <Button type="submit" className="w-full h-11 gap-2 text-base font-semibold" disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                  {loading ? "Finding account..." : "Find Account"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11 gap-2"
                  onClick={() => navigate("/login")}
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </Button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={handleReset} className="space-y-5 mt-4">
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Account</p>
                  <p className="text-sm font-semibold text-primary">{userName}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                  <p className="text-xs text-muted-foreground">
                    Min 8 chars, uppercase, lowercase, number & special character
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="h-11 bg-muted/50 border-border/50 focus:bg-card transition-colors pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">{error}</div>
                )}

                <Button type="submit" className="w-full h-11 gap-2 text-base font-semibold" disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11 gap-2"
                  onClick={() => setStep("identity")}
                >
                  <ArrowLeft size={16} />
                  Back
                </Button>
              </form>
            )}

            {step === "success" && (
              <div className="space-y-5 mt-4 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your password has been updated. You will be redirected to your dashboard shortly.
                </p>
                <Button className="w-full h-11" onClick={() => navigate("/login")}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
