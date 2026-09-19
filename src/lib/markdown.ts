/* The markdown subset the dashboard's own preview pane renders.

   Moved out of main.ts unchanged. Event descriptions, project
   descriptions and the About body all come through here, so a view that
   renders officer-authored prose must use this and not its own pass —
   the escaping is the security boundary (audit 2026-08-18, finding 4).
*/

import { escapeAttr } from "./html";
import { safeHttpUrl } from "./net";

/** Very small markdown subset: **bold**, *italic*, [label](url). */
export function renderInlineMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // The URL is validated and attribute-escaped rather than substituted
    // raw: a double quote inside the captured URL used to close the href
    // and add an onclick (security audit 2026-08-18, finding 4).
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label: string, url: string) => {
        const safe = safeHttpUrl(url);
        if (!safe) return label;
        return `<a href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      },
    )
    .replace(/\n/g, "<br />");
}

/**
 * Richer markdown for places that get fuller content (event
 * descriptions). Mirrors the renderer used in the dashboard's
 * Create Event preview pane so eboards see exactly what the hub
 * site will show. Supported: paragraphs (blank-line splits),
 * `**bold**`, `_italic_` / `*italic*`, `[link](https://…)`, and
 * `- ` / `* ` bullet lists. Escapes HTML before processing.
 */
export function renderRichMarkdown(src: string): string {
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const inline = (s: string): string =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
  const lines = escaped.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line.length === 0) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}
