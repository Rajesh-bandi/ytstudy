export async function openExternal(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    const mod = await import("@tauri-apps/plugin-opener");
    await mod.openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
