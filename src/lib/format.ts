/* Turning data into the strings on the page.

   Moved out of main.ts so the view modules format a date, a count and a
   name the same way the existing renderers do. No behaviour change: the
   bodies below are the ones that shipped. */

export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  monthShort: string;
  time: string;
  tzAbbr: string;
}

/**
 * Calendar parts of an ISO instant, computed in `tz` (or UTC for legacy
 * null-tz events) so the hub shows the same wall-clock as the dashboard
 * regardless of the visitor's own timezone. `tzAbbr` is "" when there's
 * no captured zone (legacy), so those events render without a label.
 */
export function zoneParts(iso: string, tz: string | null): ZoneParts {
  const d = new Date(iso);
  const timeZone = tz || "UTC";
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)) {
    p[part.type] = part.value;
  }
  const tzAbbr = tz
    ? d
        .toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" })
        .split(" ")
        .pop() || ""
    : "";
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    monthShort: d.toLocaleDateString("en-US", { timeZone, month: "short" }),
    time: d.toLocaleTimeString("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }),
    tzAbbr,
  };
}

/** "Oct 8" — the one date form the hero's term line and the doors use. */
export function monthDay(iso: string, tz: string | null = null): string {
  const p = zoneParts(iso, tz);
  return `${p.monthShort} ${p.day}`;
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/**
 * "1 event" / "3 events". The site's counting laws say a label is
 * singular at 1 and a zero never reaches the page at all, so this
 * deliberately has no zero form to reach for — callers drop the element
 * instead.
 */
export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function officerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
