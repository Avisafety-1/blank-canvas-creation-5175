import { useEffect, useState } from "react";
import { generateUserManualPDF } from "@/lib/userManualPdf";
import { Loader2, CheckCircle, FileDown } from "lucide-react";

const UserManualDownload = () => {
  const [status, setStatus] = useState<'generating' | 'done' | 'error'>('generating');

  useEffect(() => {
    const generate = async () => {
      try {
        const blob = await generateUserManualPDF();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AviSafe-Bruksanvisning.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('done');
      } catch (err) {
        console.error('PDF generation failed:', err);
        setStatus('error');
      }
    };
    generate();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === 'generating' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">Genererer bruksanvisning...</p>
          </>
        )}
        {status === 'done' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-medium">Bruksanvisningen er lastet ned!</p>
            <p className="text-sm text-muted-foreground">Sjekk nedlastingsmappen din for AviSafe-Bruksanvisning.pdf</p>
          </>
        )}
        {status === 'error' && (
          <>
            <FileDown className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg font-medium text-destructive">Noe gikk galt</p>
            <p className="text-sm text-muted-foreground">Kunne ikke generere PDF. Prøv igjen.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default UserManualDownload;
