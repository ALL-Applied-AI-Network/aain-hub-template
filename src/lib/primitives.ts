/* Small rendering primitives shared by more than one surface.

   Moved out of main.ts unchanged. A medal, a badge icon and an
   empty-state card each appear on both the landing page and a
   destination, so they live here rather than in whichever view happened
   to need them first.

   `renderCard` deliberately stayed in main.ts: it reads the baked
   `config.content_url` to resolve thumbnails, and only the learning-tree
   fallback grid uses it.
*/

import { escapeAttr, escapeHtml } from "./html";

/** SVG medal icons — the emoji versions read as "playful" rather than
 *  "grand". These are flat SVGs styled with CSS per rank. */
export const MEDAL_SVGS: Record<number, string> = {
  1: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="m10.5 15 1.5 1.5L14 14"/></svg>`,
  2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/></svg>`,
  3: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/></svg>`,
};


const BUILT_IN_ICONS: Record<string, string> = {
  trophy:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  award:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  medal:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><circle cx="12" cy="17" r="5"/></svg>',
  lightning:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
};

/**
 * A badge's icon: an uploaded image, one of the five built-in names, or
 * an emoji the chapter typed straight into the field.
 *
 * The emoji branch is not a nicety. Three of MSOE's 27 icons are "🏆",
 * "graduation" and "crown", and all three used to render as the same
 * trophy SVG — so a chapter that gave three awards three different
 * marks got one mark three times. An emoji is text and renders as text;
 * the two icon-name typos still fall through to the trophy, which is
 * the honest answer for a name we do not have art for.
 */
export function renderBadgeIcon(icon: string): string {
  const key = (icon ?? "").trim();
  if (
    key.startsWith("http://") ||
    key.startsWith("https://") ||
    key.startsWith("data:image/")
  ) {
    return `<img src="${escapeAttr(key)}" alt="" />`;
  }
  if (/\p{Extended_Pictographic}/u.test(key)) {
    return `<span class="badge-card__icon--emoji" aria-hidden="true">${escapeHtml(key)}</span>`;
  }
  return BUILT_IN_ICONS[key] ?? BUILT_IN_ICONS.trophy;
}


/** Render the shared empty-state card inside a grid. */
export function renderGridEmpty(
  gridId: string,
  title: string,
  desc: string,
): void {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__title">${escapeHtml(title)}</div>
      <div class="empty-state__desc">${escapeHtml(desc)}</div>
    </div>
  `;
}
