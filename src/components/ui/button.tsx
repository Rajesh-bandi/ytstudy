import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium tracking-[-0.005em]",
    "transition-[background-color,box-shadow,transform,border-color,color]",
    "duration-(--duration-fast) ease-(--ease-out)",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.98] active:duration-(--duration-instant)",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
  ].join(" "),
  {
    variants: {
      variant: {
        // Flat fills: colour carries the emphasis, nothing else.
        primary: "bg-accent text-accent-contrast hover:bg-accent-strong",
        secondary:
          "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-surface-2",
        ghost: "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
        outline:
          "border border-border-strong text-text-secondary hover:border-accent hover:bg-accent-soft hover:text-accent",
        danger:
          "border border-danger/35 bg-danger-soft text-danger hover:bg-danger hover:text-text-inverted",
        success:
          "border border-success/35 bg-success-soft text-success hover:bg-success hover:text-text-inverted",
      },
      size: {
        xs: "h-6 px-2 text-[11px] [&_svg]:size-3",
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        default: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
        iconSm: "h-7 w-7 [&_svg]:size-3.5",
        iconXs: "h-6 w-6 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
