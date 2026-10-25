import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

export function toast(message: string, tone: ToastTone = "info") {
  const id = nextId++;
  toasts = [...toasts, { id, tone, message }];
  listeners.forEach((l) => l());
  setTimeout(() => dismissToast(id), 4200);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l());
}

const icons: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

const tones: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-info",
};

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[95] flex w-80 flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = icons[t.tone]!;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-md",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", tones[t.tone])} aria-hidden />
              <p className="text-xs leading-relaxed text-text-primary">{t.message}</p>
              <button
                aria-label="Dismiss notification"
                onClick={() => dismissToast(t.id)}
                className="ml-auto rounded p-0.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
