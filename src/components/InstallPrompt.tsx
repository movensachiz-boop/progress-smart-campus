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
import { Download, Share, Plus, MoreVertical } from "lucide-react";
import pccLogo from "@/assets/pcc-logo.png";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pcc_install_prompt_dismissed_at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore iOS Safari
    window.navigator.standalone === true);

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent : "");
const isIOS = () => /iPad|iPhone|iPod/.test(ua()) && !/MSStream/.test(ua());
// iPadOS 13+ reports as Mac; detect touch Macs too
const isIPadOS = () =>
  typeof navigator !== "undefined" &&
  navigator.platform === "MacIntel" &&
  (navigator as any).maxTouchPoints > 1;
const isSafari = () => {
  const u = ua();
  return /Safari/.test(u) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|Line|WhatsApp/.test(u);
};

const InstallPrompt = () => {
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [showFab, setShowFab] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    const iOSDevice = isIOS() || isIPadOS();
    const inSafari = isSafari();

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < DISMISS_MS;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShowFab(true);
      if (!recentlyDismissed) setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    if (iOSDevice) {
      setIos(true);
      setIosSafari(inSafari);
      setShowFab(true);
      if (!recentlyDismissed) {
        const t = setTimeout(() => setOpen(true), 1500);
        return () => {
          clearTimeout(t);
          window.removeEventListener("beforeinstallprompt", onBIP);
        };
      }
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

  if (isStandalone()) return null;

  return (
    <>
      {showFab && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-primary text-primary-foreground shadow-lg px-4 py-3 flex items-center gap-2 text-sm font-medium hover:opacity-90"
          aria-label="Install App"
        >
          <Download size={16} /> Install App
        </button>
      )}

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
                  Add Progress Christian College to your home screen.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {ios ? (
            iosSafari ? (
              <div className="text-sm text-muted-foreground space-y-2 py-2">
                <p className="font-medium text-foreground">To install on iPhone / iPad:</p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    Tap the <Share className="inline w-4 h-4 mx-0.5 text-primary" />
                    <strong> Share</strong> button at the bottom of Safari.
                  </li>
                  <li>
                    Scroll down and tap <Plus className="inline w-4 h-4 mx-0.5" />
                    <strong> Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> in the top-right corner.
                  </li>
                </ol>
                <p className="pt-2 text-xs">The PCC icon will appear on your home screen like a normal app.</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-2 py-2">
                <p className="font-medium text-destructive">
                  Please open this page in <strong>Safari</strong> to install.
                </p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    Tap the <MoreVertical className="inline w-4 h-4 mx-0.5" /> menu (or address bar) and choose{" "}
                    <strong>Open in Safari</strong>.
                  </li>
                  <li>
                    In Safari, tap <Share className="inline w-4 h-4 mx-0.5 text-primary" /> <strong>Share</strong>.
                  </li>
                  <li>
                    Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                  </li>
                </ol>
                <p className="pt-2 text-xs">
                  iPhone/iPad only allows installing web apps from Safari — Chrome and in-app browsers can't install.
                </p>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Install PCC as an app for faster access, a home-screen icon, and a full-screen experience.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={handleDismiss}>Close</Button>
            {!ios && (
              <Button onClick={handleInstall} disabled={!deferred} className="gap-2">
                <Download size={16} /> Install App
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallPrompt;
