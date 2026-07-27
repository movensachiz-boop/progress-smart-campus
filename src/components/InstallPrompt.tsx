import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share } from "lucide-react";
import pccLogo from "@/assets/pcc-logo.png";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pcc_install_prompt_dismissed_at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore iOS Safari
    window.navigator.standalone === true);

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !/MSStream/.test(navigator.userAgent);

const InstallPrompt = () => {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS has no beforeinstallprompt — show manual instructions
    if (isIOS()) {
      setIos(true);
      const t = setTimeout(() => setOpen(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBIP);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
    setOpen(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleDismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
              <img src={pccLogo} alt="PCC" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <DialogTitle>Install the App</DialogTitle>
              <DialogDescription>
                Get quick access to Progress Christian College from your home screen.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {ios ? (
          <div className="text-sm text-muted-foreground space-y-2 py-2">
            <p>To install on iPhone / iPad:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Tap the <Share className="inline w-4 h-4 mx-0.5" /> Share button in Safari.</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right.</li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            Install PCC as an app for faster access, a home-screen icon, and a full-screen experience.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleDismiss}>Not now</Button>
          {!ios && (
            <Button onClick={handleInstall} disabled={!deferred} className="gap-2">
              <Download size={16} /> Install App
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstallPrompt;
