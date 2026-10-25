import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-[4px] border border-border bg-bg px-3 text-sm text-text-primary placeholder:text-text-muted",
        "shadow-sm transition-all duration-[--duration-fast]",
        "hover:border-border-strong hover:bg-surface",
        "focus:border-accent focus:bg-surface focus:shadow-glow",
        "focus:outline-none focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-[4px] border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
        "shadow-sm transition-all duration-[--duration-fast]",
        "hover:border-border-strong hover:bg-surface",
        "focus:border-accent focus:bg-surface focus:shadow-glow",
        "min-h-[72px] resize-y",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-9 rounded-[4px] border border-border bg-bg px-2.5 text-sm text-text-primary",
        "shadow-sm transition-all duration-[--duration-fast]",
        "hover:border-border-strong hover:bg-surface",
        "focus:border-accent focus:bg-surface focus:shadow-glow",
        "*:bg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium uppercase tracking-wider text-text-muted", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
    </div>
  );
}
