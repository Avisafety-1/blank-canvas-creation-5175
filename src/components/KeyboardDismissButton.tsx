import { useIOSKeyboard } from '@/hooks/useIOSKeyboard';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export function KeyboardDismissButton() {
  const { isKeyboardOpen, isIOS } = useIOSKeyboard();

  const dismissKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Only show on iOS when keyboard is open
  if (!isIOS || !isKeyboardOpen) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={dismissKeyboard}
      className="fixed top-2 right-2 z-[9999] shadow-lg flex items-center gap-1.5 px-3 py-1.5 h-auto text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
      aria-label="Lukk tastatur"
    >
      <Check className="w-3.5 h-3.5" />
      Ferdig
    </Button>
  );
}
