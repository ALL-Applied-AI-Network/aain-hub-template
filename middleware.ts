/**
 * Per-chapter social meta for the HOSTED deployment.
 *
 * A chapter that deploys its own copy gets correct unfurl tags for free:
 * vite.config.ts bakes them from hub.config.json at build time. The hosted
 * deployment can't — one build serves every chapter, so the baked tags say
 * "Chapter Hub" for all of them. Unfurl bots (Discord, Slack, iMessage,
 * LinkedIn) and crawlers don't run the JS that later fixes the title, so
 * without this every hosted chapter is anonymous at the exact moment an
 * officer pastes their link into a club Discord.
 *
 * So: resolve the chapter from the hostname, fetch the same bundle the page
 * is about to fetch anyway, and rewrite the head. Everything here FAILS OPEN
 * — any miss, error or timeout serves the untouched static page, which is
 * what a fork on its own domain gets too (no subdomain, no slug, no rewrite).
 */

export const config = { matcher: "/" };

const HUB_DOMAIN = "all-ai-network.org";
const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/* Mirrors canonicalSlug() in src/main.ts, minus the baked-hub_id fallback:
   the hosted build has no hub_id, and a fork's own domain must pass through
   untouched rather than borrow somebody's slug. */
const RESERVED_LABELS = new Set([
  "www", "api", "app", "dashboard", "sponsors", "sponsor",
  "admin", "mail", "docs", "status", "cdn", "assets",
]);

function hostnameSlug(host: string): string {
  const h = host.toLowerCase().split(":")[0];
  if (!h.endsWith(`.${HUB_DOMAIN}`)) return "";
  const label = h.slice(0, h.length - HUB_DOMAIN.length - 1);
  if (!label || label.includes(".") || RESERVED_LABELS.has(label)) return "";
  return label;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Every replacement below uses a FUNCTION, never a string. String replacements
   expand $& and $1 in the REPLACEMENT, and esc() emits "&amp;" — so a chapter
   whose description contained "$&" could splice arbitrary matched HTML into
   its own head. Same class of bug already fixed in vite.config.ts. */
const STRIP = [
  /<title>[\s\S]*?<\/title>/i,
  /<meta\s+name="description"[^>]*>/gi,
  /<meta\s+property="og:[^"]*"[^>]*>/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>/gi,
];

export default async function middleware(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = hostnameSlug(url.host);

  // The static asset. Not matched by this middleware, so no recursion.
  const origin = fetch(new URL("/index.html", url.origin), {
    headers: { accept: "text/html" },
  });

  if (!slug) return origin;

  let name = "", tagline = "", image = "", university = "";
  /**
   * Unfurl bots won't render SVG. The dashboard's generated chapter logo is
   * an SVG, so a chapter that never uploaded a logo of its own unfurled as a
   * text-only card everywhere — Discord, Slack, iMessage, X, LinkedIn all
   * refuse it. The same endpoint has a PNG sibling that renders a proper
   * 1200x630 card, and it lives at the same origin, so the URL is the only
   * thing that has to change. An UPLOADED logo is already a raster file and
   * is left exactly as the chapter set it.
   */
  let generatedCard = false;
  try {
    const res = await fetch(
      `${DASHBOARD_ORIGIN}/api/public/chapter/${encodeURIComponent(slug)}/bundle`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) return origin;
    const data = await res.json();
    const cfg = data?.config ?? data ?? {};
    const chapter = data?.chapter ?? {};
    name = String(cfg.hub_name ?? chapter.name ?? "").trim();
    tagline = String(cfg.tagline ?? cfg.description ?? "").trim();
    image = String(cfg.logo_url ?? "").trim();
    generatedCard = image.includes("/api/public/chapter-logo/");
    image = image.replace(
      "/api/public/chapter-logo/",
      () => "/api/public/chapter-card/",
    );
    university = String(chapter.university ?? cfg.university ?? "").trim();
  } catch {
    return origin; // unreachable dashboard must not take the site down
  }

  if (!name) return origin;

  const res = await origin;
  if (!res.ok) return res;

  const description =
    tagline ||
    (university
      ? `The applied AI club at ${university}. Events, projects and workshops — no experience required.`
      : "A student-run applied AI community.");
  const title = `${name} — ALL Applied AI Network`;
  const pageUrl = `https://${url.host}/`;

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
    `<meta name="twitter:card" content="${image && generatedCard ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : "",
    `<link rel="canonical" href="${esc(pageUrl)}">`,
  ]
    .filter(Boolean)
    .join("\n    ");

  let html = await res.text();
  for (const re of STRIP) html = html.replace(re, () => "");
  html = html.replace(/<\/head>/i, () => `    ${head}\n  </head>`);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // The bundle changes when an officer edits their site, not per request.
      "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
