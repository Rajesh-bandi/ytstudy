import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium tracking-[-0.005em]",
    "transition-[background-color,box-shadow,transform,filter,border-color,color]",
    "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.975] active:duration-[var(--duration-instant)]",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
  ].join(" "),
  {
    variants: {
      variant: {
        // Flat fills: colour carries the emphasis, not a shadow or a sweep.
        primary: [
          "bg-accent text-accent-contrast",
          "hover:bg-accent-strong active:bg-accent-strong",
        ].join(" "),
        secondary: [
          "panel text-text-primary",
          "hover:bg-surface-hover hover:border-border-strong",
        ].join(" "),
        ghost:
          "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-3",
        outline:
          "border border-border-strong text-text-secondary hover:border-accent hover:text-accent hover:bg-accent-soft",
        danger:
          "bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:text-text-inverted",
        success:
          "bg-success-soft text-success border border-success/40 hover:bg-success hover:text-text-inverted",
      },
      size: {
        xs: "h-6 px-2 text-[11px]",
        sm: "h-7 px-2.5 text-xs",
        default: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
        iconSm: "h-7 w-7",
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
