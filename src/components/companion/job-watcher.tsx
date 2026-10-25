import { useEffect, useRef } from "react";
import { api } from "@/services/api";
import { toast } from "@/components/ui/toast";

const LABEL: Record<string, string> = {
  generate_note: "Notes are ready",
  generate_quiz: "Quiz is ready",
  generate_flashcards: "Flashcards are ready",
};

/** Watches the job queue app-wide so a generation that finishes while the
 *  user is on another screen still announces itself. This is the companion
 *  "tap on the shoulder": one line, no modal, nothing blocked. */
export function JobWatcher() {
  const seen = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const jobs = await api.listJobs();
        if (!alive) return;

        // First pass only records current state; it must not re-announce
        // jobs that finished before this session started.
        if (seen.current === null) {
          seen.current = Object.fromEntries(jobs.map((j) => [j.id, j.status]));
          return;
        }

        for (const job of jobs) {
          const before = seen.current[job.id];
          if (before && before !== job.status) {
            if (job.status === "done") {
              toast(`${LABEL[job.kind] ?? "Generation finished"}. Open the lesson to read it.`, "success");
            } else if (job.status === "failed") {
              toast(`Generation failed: ${job.error ?? "unknown error"}`, "error");
            }
          }
          seen.current[job.id] = job.status;
        }
      } catch {
        /* the watcher is decorative; it must never break the shell */
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return null;
}
