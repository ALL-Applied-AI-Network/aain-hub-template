/**
 * Per-chapter (and per-member) social meta for the HOSTED deployment.
 *
 * A chapter that deploys its own copy gets correct unfurl tags for free:
 * vite.config.ts bakes them from hub.config.json at build time. The hosted
 * deployment can't — one build serves every chapter, so the baked tags say
 * "Chapter Hub" for all of them. Unfurl bots (Discord, Slack, iMessage,
 * LinkedIn) and crawlers don't run the JS that later fixes the title, so
 * without this every hosted chapter is anonymous at the exact moment an
 * officer pastes their link into a club Discord.
 *
 * Member portfolios live on the same wildcard: `{member-slug}.all-ai-network.org`
 * is served by this same deployment, from /portfolio.html instead of
 * /index.html. The two slug namespaces are one DNS label space, so a label is
 * resolved against BOTH the chapter bundle and the member endpoint at once,
 * and a chapter always wins a collision (mint-time exclusion on the
 * dashboard side is meant to keep collisions from ever happening; this is
 * the belt to that suspender).
 *
 * So: resolve the label from the hostname, fetch what the page is about to
 * fetch anyway, and rewrite the head. Everything here FAILS OPEN — any miss,
 * error or timeout serves the untouched static page, which is what a fork on
 * its own domain gets too (no subdomain, no slug, no rewrite).
 */

export const config = { matcher: "/" };

const HUB_DOMAIN = "all-ai-network.org";
const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";
const NETWORK_NAME = "ALL Applied AI Network";

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

/** Hand the request to the static site untouched. Returning nothing is the
 *  cheapest possible fallback — no extra fetch, and nothing that can throw —
 *  which matters because ANY error thrown here is a 500 on a chapter's
 *  homepage. This middleware exists to improve a meta tag; it must never be
 *  the reason a site is down. */
const passThrough = undefined;

/** Both lookups share one wall-clock budget: they are fired together, each
 *  with its own 2 s abort, so the slowest possible middleware pass is still
 *  ~2 s, not 4 — a member page must not pay for the chapter miss first. */
const LOOKUP_TIMEOUT_MS = 2000;

/** Fetch one of our own static pages and swap its head. Shared by the two
 *  branches so the STRIP discipline is written once. */
async function rewriteHead(
  origin: string,
  page: "/index.html" | "/portfolio.html",
  head: string,
  cacheControl: string,
): Promise<Response | undefined> {
  // Only now is the origin HTML actually needed. Fetching it up front meant a
  // blip on that request threw a 500 even for the paths that never used it.
  let res: Response;
  try {
    res = await fetch(new URL(page, origin), {
      headers: { accept: "text/html" },
    });
  } catch {
    return passThrough;
  }
  if (!res.ok) return passThrough;

  let html: string;
  try {
    html = await res.text();
  } catch {
    return passThrough;
  }
  for (const re of STRIP) html = html.replace(re, () => "");
  html = html.replace(/<\/head>/i, () => `    ${head}\n  </head>`);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

/** The chapter branch — unchanged in behaviour from before member pages
 *  existed: alias → 301 to the current slug; otherwise index.html with the
 *  chapter's own title, description and card. */
async function chapterHead(
  url: URL,
  slug: string,
  res: Response,
): Promise<Response | undefined> {
  let name = "", tagline = "", image = "", university = "";
  const requestedEvent = url.searchParams.get("event")?.trim().toLowerCase() ?? "";
  const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestedEvent)
    ? requestedEvent : "";
  let eventTitle = "", eventDescription = "", eventImage = "";
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
    const data = await res.json();
    const cfg = data?.config ?? data ?? {};
    const chapter = data?.chapter ?? {};

    /* The dashboard resolves slugs a chapter used to have as well as the one
       it holds now, so this address may be an old one. Send visitors (and
       crawlers) to the current address rather than serving the chapter on
       two hostnames — a rename would otherwise leave every shared link
       working but pointing at a name the chapter has moved on from. */
    const canonical = String(chapter.slug ?? "").trim().toLowerCase();
    if (canonical && canonical !== slug) {
      return new Response(null, {
        status: 301,
        headers: {
          location: `https://${canonical}.${HUB_DOMAIN}${url.pathname}${url.search}`,
          "cache-control": "public, max-age=0, s-maxage=300",
        },
      });
    }
    name = String(cfg.hub_name ?? chapter.name ?? "").trim();
    tagline = String(cfg.tagline ?? cfg.description ?? "").trim();
    image = String(cfg.logo_url ?? "").trim();
    generatedCard = image.includes("/api/public/chapter-logo/");
    image = image.replace(
      "/api/public/chapter-logo/",
      () => "/api/public/chapter-card/",
    );
    university = String(chapter.university ?? cfg.university ?? "").trim();
    // The bundle includes only this chapter's published hosted/co-hosted
    // events. Never borrow another chapter's event for a shared-link card.
    const event = eventId && Array.isArray(data?.events)
      ? data.events.find((entry: { id?: string }) => entry.id === eventId) : null;
    if (event) {
      eventTitle = String(event.title ?? "").trim();
      eventDescription = String(event.description ?? "").trim().slice(0, 300);
      eventImage = String(event.image_url ?? "").trim();
    }
  } catch {
    return passThrough; // a malformed bundle must not take the site down
  }

  if (!name) return passThrough;

  const description = eventId
    ? eventDescription || `Event details, schedule and ways to take part with ${name}.`
    : tagline ||
    (university
      ? `The applied AI club at ${university}. Events, projects and workshops — no experience required.`
      : "A student-run applied AI community.");
  const title = eventId ? `${eventTitle || "Event"} — ${name}` : `${name} — ${NETWORK_NAME}`;
  const pageUrl = `https://${url.host}/${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`;
  if (eventImage) {
    image = eventImage;
    generatedCard = true;
  }

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

  // The bundle changes when an officer edits their site, not per request.
  return rewriteHead(
    url.origin,
    "/index.html",
    head,
    eventId ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600",
  );
}

/** The member branch — /portfolio.html with the member's name, one-line
 *  description and the dashboard-rendered 1200x630 card. The head mirrors
 *  what src/portfolio.ts sets client-side, for the bots that never run it. */
async function memberHead(
  url: URL,
  slug: string,
  res: Response,
): Promise<Response | undefined> {
  let name = "", headline = "", chapterName = "", updatedAt = "";
  try {
    const data = await res.json();
    name = String(data?.name ?? "").trim();
    headline = String(data?.headline ?? "").trim();
    chapterName = String(data?.chapter?.name ?? "").trim();
    updatedAt = String(data?.updatedAt ?? "").trim();
  } catch {
    return passThrough; // a malformed bundle must not take the page down
  }

  if (!name) return passThrough;

  // Same wording as the /p/ sheet's describe(): true, short, never a placeholder.
  const description =
    headline ||
    (chapterName ? `Member of ${chapterName}` : `Member of the ${NETWORK_NAME}`);
  const title = `${name} — ${chapterName || "Portfolio"}`;
  const pageUrl = `https://${url.host}/`;

  /* Unfurl caches key on the image URL, so a republish that changes the
     card would otherwise show the old one for as long as LinkedIn or Slack
     felt like keeping it. The bundle's updatedAt is the version. */
  const version = Date.parse(updatedAt);
  const image =
    `${DASHBOARD_ORIGIN}/api/public/member-card/${encodeURIComponent(slug)}` +
    (Number.isFinite(version) ? `?v=${version}` : "");

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="${esc(NETWORK_NAME)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<link rel="canonical" href="${esc(pageUrl)}">`,
  ].join("\n    ");

  // Shorter than the chapter's 300 s so an Unpublish bites within a minute.
  return rewriteHead(
    url.origin,
    "/portfolio.html",
    head,
    "public, s-maxage=60, stale-while-revalidate=600",
  );
}

export default async function middleware(
  req: Request,
): Promise<Response | undefined> {
  try {
    const url = new URL(req.url);
    const slug = hostnameSlug(url.host);

    if (!slug) return passThrough;

    const enc = encodeURIComponent(slug);
    const [chapter, member] = await Promise.allSettled([
      fetch(`${DASHBOARD_ORIGIN}/api/public/chapter/${enc}/bundle`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      }),
      fetch(`${DASHBOARD_ORIGIN}/api/public/member/${enc}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      }),
    ]);

    // Chapter wins a collision: a club's homepage is never displaced by a
    // member who happened to mint the same label. The losing response is
    // simply dropped, body unread.
    if (chapter.status === "fulfilled" && chapter.value.ok) {
      return chapterHead(url, slug, chapter.value);
    }
    if (member.status === "fulfilled" && member.value.ok) {
      return memberHead(url, slug, member.value);
    }
    return passThrough; // neither knows the label: the static page as today
  } catch {
    return passThrough; // unreachable dashboard must not take the site down
  }
}
