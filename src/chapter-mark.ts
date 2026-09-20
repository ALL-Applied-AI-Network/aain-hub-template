/**
 * chapter-mark.ts — the chapter's own mark, alive in the hero.
 *
 * Same brain as brain-mark.ts: the silhouette, the 22 nodes and the 38
 * edges are imported from there rather than copied, so the canvas and the
 * SVG can never drift into two different brains. What is new is that it
 * reacts — the network assembles outward from the acronym, a charge runs
 * the real wiring when the pointer arrives, and a click throws shards off
 * every node.
 *
 * Three rules shape the whole file:
 *
 * 1. NOTHING LOOPS. There is an entrance that settles, a hover pulse that
 *    settles, and a click that settles. Every one of them returns to the
 *    SAME resting image — there is no drift, no breathing and no idle
 *    traversal, so the settled frame is a fixed picture rather than one
 *    sample of a cycle.
 *
 * 2. IDLE COSTS ZERO FRAMES. The rAF loop is not a pump that runs forever
 *    and checks whether anything is happening; it is cancelled the moment
 *    nothing is, after one last settled frame, and restarted by an
 *    interaction. The hero is the top of the page and the top of the page
 *    is where lag is felt.
 *
 * 3. THE COLOURS ARE THE CHAPTER'S. Every colour below is derived from
 *    --color-primary / --color-accent. Two saturated brand colours become
 *    two families across the mark (MSOE: blue into violet). A colour that
 *    is desaturated is not a family, it is structure — ROAR's #777777 draws
 *    the contour while their 22 nodes ramp through their own red, dark at
 *    the top-left and hot at the bottom-right along the same axis as the
 *    SVG's gradient, so a one-colour brand still has depth instead of 22
 *    identical dots.
 *
 * Canvas rather than the SVG because a per-node hover front and a few
 * hundred shards are cheap as draw calls and expensive as DOM. The SVG
 * stays as the fallback for no-canvas and for slots too small to animate
 * legibly; see mountChapterMark's guard.
 */

import {
  EDGES,
  NODES,
  OUTLINE,
  WORD_SPAN,
  WORD_X,
  WORD_Y,
  normalizeAcronym,
} from "./brain-mark";

/* ── the geometry, in the SVG's own 0-100 box ─────────────────────── */

const OUT: [number, number][] = OUTLINE.split(" ").map((p) => {
  const [x, y] = p.split(",");
  return [Number(x), Number(y)] as [number, number];
});

/* ── colour ───────────────────────────────────────────────────────── */

type Hsl = [number, number, number]; // h 0-360, s 0-1, l 0-1

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex || "").trim());
  if (!m) return null;
  const h =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslRgb([h, s, l]: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const t: [number, number, number] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  return [
    Math.round((t[0] + m) * 255),
    Math.round((t[1] + m) * 255),
    Math.round((t[2] + m) * 255),
  ];
}

/** An hsl triple as a canvas colour. `hsl()` strings are avoided because
 *  every alpha in this file is computed, and rgba() keeps one syntax. */
function css(c: Hsl, a = 1): string {
  const [r, g, b] = hslRgb(c);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Shortest distance between two hues, 0-180. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Blend two hsl triples, taking the short way round the wheel so a
 *  blue-to-violet ramp never detours through green. */
function mixHsl(a: Hsl, b: Hsl, t: number): Hsl {
  let dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [a[0] + dh * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Toward white, desaturating as it goes — the way a wire looks when the
 *  current in it rises, rather than the way a lamp looks. */
function liftWhite(c: Hsl, k: number): Hsl {
  return [c[0], c[1] * (1 - k * 0.6), c[2] + (1 - c[2]) * k];
}

type Palette = {
  /** The node ramp, u running 0-1 along the mark's own gradient axis. */
  node: (u: number) => Hsl;
  word: [Hsl, Hsl];
  /** The contour's two stops, along the same axis as the node ramp. */
  outline: [Hsl, Hsl];
  outlineAlpha: number;
  hollow: string;
  rim: string;
  sparks: Hsl[];
  ring: Hsl;
};

const FALLBACK_PRIMARY: Hsl = [217, 0.79, 0.62]; // #4f8fea, the :root default
const FALLBACK_ACCENT: Hsl = [271, 0.91, 0.65]; // #a855f7

function buildPalette(primaryHex: string, accentHex: string): Palette {
  const p = toHsl(primaryHex) ?? FALLBACK_PRIMARY;
  const a = toHsl(accentHex);

  // Two families, or one colour with depth. The test is whether the
  // accent is a COLOUR at all: a chapter whose second brand value is a
  // grey has one colour, and pretending otherwise gives a mark that is
  // half brand and half sludge.
  const aColour = !!a && a[1] >= 0.22;
  // The same is true at the other end. toHsl() reports hue 0 for every
  // neutral, so the clamps below — which exist to rescue a WASHED-OUT brand
  // colour — invent a hue that was never there when the primary is a grey:
  // #111111 rendered a dusty red brain and #ffffff a pink one, on a page
  // whose mesh, buttons and glow were all monochrome. A neutral primary
  // keeps its own flat saturation and becomes structure instead.
  const pNeutral = p[1] < 0.22;
  // A neutral has no hue to compare, so the hue-gap test only means
  // anything when both ends are colours; with a grey primary and a real
  // accent, the accent IS the mark's one family.
  const twoFamilies = aColour && (pNeutral || hueGap(p[0], a![0]) >= 20);

  let A: Hsl;
  let B: Hsl;
  let outline: [Hsl, Hsl];
  if (twoFamilies) {
    A =
      pNeutral ?
        // Lightness only, and pulled into the band the coloured end uses so
        // a black primary is still visible against the hollow.
        [p[0], p[1], clamp(p[2], 0.32, 0.6)]
      : [p[0], clamp(p[1], 0.35, 1), clamp(p[2], 0.42, 0.72)];
    B = [a![0], clamp(a![1], 0.35, 1), clamp(a![2], 0.44, 0.74)];
    // The contour runs the same two hues as the graph inside it, which is
    // what the SVG does. A neutral line here read as a grey gasket around
    // the chapter's colours rather than as part of them.
    outline = [A, B];
  } else {
    // One brand colour, ramped by lightness along the same top-left to
    // bottom-right axis as the SVG's gradient. #ff0000 becomes oxblood at
    // the top-left running up to a hot bottom-right, which is a
    // deliberate-looking mark; 22 dots of identical #ff0000 is not. The
    // saturation clamps are skipped for a neutral, per pNeutral above — a
    // grey primary ramps as a grey.
    A = [p[0], pNeutral ? p[1] : clamp(p[1], 0.3, 1), 0.34];
    B = [p[0], pNeutral ? p[1] * 0.84 : clamp(p[1] * 0.84, 0.25, 1), 0.7];
    // ...and the second brand colour, which is a grey, is what the contour
    // ramps INTO. ROAR's #777777 earns its place as the edge of the mark
    // instead of being dropped for not being a hue.
    outline = a ? [A, [a[0], a[1], clamp(a[2], 0.44, 0.78)]] : [A, B];
  }

  const mid = mixHsl(A, B, 0.5);
  return {
    node: (u) => mixHsl(A, B, clamp(u, 0, 1)),
    // The acronym is the one part of the mark that must read at 112px on
    // a phone, so its ramp is floored well above the node ramp's dark end.
    word: [
      [A[0], A[1], Math.max(A[2], 0.66)],
      [B[0], B[1], Math.max(B[2], 0.72)],
    ],
    outline,
    outlineAlpha: twoFamilies ? 0.62 : 0.7,
    hollow: "rgba(8,8,11,0.92)",
    rim: "rgba(255,255,255,0.42)",
    sparks: [A, mid, B, [B[0], B[1] * 0.4, 0.9], [0, 0, 0.97]],
    ring: mid,
  };
}

/* ── the graph, measured once ─────────────────────────────────────── */

/** Where each node sits on the ramp: the SVG gradient runs top-left to
 *  bottom-right, and keeping that axis means the canvas mark and the SVG
 *  fallback are recognisably the same object. */
const RAMP_U = (() => {
  const v = NODES.map(([x, y]) => x + y);
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return v.map((k) => (k - lo) / (hi - lo || 1));
})();

const ELEN = EDGES.map(([a, b]) =>
  Math.hypot(NODES[b][0] - NODES[a][0], NODES[b][1] - NODES[a][1]),
);

/** Distance from the acronym to every node, measured ALONG THE WIRING
 *  rather than through the air. The acronym is not a node, so the two
 *  nodes nearest it seed the search — with only one seed the spread
 *  leaves the word lopsidedly, which reads as a glitch rather than as a
 *  signal leaving the middle. Everything ordered in this file — the
 *  entrance, the hover front — is ordered by this, so the mark always
 *  grows out of the chapter's own letters. */
const GDIST = (() => {
  const seeds = NODES.map((n, i) => [Math.hypot(n[0] - WORD_X, n[1] - WORD_Y), i])
    .sort((p, q) => p[0] - q[0])
    .slice(0, 2)
    .map((s) => s[1]);
  const d = NODES.map(() => Infinity);
  for (const s of seeds) d[s] = 0;
  // Bellman-Ford: 22 nodes and 38 edges, so the simple relaxation is
  // faster to read than a heap and runs once at module load.
  for (let k = 0; k < NODES.length; k++) {
    EDGES.forEach(([a, b], i) => {
      if (d[a] + ELEN[i] < d[b]) d[b] = d[a] + ELEN[i];
      if (d[b] + ELEN[i] < d[a]) d[a] = d[b] + ELEN[i];
    });
  }
  // Two of the 22 nodes appear in no edge at all — they are loose
  // satellites in the original art — so the relaxation never reaches them.
  // They take the far end of the range and arrive last, rather than
  // carrying an Infinity into every alpha downstream of this.
  const far = Math.max(...d.filter((v) => isFinite(v))) || 1;
  return d.map((v) => (isFinite(v) ? v : far));
})();
const MAX_GD = Math.max(...GDIST) || 1;

/** The two outline vertices nearest the acronym's vertical axis, above and
 *  below it. The silhouette is drawn by two pens leaving these, so the
 *  brain grows out of the word rather than being traced around it. */
const SEAM = (() => {
  let top = 0;
  let bot = 0;
  let bt = Infinity;
  let bb = Infinity;
  OUT.forEach((pt, i) => {
    const dx = Math.abs(pt[0] - WORD_X);
    if (pt[1] < WORD_Y && dx < bt) {
      bt = dx;
      top = i;
    }
    if (pt[1] >= WORD_Y && dx < bb) {
      bb = dx;
      bot = i;
    }
  });
  return [top, bot];
})();

/* ── the timeline, in ms from mount ───────────────────────────────── */

const T_WORD = [60, 470];
const T_OUTLINE = [300, 1240];
const T_NODE0 = 700; // the node nearest the acronym
const T_NODE_SPREAD = 980; // ...to the one furthest along the wiring
const T_NODE_DUR = 320;
const ENTRANCE_MS = T_NODE0 + T_NODE_SPREAD + T_NODE_DUR + 220;

const FLOOD_MS = 1150; // the hover charge, word outward
const CREST = 12; // its width; the graph is ~55 units across end to end
const FLOOD_COOLDOWN = 820; // re-entering does not re-fire mid-pulse
const RING_MS = 620;
const SPARK_CAP = 520;

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  rot: number;
  vr: number;
  col: string;
};

export type ChapterMarkOptions = {
  acronym: string | null | undefined;
  primary: string;
  accent: string;
  /** Settled frame only: no listeners, no loop, byte-identical on reload.
   *  Set by ?still=1 as well as by prefers-reduced-motion. */
  still?: boolean;
};

/**
 * Draw the chapter's mark into `host` and make it react.
 *
 * Returns a teardown that cancels the loop, drops every listener and
 * empties the host — call it before mounting anything else there.
 */
export function initChapterMark(
  host: HTMLElement,
  opts: ChapterMarkOptions,
): () => void {
  const acronym = normalizeAcronym(opts.acronym);
  const pal = buildPalette(opts.primary, opts.accent);
  const still =
    opts.still === true ||
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);

  const cv = document.createElement("canvas");
  cv.className = "cmark";
  cv.setAttribute("aria-hidden", "true");
  host.replaceChildren(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    cv.remove();
    throw new Error("no 2d context");
  }

  /* ── layout ─────────────────────────────────────────────────────── */

  let W = 0;
  let H = 0;
  let scale = 0; // px per mark unit
  let ox = 0;
  let oy = 0;
  let fontPx = 0;
  let fontFamily = "Inter, sans-serif";
  // Edge paints depend only on layout, never on time — the mark does not
  // drift — so every gradient is built once per resize instead of 38 fresh
  // gradient objects a frame.
  let edgePaint: CanvasGradient[] = [];
  let outlinePaint: string | CanvasGradient = "rgba(226,232,246,0.3)";

  const P = (i: number): [number, number] => [
    ox + OUT[i][0] * scale,
    oy + OUT[i][1] * scale,
  ];
  const NP = (i: number): [number, number] => [
    ox + NODES[i][0] * scale,
    oy + NODES[i][1] * scale,
  ];

  function layout(): boolean {
    const r = cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false; // not laid out yet
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 0.94 rather than 1: the outline stroke and the node rims have width,
    // and at 300px a hairline clipped by the canvas edge is visible.
    const fit = (Math.min(W, H) * 0.94) / 100;
    scale = fit;
    ox = W / 2 - 50 * fit;
    oy = H / 2 - 50 * fit;

    fontFamily = getComputedStyle(host).fontFamily || fontFamily;
    // Fit to the clear band between the two big inner nodes, then cap, so
    // "AI" does not become a slab and "MAIC" still fills the space. Measured
    // rather than divided by a per-glyph guess: a 5-letter acronym of wide
    // caps overflows any width estimate that counts characters.
    const probe = 100;
    ctx!.font = `800 ${probe}px ${fontFamily}`;
    const w = ctx!.measureText(acronym).width || probe;
    fontPx = Math.min((WORD_SPAN * scale * probe) / w, 0.17 * Math.min(W, H));

    const og = ctx!.createLinearGradient(ox, oy, ox + 100 * scale, oy + 100 * scale);
    og.addColorStop(0, css(pal.outline[0], pal.outlineAlpha));
    og.addColorStop(1, css(pal.outline[1], pal.outlineAlpha));
    outlinePaint = og;

    edgePaint = EDGES.map(([a, b]) => {
      const [ax, ay] = NP(a);
      const [bx, by] = NP(b);
      const g = ctx!.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, css(pal.node(RAMP_U[a]), 0.9));
      g.addColorStop(1, css(pal.node(RAMP_U[b]), 0.9));
      return g;
    });
    return true;
  }

  /* ── state ──────────────────────────────────────────────────────── */

  let raf = 0;
  let running = false;
  let disposed = false;
  let t0 = performance.now();
  let lastNow = 0;
  let floodAt = -1; // hover pulse start, in mark time
  let ringAt = -1;
  let ringX = 0;
  let ringY = 0;
  const sparks: Spark[] = [];

  /** Start the loop if it is not already running. Every interaction goes
   *  through here; nothing else ever calls requestAnimationFrame. */
  function wake() {
    if (running || disposed || still) return;
    running = true;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ── drawing ────────────────────────────────────────────────────── */

  /** 0-1 ramp between two times. */
  const T = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
  const smooth = (k: number) => k * k * (3 - 2 * k);

  /**
   * One frame.
   *
   * `t` is mark time and `flood` is the hover charge's progress, 0 to 1 as
   * the front crosses the graph. The crest it produces is the only thing an
   * interaction changes about the picture, it is additive, and at flood 0
   * every crest is exactly 0 — which is what makes draw(ENTRANCE_MS, 0, 0)
   * the one resting frame, identical after an entrance, a hover or a click.
   */
  function draw(t: number, flood: number, dt: number) {
    ctx!.clearRect(0, 0, W, H);

    const crest = (d: number) => {
      if (flood <= 0) return 0;
      const front = flood * (MAX_GD + CREST);
      const k = 1 - Math.abs(front - d) / CREST;
      return k > 0 ? smooth(k) : 0;
    };
    const nodeCrest = (i: number) => crest(GDIST[i]);
    const edgeCrest = (i: number) =>
      crest(Math.min(GDIST[EDGES[i][0]], GDIST[EDGES[i][1]]) + ELEN[i] * 0.5);

    /* silhouette — two pens leaving the seam beside the acronym */
    const g = T(t, T_OUTLINE[0], T_OUTLINE[1]);
    if (g > 0) {
      ctx!.lineJoin = "round";
      ctx!.lineWidth = Math.max(1, 1.0 * scale);
      ctx!.strokeStyle = outlinePaint;
      const N = OUT.length;
      // The SVG fills the brain with a soft plate; keeping it means the
      // nodes sit INSIDE something rather than floating on the hero mesh.
      // It fades in on the pen's own clock rather than appearing the
      // instant the contour closes, which read as a flash.
      ctx!.beginPath();
      for (let i = 0; i < N; i++) {
        const [x, y] = P(i);
        i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y);
      }
      ctx!.closePath();
      ctx!.fillStyle = `rgba(0,0,0,${(0.28 * g).toFixed(3)})`;
      ctx!.fill();
      if (g >= 1) {
        ctx!.stroke();
      } else {
        const fwd = (SEAM[1] - SEAM[0] + N) % N;
        const bwd = N - fwd;
        ctx!.beginPath();
        const [sx, sy] = P(SEAM[0]);
        ctx!.moveTo(sx, sy);
        for (let k = 1; k <= Math.floor(fwd * g); k++) {
          const [x, y] = P((SEAM[0] + k) % N);
          ctx!.lineTo(x, y);
        }
        ctx!.moveTo(sx, sy);
        for (let k = 1; k <= Math.floor(bwd * g); k++) {
          const [x, y] = P((SEAM[0] - k + N) % N);
          ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }
    }

    /* edges — each one strokes outward from whichever end arrived first */
    ctx!.lineCap = "round";
    EDGES.forEach(([a, b], i) => {
      const sa = nodeStart(a);
      const sb = nodeStart(b);
      const from = sa <= sb ? a : b;
      const to = from === a ? b : a;
      const local = T(t, Math.min(sa, sb) + 120, Math.min(sa, sb) + 430);
      if (local <= 0) return;
      const [fx, fy] = NP(from);
      const [tx, ty] = NP(to);
      // Trim to the node rims: drawn centre to centre, a line runs straight
      // through the hollow rings, which the art never does.
      const L = Math.hypot(tx - fx, ty - fy) || 1;
      const ux = (tx - fx) / L;
      const uy = (ty - fy) / L;
      const x0 = fx + ux * NODES[from][2] * scale * 0.92;
      const y0 = fy + uy * NODES[from][2] * scale * 0.92;
      const x1 = tx - ux * NODES[to][2] * scale * 0.92;
      const y1 = ty - uy * NODES[to][2] * scale * 0.92;
      const k = edgeCrest(i);
      ctx!.globalAlpha = clamp(0.78 + 0.22 * k, 0, 1);
      ctx!.strokeStyle = edgePaint[i];
      ctx!.lineWidth = Math.max(0.7, 0.7 * scale);
      ctx!.beginPath();
      ctx!.moveTo(x0, y0);
      ctx!.lineTo(x0 + (x1 - x0) * local, y0 + (y1 - y0) * local);
      ctx!.stroke();
      // The charge is a WHITE pass over the wire the chapter's colour
      // already drew, not a halo around it. Nothing in this mark blooms:
      // a soft radial behind every node is the look Ben throws out, and it
      // is also the one thing here that would cost real fill rate.
      if (k > 0.02) {
        ctx!.globalAlpha = k * 0.5;
        ctx!.strokeStyle = "rgba(255,255,255,1)";
        ctx!.lineWidth = Math.max(0.6, 0.5 * scale);
        ctx!.stroke();
      }
    });
    ctx!.globalAlpha = 1;

    /* nodes */
    for (let i = 0; i < NODES.length; i++) {
      const appear = T(t, nodeStart(i), nodeStart(i) + T_NODE_DUR);
      if (appear <= 0) continue;
      const [x, y] = NP(i);
      const hollow = NODES[i][3] === 1;
      const k = nodeCrest(i);
      // The pop overshoots and returns; at appear === 1 it is exactly 1, so
      // the settled radius is the geometry's own.
      const pop = appear < 1 ? 1 + 0.45 * Math.sin(appear * Math.PI) * (1 - appear) : 1;
      const r = NODES[i][2] * scale * pop * appear;

      ctx!.globalAlpha = appear;
      // The charge lifts the node toward white rather than adding a light
      // around it, so the brightest a node ever gets is still the node.
      ctx!.fillStyle = css(liftWhite(pal.node(RAMP_U[i]), k * 0.5));
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, 7);
      ctx!.fill();
      if (hollow && r > 1.6) {
        ctx!.fillStyle = pal.hollow;
        ctx!.beginPath();
        ctx!.arc(x, y, r * 0.52, 0, 7);
        ctx!.fill();
      }
      if (r > 2.6) {
        ctx!.globalAlpha = clamp(0.8 * appear, 0, 1);
        ctx!.strokeStyle = pal.rim;
        ctx!.lineWidth = Math.max(0.5, 0.45 * scale);
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, 7);
        ctx!.stroke();
      }
      // One thin ring as the front passes: alpha and radius only, which is
      // how the node acknowledges the charge without changing colour.
      if (k > 0.02) {
        ctx!.globalAlpha = k * 0.45;
        ctx!.strokeStyle = css(pal.node(RAMP_U[i]));
        ctx!.lineWidth = Math.max(0.6, 0.55 * scale);
        ctx!.beginPath();
        ctx!.arc(x, y, r + (1.2 + 2.4 * (1 - k)) * scale, 0, 7);
        ctx!.stroke();
      }
    }
    ctx!.globalAlpha = 1;

    /* the acronym, last and over everything */
    const wa = T(t, T_WORD[0], T_WORD[1]);
    if (wa > 0 && fontPx > 4) {
      const wx = ox + WORD_X * scale;
      const wy = oy + WORD_Y * scale;
      ctx!.save();
      ctx!.globalAlpha = wa;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.font = `800 ${fontPx.toFixed(2)}px ${fontFamily}`;
      // An edge passes within a letter's width of the centre on this
      // geometry. A dark under-stroke is what keeps the acronym crisp
      // over it at 112px; a glow behind it would only fog the letters.
      ctx!.lineJoin = "round";
      ctx!.lineWidth = Math.max(2, fontPx * 0.17);
      ctx!.strokeStyle = "rgba(6,6,9,0.9)";
      ctx!.strokeText(acronym, wx, wy);
      const wg = ctx!.createLinearGradient(
        wx - WORD_SPAN * scale * 0.5,
        wy - fontPx * 0.5,
        wx + WORD_SPAN * scale * 0.5,
        wy + fontPx * 0.5,
      );
      wg.addColorStop(0, css(pal.word[0]));
      wg.addColorStop(1, css(pal.word[1]));
      ctx!.fillStyle = wg;
      ctx!.fillText(acronym, wx, wy);
      ctx!.restore();
    }

    /* the click: a shockwave off the point, then the shards */
    if (ringAt >= 0) {
      const e = (t - ringAt) / RING_MS;
      if (e < 1) {
        const rr = 6 + e * 40 * scale;
        // Dissolved at the slot's edge rather than clipped by it. The radius
        // reaches ~119px in a 300px box, so only a click inside the middle
        // 62px ever stayed within the canvas; every other one ended in two
        // arc stubs with a hard vertical cut, which is exactly the artifact
        // this is here to avoid. The fade runs over the last 12 units of
        // headroom — the same rule, and the same band, the shards use below.
        const edge = clamp(
          (Math.min(ringX, ringY, W - ringX, H - ringY) - rr) /
            Math.max(4, 12 * scale),
          0,
          1,
        );
        ctx!.save();
        ctx!.globalAlpha = (1 - e) * 0.55 * edge;
        // Lifted toward white: at the mark's own mid colour the ring read
        // as an unexplained circle drawn on the plate rather than as the
        // shock the click just sent through it.
        ctx!.strokeStyle = css(liftWhite(pal.ring, 0.45));
        ctx!.lineWidth = Math.max(1, 2.2 * scale * (1 - e));
        ctx!.beginPath();
        ctx!.arc(ringX, ringY, rr, 0, 7);
        ctx!.stroke();
        ctx!.restore();
      } else ringAt = -1;
    }
    if (sparks.length) {
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        if (s.life < 0) continue; // still waiting its turn in the ripple
        if (s.life > s.ttl) {
          sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt * 0.06;
        s.y += s.vy * dt * 0.06;
        s.vy += 0.0006 * dt * sparkUnit();
        s.vx *= 0.99;
        s.vy *= 0.99;
        s.rot += s.vr * dt * 0.06;
        const p = s.life / s.ttl;
        const r = s.size * (1 - p * 0.35);
        ctx!.fillStyle = s.col;
        // Shards leave the canvas, and a hard clip at its edge reads as a
        // wall. The last few pixels fade them out instead, so they fly off
        // into the hero rather than stopping against a box.
        const edge = clamp(
          Math.min(s.x, s.y, W - s.x, H - s.y) / Math.max(4, 12 * scale),
          0,
          1,
        );
        ctx!.globalAlpha = Math.max(0, 1 - p * p) * 0.75 * edge;
        ctx!.save();
        ctx!.translate(s.x, s.y);
        ctx!.rotate(s.rot);
        ctx!.fillRect(-r * 1.2, -r * 0.26, r * 2.4, r * 0.52);
        ctx!.restore();
      }
      ctx!.restore();
      ctx!.globalAlpha = 1;
    }
  }

  /** When node `i` begins arriving — ordered along the wiring, not by index. */
  function nodeStart(i: number): number {
    return T_NODE0 + (GDIST[i] / MAX_GD) * T_NODE_SPREAD;
  }

  const sparkUnit = () => Math.max(1.4, Math.min(W, H) * 0.0075);

  /** Every node throws shards, the ones nearest the click going first, so
   *  the burst ripples out through the chapter's own graph rather than
   *  sitting on top of it as generic confetti. */
  function burst(px: number, py: number, t: number) {
    ringAt = t;
    ringX = px;
    ringY = py;
    const U = sparkUnit();
    for (let i = 0; i < NODES.length; i++) {
      const [nx, ny] = NP(i);
      const delay = Math.hypot(nx - px, ny - py) * 0.5;
      const n = 3 + ((Math.random() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = U * (0.3 + Math.random() * 0.95);
        sparks.push({
          x: nx,
          y: ny,
          vx: Math.cos(a) * sp + (nx - px) * 0.012,
          vy: Math.sin(a) * sp + (ny - py) * 0.012 - U * 0.25,
          life: -delay,
          ttl: 700 + Math.random() * 620,
          size: U * (0.5 + Math.random() * 1.25),
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 0.3,
          col: css(
            Math.random() < 0.55
              ? pal.node(RAMP_U[i])
              : pal.sparks[(Math.random() * pal.sparks.length) | 0],
          ),
        });
      }
    }
    if (sparks.length > SPARK_CAP) sparks.splice(0, sparks.length - SPARK_CAP);
  }

  /* ── the loop, which stops ──────────────────────────────────────── */

  function frame(now: number) {
    if (!running) return;
    if (scale <= 0 && !layout()) {
      // No box yet — the ?event= flyer hides the whole landing page, and a
      // loop that kept asking for frames until a hidden element got a size
      // would run for the life of that page. Stop; the ResizeObserver wakes
      // us if the slot ever appears.
      running = false;
      return;
    }
    const t = now - t0;
    const dt = lastNow ? Math.min(now - lastNow, 50) : 16;
    lastNow = now;
    const flood = floodAt < 0 ? 0 : clamp((t - floodAt) / FLOOD_MS, 0, 1);
    draw(t, flood < 1 ? flood : 0, dt);

    if (floodAt >= 0 && t - floodAt >= FLOOD_MS) floodAt = -1;
    const busy =
      t < ENTRANCE_MS || floodAt >= 0 || ringAt >= 0 || sparks.length > 0;
    if (busy) {
      raf = requestAnimationFrame(frame);
      return;
    }
    // Settled. One last frame with every interaction cleared — so the
    // resting image after an entrance, a hover and a click is the same
    // image — and then no more rAF until something happens.
    sparks.length = 0;
    ringAt = -1;
    draw(ENTRANCE_MS, 0, 0);
    running = false;
  }

  /** Redraw the settled picture without starting the loop. Used when the
   *  box resizes, when the webfont finally lands, and in still mode. */
  function paintSettled() {
    if (disposed) return;
    if (scale <= 0 && !layout()) return;
    sparks.length = 0;
    ringAt = -1;
    draw(ENTRANCE_MS, 0, 0);
  }

  /* ── pointer ────────────────────────────────────────────────────── */

  // .hero__mark is pointer-events:none so the mark never blocks the hero
  // copy, which means the canvas itself never sees a pointer event. Listen
  // on the window and hit-test the mark's own box, yielding to anything
  // clickable behind it. The box is cached: a getBoundingClientRect on
  // every pointermove is a forced layout, and this sits at the top of the
  // page Ben already called laggy.
  let box = { l: 0, t: 0, r: 0, b: 0 };
  let boxStale = true;
  let boxAt = 0;
  let inside = false;
  let lastFlood = -1e9;

  function readBox() {
    const r = cv.getBoundingClientRect();
    box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    boxStale = false;
    boxAt = performance.now();
  }
  const markBoxStale = () => {
    boxStale = true;
  };

  const hit = (e: PointerEvent): boolean => {
    // Scroll and resize invalidate the cache, but a late image or a font
    // swap moves the hero without firing either, so the box also expires on
    // its own. One rect read every 400ms of pointer movement is nothing;
    // one per pointermove is a forced layout on every mouse move.
    if (boxStale || performance.now() - boxAt > 400) readBox();
    return (
      e.clientX >= box.l &&
      e.clientX <= box.r &&
      e.clientY >= box.t &&
      e.clientY <= box.b
    );
  };

  const onMove = (e: PointerEvent) => {
    // Hover is a mouse and a pen. A finger produces pointermove for the whole
    // length of a drag, so a flick-scroll that starts on the mark entered it
    // "by hover" and spent the 1150ms charge while the page was moving —
    // 140 frames, measured, for a gesture that was never pointing at us. A
    // touch gets the same travel from the tap below, which is the only way
    // it can ask for it.
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen")
      return;
    const now = hit(e);
    if (now && !inside) {
      const t = performance.now() - t0;
      if (t - lastFlood > FLOOD_COOLDOWN) {
        floodAt = t;
        lastFlood = t;
        wake();
      }
    }
    inside = now;
  };

  // A TAP, not a touch. Firing the burst straight off pointerdown spent
  // ~1.5s of shard physics on things that are not a click at all: a
  // flick-scroll whose finger happens to land on the mark (which on a phone
  // is a 117px target dead centre at the top of the page), a right-click —
  // under the context menu — and the first pixel of a text-selection drag.
  // All three measured the same ~160 frames as a deliberate tap, while the
  // page was scrolling. So the down point is only recorded, and the burst
  // waits for a pointerup from the same primary pointer, on the main button,
  // within TAP_SLOP of where it went down. Anything else was a gesture.
  const TAP_SLOP = 8;
  let downId = -1;
  let downX = 0;
  let downY = 0;

  const onDown = (e: PointerEvent) => {
    downId = -1;
    if (!e.isPrimary || e.button !== 0) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest?.("a,button,input,textarea,select,label,[role=button]")) return;
    if (!hit(e)) return;
    downId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== downId) return;
    downId = -1;
    if (!e.isPrimary || e.button !== 0) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP) return;
    if (!hit(e)) return;
    const t = performance.now() - t0;
    burst(e.clientX - box.l, e.clientY - box.t, t);
    // The tap also re-fires the charge, so the mark answers a tap on a
    // phone — where there is no hover — with the same travel a desktop
    // visitor already got.
    floodAt = t;
    lastFlood = t;
    wake();
  };

  // The browser takes the pointer for a scroll or a drag: that gesture was
  // never ours and must not turn into a burst when the finger lifts.
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === downId) downId = -1;
  };

  /* ── mount ──────────────────────────────────────────────────────── */

  // Nothing here runs until the slot has a size. A hidden host — the
  // ?event= flyer hides the entire landing page — therefore costs a
  // canvas element and no frames, no listeners and no rect reads at all.
  let started = false;
  function start(): void {
    if (started || disposed) return;
    started = true;
    if (still) {
      // No listeners and no loop: the settled frame is the whole render,
      // and two captures of the same URL are byte-identical.
      paintSettled();
      return;
    }
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("pointerup", onUp, { passive: true });
    addEventListener("pointercancel", onCancel, { passive: true });
    addEventListener("scroll", markBoxStale, { passive: true });
    addEventListener("resize", markBoxStale, { passive: true });
    t0 = performance.now();
    wake();
  }

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          boxStale = true;
          if (!layout()) return;
          if (!started) start();
          else if (!running) paintSettled();
        })
      : null;

  // The slot decides. Below MIN_CANVAS_PX the nodes are under two pixels
  // across and the acronym is a smudge; throwing here hands the hero back
  // to the SVG, which the browser hints for us. The check is only possible
  // while we are still inside the constructor, so a host that has no size
  // yet is taken on trust — in practice the stylesheet gives .cmark an
  // explicit width and height, and only a hidden host measures zero.
  const laidOut = layout();
  if (laidOut && Math.min(W, H) < MIN_CANVAS_PX) {
    cv.remove();
    throw new Error("hero mark slot too small for canvas");
  }
  ro?.observe(cv);
  if (laidOut) start();
  // Canvas text is measured against whatever font is loaded at the time.
  // Inter arrives from Google Fonts after first paint, so the settled frame
  // is re-measured and repainted once it does — without this a capture can
  // catch the acronym in the fallback face.
  document.fonts?.ready
    .then(() => {
      if (disposed) return;
      layout();
      if (!running) paintSettled();
    })
    .catch(() => {});

  return () => {
    disposed = true;
    running = false;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onCancel);
    removeEventListener("scroll", markBoxStale);
    removeEventListener("resize", markBoxStale);
    cv.remove();
  };
}

/** The smallest slot the living mark is worth mounting in. Below it the
 *  nodes are under two pixels across and the acronym is a smudge, so the
 *  SVG — which is hinted by the browser rather than rasterised by us —
 *  is the better picture. */
export const MIN_CANVAS_PX = 96;
