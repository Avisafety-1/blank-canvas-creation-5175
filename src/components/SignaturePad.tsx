import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PenTool } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SignatureDrawerDialog } from "@/components/SignatureDrawerDialog";

interface SignaturePadProps {
  onSave?: (signatureUrl: string) => void;
  existingSignatureUrl?: string | null;
  className?: string;
}

export const SignaturePad = ({ onSave, existingSignatureUrl, className }: SignaturePadProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(existingSignatureUrl ?? null);

  useEffect(() => {
    setSignatureUrl(existingSignatureUrl ?? null);
  }, [existingSignatureUrl]);

  const handleSaved = (url: string) => {
    setSignatureUrl(url);
    onSave?.(url);
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        {signatureUrl ? (
          <div className="rounded-lg border p-4 bg-muted">
            <img
              src={signatureUrl}
              alt={t("profile.signature", "Signatur")}
              className="max-h-24 mx-auto object-contain"
              loading="lazy"
            />
          </div>
        ) : null}

        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          className="w-full justify-start"
        >
          <PenTool className="h-4 w-4 mr-2" />
          {signatureUrl
            ? t("profile.changeSignature", "Endre signatur")
            : t("profile.drawSignature", "Tegn signatur")}
        </Button>

        <SignatureDrawerDialog open={open} onClose={() => setOpen(false)} onSave={handleSaved} />
      </div>
    </div>
  );
};
