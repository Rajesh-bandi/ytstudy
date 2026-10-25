import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  checked,
  onCheckedChange,
  defaultChecked,
  ariaLabel,
}: {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
  ariaLabel?: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      defaultChecked={defaultChecked}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-[--duration-fast]",
        "data-[state=checked]:bg-accent data-[state=checked]:border-transparent data-[state=unchecked]:bg-surface-hover",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3.5 translate-x-0.5 rounded-full bg-text-primary shadow-sm transition-transform duration-[--duration-fast] ease-[--ease-spring]",
          "data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-contrast",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
