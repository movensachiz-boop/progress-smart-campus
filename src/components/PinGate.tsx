import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// ──────────────────────────────────────────────
// 🔐  PIN CODES  –  Change them here
// ──────────────────────────────────────────────
const DEFAULT_ADMIN_PIN = "7291";       // Other admin modules
const DASHBOARD_PIN = "4830";           // Admin Dashboard only
// ──────────────────────────────────────────────

const SESSION_TTL = 15 * 60 * 1000; // 15 minutes

interface PinGateProps {
  children: React.ReactNode;
  /** Use a separate PIN + session for the dashboard */
  variant?: "admin" | "dashboard";
  title?: string;
}

const PinGate = ({ children, variant = "admin", title }: PinGateProps) => {
  const ADMIN_PIN = variant === "dashboard" ? DASHBOARD_PIN : DEFAULT_ADMIN_PIN;
  const SESSION_KEY = variant === "dashboard" ? "pcc_dashboard_unlocked" : "pcc_admin_unlocked";
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (Date.now() - ts < SESSION_TTL) {
        setUnlocked(true);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const handleComplete = (value: string) => {
    if (locked) return;
    if (value === ADMIN_PIN) {
      sessionStorage.setItem(SESSION_KEY, Date.now().toString());
      setUnlocked(true);
      setError("");
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setPin("");
      if (next >= 5) {
        setLocked(true);
        setError("Too many attempts. Locked for 5 minutes.");
        setTimeout(() => {
          setLocked(false);
          setAttempts(0);
          setError("");
        }, 5 * 60 * 1000);
      } else {
        setError(`Incorrect PIN. ${5 - next} attempts remaining.`);
      }
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-card">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">{title || (variant === "dashboard" ? "Dashboard Access" : "Admin Access")}</CardTitle>
          <p className="text-sm text-muted-foreground">Enter the 4-digit PIN to continue</p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={(val) => { setPin(val); setError(""); }}
            onComplete={handleComplete}
            disabled={locked}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>

          {error && (
            <p className="text-sm text-destructive font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> {error}
            </p>
          )}

          <Button
            className="w-full"
            disabled={pin.length < 4 || locked}
            onClick={() => handleComplete(pin)}
          >
            Unlock Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinGate;
