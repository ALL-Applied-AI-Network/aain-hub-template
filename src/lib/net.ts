/* URLs we are handed, and fetches we make.

   Moved out of main.ts unchanged. Every view that renders an
   officer-authored link needs safeHttpUrl, and the Learn view needs
   fetchJSON for the curriculum — one copy, not one per view. */

/** The one origin this site reads data from: the bundle, the board's
 *  later pages, the curriculum, the network stats. main.ts and
 *  views/learn.ts each held a private copy and views/members.ts would
 *  have made three, which is where two of them drift on the day the
 *  dashboard moves. */
export const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/**
 * Only http(s) URLs are safe to place in an href. Officer LinkedIn URLs
 * are admin-entered and stored raw, so a `javascript:` value would be a
 * clickable XSS sink on the public page — scheme-validate before render.
 */
export function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * A mailto: for one address, or null.
 *
 * The field is officer-entered and stored raw, so whitespace in it
 * would let a second header ride along inside the href. Lives here
 * rather than in views/about.ts because the join band and the footer
 * render the same chapter-typed address as a community link, and two
 * copies of this regex is how one surface ends up accepting what the
 * other rejects.
 */
export function mailtoHref(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^mailto:/i, "");
  if (!/^[^\s<>"'@,;]+@[^\s<>"'@,;]+\.[^\s<>"'@,;]+$/.test(v)) return null;
  return `mailto:${v}`;
}

export async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`Failed to fetch ${url}:`, e);
    return null;
  }
}
