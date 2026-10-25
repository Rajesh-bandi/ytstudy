import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import "@/styles/main.css";
import { App } from "@/app/App";
import { applyBootPreferences } from "@/app/providers/theme-provider";

// Runs before React mounts: the stored theme is on <html> for the first paint,
// so a light-mode session never flashes the dark canvas (and vice versa).
applyBootPreferences();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
