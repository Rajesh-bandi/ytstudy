import { format } from "date-fns";

/** Local-calendar YYYY-MM-DD key. The Rust side keys completion/streak
 *  by the same local-format string, so never use toISOString() (UTC). */
export function formatDateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function today(): Date {
  return new Date();
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function parseKey(s: string): Date {
  const [y = 2000, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Mon-Sun human labels for a date key */
export function weekdayLabel(s: string): string {
  return format(parseKey(s), "EEE");
}

export { format };
