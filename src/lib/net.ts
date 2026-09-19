/* URLs we are handed, and fetches we make.

   Moved out of main.ts unchanged. Every view that renders an
   officer-authored link needs safeHttpUrl, and the Learn view needs
   fetchJSON for the curriculum — one copy, not one per view. */

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
