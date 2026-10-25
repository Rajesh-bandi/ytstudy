import { Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { AppSidebar } from "./app-sidebar";
import { Toaster } from "@/components/ui/toast";
import { TooltipProviderUsable } from "@/components/ui/tooltip";
import { JobWatcher } from "@/components/companion/job-watcher";
import { CompanionDock } from "@/components/companion/companion-dock";

function routeKey(loc: string): string {
  // Transition per top-level segment so nested changes don't remount
  const seg = loc.split("/")[1] ?? "";
  return seg || "home";
}

export function AppLayout() {
  const location = useLocation();
  return (
    <TooltipProviderUsable>
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Enter-only transition: a route may never be left hidden, so
              there is no exit animation to wait on. */}
          <motion.main
            key={routeKey(location.pathname)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="shell-canvas min-h-0 flex-1 overflow-y-auto"
          >
            <Outlet />
          </motion.main>
        </div>
      </div>
      <JobWatcher />
      <CompanionDock />
      <Toaster />
    </TooltipProviderUsable>
  );
}
