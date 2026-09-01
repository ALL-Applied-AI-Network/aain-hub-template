/**
 * brain-mark.ts — the ALL mark, drawn into the hero.
 *
 * Same geometry as the network's own home page: the silhouette, the 22
 * nodes and the 38 edges were extracted from all-logo.png by image
 * analysis (see content/site/ts/hero-mark.ts). This is the chapter's
 * version of it — their acronym where "ALL" sits, their theme colours in
 * place of ours.
 *
 * The animation is a draw-in: edges stroke themselves on, nodes pop in
 * behind them, the wordmark fades last — so the mark assembles rather than
 * simply appearing. Under prefers-reduced-motion it renders complete on the
 * first frame, because the point is the mark, not the motion.
 *
 * SVG rather than canvas on purpose: it recolours from CSS custom
 * properties, scales to any hero height, and costs nothing when idle.
 */

const OUTLINE = "61.62,9.7 62.88,9.7 64.13,9.7 65.39,10.12 66.64,10.75 67.9,12.0 68.53,13.26 68.74,14.51 69.78,15.56 71.04,16.4 72.3,17.03 73.55,17.86 74.81,18.49 76.06,19.33 77.32,19.96 78.58,20.8 79.83,21.42 81.09,22.26 82.35,22.89 83.6,23.73 84.86,24.35 86.11,25.19 87.37,25.19 88.63,24.98 89.88,24.98 91.14,25.19 92.39,26.03 93.44,26.87 94.49,28.12 94.91,29.38 95.12,30.63 95.12,31.89 94.7,33.15 94.07,34.4 93.23,35.66 93.44,36.92 93.65,38.17 94.07,39.43 94.28,40.68 94.49,41.94 94.7,43.2 94.91,44.45 95.12,45.71 95.74,46.96 96.37,48.22 96.58,49.48 96.58,50.73 95.95,51.99 94.91,53.04 93.65,53.66 92.6,54.71 91.56,55.97 90.72,57.22 90.3,58.48 90.51,59.73 90.51,60.99 90.09,62.25 89.67,63.5 88.63,64.76 87.37,65.81 86.11,66.22 84.86,66.64 83.6,66.64 82.35,67.27 81.09,68.53 79.83,69.78 78.58,70.83 77.53,72.09 77.53,73.34 77.32,74.6 76.9,75.86 76.06,77.11 74.81,78.16 73.55,78.79 72.3,79.0 71.04,79.0 69.78,79.2 68.74,80.46 67.48,81.72 66.22,82.97 65.39,84.23 65.18,85.49 64.97,86.74 64.13,88.0 63.08,89.04 61.83,89.67 60.57,89.88 59.32,89.88 58.06,89.67 56.8,88.84 55.55,87.58 55.13,86.32 54.92,85.07 54.92,83.81 55.34,82.55 55.97,81.3 55.76,80.04 55.55,78.79 55.13,77.53 54.92,76.27 54.5,75.02 53.66,74.6 52.41,74.81 51.15,75.02 49.9,75.23 48.64,75.65 47.38,75.86 46.13,76.06 44.87,76.27 43.61,76.9 42.36,78.16 41.1,78.58 39.85,78.79 38.59,78.58 37.33,78.16 36.08,77.32 35.24,76.06 34.61,74.81 33.36,73.97 32.1,73.13 30.84,72.3 29.59,71.67 28.33,70.83 27.08,69.99 25.82,69.57 24.56,69.99 23.31,70.2 22.05,69.99 20.8,69.78 19.54,69.16 18.28,68.32 17.24,67.06 16.61,65.81 16.19,64.55 16.19,63.29 16.19,62.04 16.61,60.78 16.82,59.53 15.98,58.27 15.35,57.01 14.51,55.76 13.68,54.5 13.05,53.24 12.21,51.99 11.37,50.73 10.75,49.48 9.91,48.22 9.28,46.96 8.23,45.92 6.98,45.5 5.72,45.08 4.47,43.82 3.63,42.57 3.21,41.31 3.21,40.06 3.21,38.8 3.42,37.54 4.26,36.29 5.3,35.03 6.56,34.4 7.82,33.98 9.07,33.57 10.12,32.31 10.96,31.05 11.79,29.8 12.63,28.54 13.47,27.29 13.26,26.03 13.05,24.77 13.05,23.52 13.26,22.26 13.89,21.0 14.72,19.75 15.77,18.49 17.03,17.65 18.28,17.45 19.54,16.61 20.8,16.4 22.05,16.61 23.31,17.03 24.56,17.65 25.82,17.03 27.08,16.4 28.33,15.98 29.59,15.35 30.84,14.72 32.1,14.1 33.36,13.68 34.4,12.42 35.66,11.37 36.92,11.16 38.17,11.16 39.43,11.58 40.68,11.79 41.94,11.79 43.2,11.79 44.45,11.79 45.71,11.79 46.96,11.79 48.22,11.79 49.48,11.79 50.73,11.79 51.99,11.79 53.24,11.79 54.5,12.0 55.76,12.0 57.01,12.0 58.27,11.79 59.53,10.75 60.78,10.12";

/** [x, y, r, hollow] — hollow nodes are rings in the original art. */
const NODES: Array<[number, number, number, number]> = [
  [37.38, 15.27, 1.34, 0],
  [20.91, 24.36, 5.01, 0],
  [44.14, 24.29, 2.15, 0],
  [90.87, 29.23, 0.94, 0],
  [88.94, 31.07, 2.83, 1],
  [28.52, 33.9, 1.9, 0],
  [81.78, 39.66, 2.09, 0],
  [9.13, 39.89, 3.32, 0],
  [69.87, 45.96, 2.24, 1],
  [92.48, 49.54, 1.5, 0],
  [28.7, 52.51, 4.78, 0],
  [53.75, 58.86, 2.85, 1],
  [83.62, 59.99, 3.55, 1],
  [86.16, 62.29, 0.89, 0],
  [23.5, 63.13, 2.71, 1],
  [56.99, 70.77, 1.38, 0],
  [71.44, 72.92, 3.33, 0],
  [39.72, 73.93, 2.1, 0],
  [60.07, 84.75, 1.99, 1],
  [71.95, 59.07, 3.39, 0],
  [58.95, 31.05, 3.96, 0],
  [62.88, 15.77, 2.93, 1],
];

const EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 5], [0, 21], [1, 5], [1, 7], [2, 5], [2, 20], [4, 6], [4, 9], [4, 20], [4, 21], [5, 7], [5, 10], [6, 8], [6, 9], [6, 11], [6, 20], [7, 10], [7, 14], [8, 19], [9, 12], [10, 14], [11, 12], [11, 14], [11, 17], [11, 19], [12, 16], [12, 18], [12, 19], [14, 17], [15, 16], [15, 17], [15, 18], [15, 19], [16, 18], [16, 19], [20, 21],
];

/** Optically centred in the mark.
 *
 *  Only the X moved. The original art's height (42.61) is where a designer
 *  put "ALL", and the brain is genuinely top-heavy — it widens at the top
 *  and narrows to a stem, so its visual mass sits well above the middle of
 *  its own bounding box (area centroid 45.25 vs bbox centre 49.79). Moving
 *  the wordmark down to the bbox centre made it read as too low. The
 *  original X (46.69) is what looked off, because the eye centres text
 *  against the SQUARE, so that is the only value changed.
 *
 *  This first used the original "ALL" word position (46.69, 42.61), which
 *  is right for the full logo's composition but reads as misaligned once
 *  the mark is a small square icon — the eye centres text against the
 *  SQUARE, and that position is 3.2 units left and 7.2 units high of the
 *  silhouette's centre (bbox 49.89, 49.79). The half-unit down is the usual
 *  nudge for all-caps text, which has no descenders and otherwise sits
 *  visually high. */
const WORD_X = 50;
const WORD_Y = 42.61;
/* The clear band between the two big inner nodes (x 28.7 r 4.8 on the left,
 * x 69.9 on the right). Centring the wordmark without narrowing it ran the
 * first letter straight into that left node. */
const WORD_SPAN = 30;

function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeAcronym(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return s.slice(0, 5) || "ALL";
}

/**
 * Render the mark into `el`.
 *
 * Colours come from currentColor and the CSS custom properties the page
 * already sets from the chapter's theme, so changing the theme recolours
 * the mark with no re-render.
 */
export function renderBrainMark(
  el: Element | null,
  acronymRaw: string | null | undefined,
): void {
  if (!el) return;
  const acronym = normalizeAcronym(acronymRaw);

  // Widest-glyph sizing: bold caps run from ~0.31em (I) to ~0.85em (W, M),
  // so sizing by character COUNT overflows on a wide acronym.
  const fontSize =
    Math.round((WORD_SPAN / (0.85 * acronym.length)) * 10) / 10;

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const edges = EDGES.map(([a, b], i) => {
    const [x1, y1] = NODES[a];
    const [x2, y2] = NODES[b];
    const delay = reduce ? 0 : 0.35 + i * 0.022;
    return `<line class="bmark__edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--d:${delay}s" />`;
  }).join("");

  const nodes = NODES.map(([x, y, r, hollow], i) => {
    const delay = reduce ? 0 : 0.15 + i * 0.03;
    return `<circle class="bmark__node${hollow ? " bmark__node--hollow" : ""}" cx="${x}" cy="${y}" r="${r}" style="--d:${delay}s" />`;
  }).join("");

  el.innerHTML = `
<svg class="bmark${reduce ? " bmark--static" : ""}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="bmark-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="var(--color-primary, #22d3ee)" />
      <stop offset="100%" stop-color="var(--color-accent, #c026d3)" />
    </linearGradient>
  </defs>
  <polygon class="bmark__outline" points="${OUTLINE}" />
  <g class="bmark__edges">${edges}</g>
  <g class="bmark__nodes">${nodes}</g>
  <text class="bmark__word" x="${WORD_X}" y="${WORD_Y}" text-anchor="middle"
        dominant-baseline="central" font-size="${fontSize}">${escapeXml(acronym)}</text>
</svg>`;
}
