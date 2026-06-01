import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserCheck, Loader2, Eye, EyeOff, ShieldAlert, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import pccLogo from "@/assets/pcc-logo.png";

const SetupAccount = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"verify" | "password">("verify");
  const [regNumber, setRegNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("claim-account", {
        body: { action: "check", registrationNumber: regNumber.trim() },
      });

      if (fnError || data?.error) {
        setError(data?.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      setStudentName(data.name);

      // Now claim the account (auto-generate password)
      const { data: claimData, error: claimError } = await supabase.functions.invoke("claim-account", {
        body: { action: "claim", registrationNumber: regNumber.trim() },
      });

      if (claimError || claimData?.error) {
        setError(claimData?.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      setGeneratedPassword(claimData.generatedPassword);

      if (claimData.session) {
        await supabase.auth.setSession({
          access_token: claimData.session.access_token,
          refresh_token: claimData.session.refresh_token,
        });
      }

      setStep("password");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleContinue = () => {
    navigate("/student");
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary px-4">
      <Card className="w-full max-w-md shadow-card-hover border-0">
        <CardHeader className="text-center pb-2 pt-8">
          <img src={pccLogo} alt="Pioneer Christian College" width={80} height={80} className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-primary">Set Up Your Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "verify"
              ? "Enter your registration number to get started"
              : `Welcome, ${studentName}!`}
          </p>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {step === "verify" ? (
            <form onSubmit={handleVerify} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="regNumber">Registration Number</Label>
                <Input
                  id="regNumber"
                  placeholder="e.g. K0023T"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                {loading ? "Setting up account..." : "Verify & Set Up Account"}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-4">
                Already have an account?{" "}
                <button type="button" className="text-primary underline" onClick={() => navigate("/login")}>
                  Sign In
                </button>
              </p>
            </form>
          ) : (
            <div className="space-y-5 mt-4">
              <div className="rounded-md bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Registration Number</p>
                <p className="text-sm font-semibold text-primary">{regNumber.trim().toUpperCase()}</p>
              </div>

              <div className="space-y-2">
                <Label>Your Password</Label>
                <div className="relative">
                  <Input
                    readOnly
                    type={showPassword ? "text" : "password"}
                    value={generatedPassword}
                    className="pr-20 font-mono text-base tracking-wider"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-primary"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-primary"
                      onClick={handleCopy}
                    >
                      {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <ShieldAlert size={18} />
                  Important Security Notice
                </div>
                <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                  <li>Write down this password and keep it in a safe place</li>
                  <li><strong>Do NOT share your password with anyone</strong></li>
                  <li>You will use this password together with your registration number to log in</li>
                  <li>If you forget your password, contact the school administrator</li>
                </ul>
              </div>

              <Button onClick={handleContinue} className="w-full gap-2">
                <UserCheck size={18} />
                I've Saved My Password — Continue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupAccount;
