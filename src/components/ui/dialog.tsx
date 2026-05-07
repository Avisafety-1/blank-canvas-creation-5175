import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[1200] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onInteractOutside, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-[1200] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className,
      )}
      onPointerDownOutside={(e) => {
        // Hent faktisk DOM-target (Radix wrapper originalEvent)
        const originalTarget = (e.detail as any)?.originalEvent?.target as HTMLElement | null;
        const target = (e.target as HTMLElement | null) ?? originalTarget;

        // Ikke blokker pointer-events for portaled Radix-innhold
        // (Select, Popover/Command-lister, Dropdown etc.)
        const isInsidePopper = !!(
          target?.closest('[data-radix-popper-content-wrapper]') ||
          originalTarget?.closest('[data-radix-popper-content-wrapper]')
        );

        if (isInsidePopper) {
          return; // La Radix håndtere dette selv
        }

        // Blokker ellers utilsiktet lukking
        e.preventDefault();
      }}
      onInteractOutside={(e) => {
        // Hent faktisk DOM-target (Radix wrapper originalEvent)
        const originalTarget = (e.detail as any)?.originalEvent?.target as HTMLElement | null;
        const target = (e.target as HTMLElement | null) ?? originalTarget;

        // Sjekk om noe portaled Radix-innhold er åpent
        const hasOpenPortaledContent = !!document.querySelector(
          '[data-radix-popper-content-wrapper] [data-state="open"]',
        );

        // Native dato/tid-input aktiv (iPad tidsvelger-problem)
        const activeDateInput = document.activeElement as HTMLInputElement | null;
        const isDateTimeInput =
          activeDateInput?.tagName === "INPUT" &&
          (activeDateInput.type === "datetime-local" ||
            activeDateInput.type === "date" ||
            activeDateInput.type === "time");

        // Er target inne i en popper-wrapper?
        const isInsidePopper = !!(
          target?.closest('[data-radix-popper-content-wrapper]') ||
          originalTarget?.closest('[data-radix-popper-content-wrapper]')
        );

        if (
          hasOpenPortaledContent ||
          isDateTimeInput ||
          isInsidePopper
        ) {
          e.preventDefault();
        }

        onInteractOutside?.(e);
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-[max(1rem,env(safe-area-inset-top,1rem))] rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
