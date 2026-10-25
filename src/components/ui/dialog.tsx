import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-dialog)] bg-overlay backdrop-blur-md data-[state=open]:animate-pop" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-[var(--z-dialog)] w-[min(92vw,540px)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2",
          "overflow-y-auto rounded-[6px] border border-border-strong bg-surface-2 p-6 shadow-xl data-[state=open]:animate-pop",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-base font-semibold text-text-primary">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-xs text-text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
