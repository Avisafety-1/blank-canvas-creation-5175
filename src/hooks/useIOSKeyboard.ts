import { useState, useEffect, useCallback } from 'react';

interface UseIOSKeyboardReturn {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
  isIOS: boolean;
}

export function useIOSKeyboard(): UseIOSKeyboardReturn {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Detect iOS devices
  const isIOS = typeof navigator !== 'undefined' && 
    /iPad|iPhone|iPod/.test(navigator.userAgent) && 
    !(window as any).MSStream;

  const isKeyboardInput = useCallback((element: Element | null): boolean => {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const isInput = tagName === 'input';
    const isTextarea = tagName === 'textarea';
    const isContentEditable = element.getAttribute('contenteditable') === 'true';
    
    // Check if input type triggers keyboard
    if (isInput) {
      const inputType = (element as HTMLInputElement).type?.toLowerCase();
      const keyboardTypes = ['text', 'password', 'email', 'tel', 'url', 'search', 'number'];
      return keyboardTypes.includes(inputType) || !inputType;
    }
    
    return isTextarea || isContentEditable;
  }, []);

  useEffect(() => {
    if (!isIOS) return;

    const handleFocusIn = (e: FocusEvent) => {
      if (isKeyboardInput(e.target as Element)) {
        setIsKeyboardOpen(true);
        
        // Use Visual Viewport API to calculate keyboard height
        if (window.visualViewport) {
          const calculateHeight = () => {
            const viewportHeight = window.visualViewport?.height || window.innerHeight;
            const windowHeight = window.innerHeight;
            const calculatedKeyboardHeight = windowHeight - viewportHeight;
            setKeyboardHeight(Math.max(0, calculatedKeyboardHeight));
          };
          
          // Delay to allow viewport to adjust
          setTimeout(calculateHeight, 100);
          window.visualViewport.addEventListener('resize', calculateHeight);
          
          return () => {
            window.visualViewport?.removeEventListener('resize', calculateHeight);
          };
        }
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Small delay to check if focus moved to another input
      setTimeout(() => {
        if (!isKeyboardInput(document.activeElement)) {
          setIsKeyboardOpen(false);
          setKeyboardHeight(0);
        }
      }, 100);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isIOS, isKeyboardInput]);

  return { isKeyboardOpen, keyboardHeight, isIOS };
}
