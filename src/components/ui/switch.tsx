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
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-(--duration-fast)",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "data-[state=unchecked]:border-border-strong data-[state=unchecked]:bg-surface-3",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3.5 translate-x-0.5 rounded-full bg-text-inverted transition-transform duration-(--duration-fast) ease-(--ease-out)",
          "data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-contrast",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
