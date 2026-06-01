import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, XCircle, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import pccLogo from "@/assets/pcc-logo.png";

interface VerifyResult {
  valid: boolean;
  receiptNumber?: string;
  amount?: number;
  currency?: string;
  date?: string;
  studentName?: string;
  studentClass?: string;
  regNumber?: string;
  method?: string;
  status?: string;
}

const VerifyReceipt = () => {
  const [searchParams] = useSearchParams();
  const [receiptNo, setReceiptNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [checked, setChecked] = useState(false);

  // Auto-fill and verify from QR code URL param
  useEffect(() => {
    const r = searchParams.get("r");
    if (r) {
      setReceiptNo(r);
      // Auto-trigger verification
      const autoVerify = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke("verify-receipt", {
            body: { receiptNumber: r.trim().toUpperCase() },
          });
          setResult(error || data?.error ? { valid: false } : data);
        } catch {
          setResult({ valid: false });
        } finally {
          setLoading(false);
          setChecked(true);
        }
      };
      autoVerify();
    }
  }, [searchParams]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptNo.trim()) return;
    setLoading(true);
    setResult(null);
    setChecked(false);

    try {
      const { data, error } = await supabase.functions.invoke("verify-receipt", {
        body: { receiptNumber: receiptNo.trim().toUpperCase() },
      });

      if (error || data?.error) {
        setResult({ valid: false });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ valid: false });
    } finally {
      setLoading(false);
      setChecked(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={pccLogo} alt="PCC" width={64} height={64} className="mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Receipt Verification</h1>
          <p className="text-sm text-muted-foreground">
            Enter a receipt number to verify its authenticity
          </p>
        </div>

        {/* Search card */}
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <form onSubmit={handleVerify} className="flex gap-2">
              <Input
                placeholder="e.g. RCP-0001"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="h-11"
                required
              />
              <Button type="submit" disabled={loading} className="h-11 px-5">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Result */}
        {checked && result && (
          <Card className={`shadow-lg border-2 ${result.valid ? "border-green-500/30" : "border-destructive/30"}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {result.valid ? (
                  <>
                    <CheckCircle2 className="text-green-500" size={22} />
                    <span className="text-green-700">Authentic Receipt</span>
                  </>
                ) : (
                  <>
                    <XCircle className="text-destructive" size={22} />
                    <span className="text-destructive">Not Found or Invalid</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            {result.valid && (
              <CardContent className="space-y-4">
                {/* Prominent paid amount banner */}
                <div className="rounded-lg bg-green-50 border-2 border-green-500/40 p-5 text-center">
                  <Badge className="bg-green-600 hover:bg-green-600 text-white mb-2">
                    <CheckCircle2 size={14} className="mr-1" /> PAID & CONFIRMED
                  </Badge>
                  <p className="text-xs uppercase tracking-wide text-green-700/80 mt-2">Amount Paid</p>
                  <p className="text-4xl font-bold text-green-700">
                    {result.currency} {Number(result.amount).toFixed(2)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Receipt No.</p>
                    <p className="font-semibold">{result.receiptNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-semibold text-green-700">Paid</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Student</p>
                    <p className="font-semibold">{result.studentName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Class</p>
                    <p className="font-semibold">{result.studentClass || "—"}</p>
                  </div>
                  {result.regNumber && (
                    <div>
                      <p className="text-muted-foreground">Reg. No.</p>
                      <p className="font-semibold">{result.regNumber}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-semibold">{result.date}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Method</p>
                    <p className="font-semibold">{result.method}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Integrity</p>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      <Shield size={12} className="mr-1" /> Hash Verified
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  This receipt has been cryptographically verified. The data integrity check confirms no tampering has occurred.
                </p>
              </CardContent>
            )}
            {!result.valid && (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No receipt with this number was found, or the receipt data has been tampered with. Please contact the school administration.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Progress Christian Centre — Secure Verification System
        </p>
      </div>
    </div>
  );
};

export default VerifyReceipt;
