/* The portfolio's two chapter colours (2026-10-12: the page went from one
   accent to two because Ben found it "pretty bland").

   PRIMARY  chapter_hub_configs.theme_primary: the cover band, the ring,
            the numbers, the date tiles, the meters. Derived exactly the
            existing way (accent.ts deriveAccent), so a primary that cannot
            be read falls back to the network blue, as it always has.
   SECOND   chapter_hub_configs.theme_accent: chapter-project tags,
            reaction counts, built-in badge glyphs. Held to the same
            thresholds, but a second colour that cannot be made readable is
            DROPPED — those slots wear the primary — never swapped for one
            we made up. A chapter has one colour until it has picked two.

   Both are officer-typed (varchar(9)), so "#abc" and "#aabbccdd" arrive
   too; they are normalised here before accent.ts, which only reads six
   digits, sees them. */

import { contrastRatio, deriveAccent, type Accent } from "./accent";

const CARD = "#141418";

type Rgb = [number, number, number];

/** "#abc", "#abcd", "#aabbcc" or "#aabbccdd" → "#aabbcc"; anything else
 *  → null. Alpha is ignored, as network-api's color.ts ignores it. */
export function normalizeHex(raw: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{3,8})$/i.exec((raw ?? "").trim());
  if (!m) return null;
  const d = m[1];
  if (d.length === 3 || d.length === 4) return "#" + d.slice(0, 3).split("").map((c) => c + c).join("").toLowerCase();
  if (d.length === 6 || d.length === 8) return "#" + d.slice(0, 6).toLowerCase();
  return null;
}

function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexOf([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
/** `over` painted at `alpha` on `under`, as the browser composites an
 *  rgba() fill on the card. */
function over(under: Rgb, top: Rgb, alpha: number): Rgb {
  return under.map((u, i) => u + (top[i] - u) * alpha) as Rgb;
}

/**
 * Text in a colour on that colour's own tint (a tag, a date tile) sits on
 * a ground a little lighter than the card, so text that passed against the
 * page can fail there: MSOE's second colour, #a855f7, is 5.0:1 on the page
 * and 3.9:1 on its own 15% tint. Lift toward white in 10% steps until it
 * reads at 4.5:1 — the tags are 12–13 px — or give up and return null.
 */
function textOnTint(hex: string, tint: number): string | null {
  const ground = hexOf(over(rgbOf(CARD), rgbOf(hex), tint));
  let text = hex;
  let mix = rgbOf(hex);
  for (let i = 0; i < 8 && contrastRatio(text, ground) < 4.5; i++) {
    mix = mix.map((v) => v + (255 - v) * 0.1) as Rgb;
    text = hexOf(mix);
  }
  return contrastRatio(text, ground) >= 4.5 ? text : null;
}

/** Tint behind tags and date tiles. Kept in step with portfolio.css. */
export const TINT = 0.15;

export type SecondColor = {
  color: string;
  rgb: string;
  /** For text on the colour's own tint. */
  text: string;
};

export type ChapterColors = {
  primary: Accent;
  /** The primary's text colour on its own tint (tags, date tiles). */
  primaryTint: string;
  /** Null when the chapter has no second colour or it could not be made
   *  readable. Renderers then use the primary in its slots. */
  second: SecondColor | null;
};

export function chapterColors(
  primaryColor: string | null | undefined,
  accentColor: string | null | undefined,
): ChapterColors {
  const primary = deriveAccent(normalizeHex(primaryColor));
  // deriveAccent's own text is lifted until it reads on the page; the
  // tint is a hair lighter, so lift from there.
  const primaryTint = textOnTint(primary.accentText, TINT) ?? "#ffffff";

  let second: SecondColor | null = null;
  const hex = normalizeHex(accentColor);
  // The same floor the primary's graphics are held to: 3:1 against the
  // card (WCAG 1.4.11). Below it the tag would be a smudge.
  if (hex && contrastRatio(hex, CARD) >= 3) {
    const text = textOnTint(hex, TINT);
    if (text) second = { color: hex, rgb: rgbOf(hex).join(", "), text };
  }
  return { primary, primaryTint, second };
}
