/* The one accent on the portfolio page is the chapter's colour, but an
   officer-typed hex can be anything: near-black, a yellow that vanishes
   on white ink, a value that fails against the card. These derive the
   four slots the CSS needs so every chapter's colour reads on this page.
   Contrast maths ported from network-api/src/lib/portfolio/color.ts. */

const CARD = "#141418";
const GROUND = "#0a0a0b";
const DEFAULT = "#4f8fea";

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function luminance([r, g, b]: Rgb): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio, 1 (identical) to 21. A malformed input reads as
 *  1 so every threshold check fails closed. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return 1;
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Same rescue as chapter-logo.ts: only a colour that is genuinely
 *  invisible on the dark ground falls back; a deep but legitimate colour
 *  is left alone. */
export function readableOnDark(hex: string, fallback: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return fallback;
  return luminance(rgb) < 0.02 ? fallback : hex;
}

export type Accent = {
  accent: string;
  accentRgb: string;
  accentText: string;
  inkText: string;
};

export function deriveAccent(primaryColor: string | null | undefined): Accent {
  const base = readableOnDark(primaryColor ?? "", DEFAULT);
  // The rule, the rings and the tiles must separate from the card.
  const accent = contrastRatio(base, CARD) >= 3 ? base : DEFAULT;
  const rgb = parseHex(accent) as Rgb;

  // Link text lightens toward white in 10% steps until it reads on the
  // ground, so a saturated mid-tone stays itself and a dark one is lifted.
  let text = accent;
  let mix = rgb;
  for (let i = 0; i < 5 && contrastRatio(text, GROUND) < 4.5; i++) {
    mix = mix.map((v) => v + (255 - v) * 0.1) as Rgb;
    text = toHex(mix);
  }

  // Stamp numerals and badge icons sit on solid accent ink.
  // 4.5:1, not the 3:1 large-text floor: the band's "since" line is
  // 11 px mono. The dashboard's OG card uses the same threshold.
  const inkText = contrastRatio(accent, "#ffffff") >= 4.5 ? "#ffffff" : GROUND;

  return { accent, accentRgb: rgb.join(", "), accentText: text, inkText };
}
