/** Tiny event bus so any screen can pull the companion open without the
 *  dock component exporting non-component values (which breaks Fast Refresh). */

export const COMPANION_OPEN_EVENT = "ytstudy:open-companion";

export function openCompanion() {
  window.dispatchEvent(new Event(COMPANION_OPEN_EVENT));
}
