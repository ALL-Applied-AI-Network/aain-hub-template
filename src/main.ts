/**
 * Hub template entry — fetches everything from the dashboard's public
 * bundle endpoint on load, then renders every section.
 *
 * The bundle endpoint (/api/public/chapter/{slug}/bundle) returns:
 *   { chapter, config, events, leaderboard, badges, merch }
 *
 * Nothing in this file requires an API key — the bundle is public
 * (slug-keyed) so we can fetch safely from the client without
 * leaking credentials into the Vite bundle. Changes on the dashboard
 * propagate to every hub site on next page load; no rebuild needed.
 */

import { renderBrainMark } from "./brain-mark";
import { applyCaptureMode, isCaptureStill } from "./lib/capture";
import { escapeHtml, escapeAttr } from "./lib/html";
import { hostnameSlug, isDashboardPreview } from "./lib/slug";
import { eventFromSearch, eventPageHref, mountEventPage } from "./event-page";
import type {
  ChapterBundle,
  EventRow,
  HubConfig,
  LocalContentEntry,
  Officer,
  ProjectRow,
  RemoteConfig,
} from "./lib/bundle";
import { formatCount, officerInitials, plural } from "./lib/format";
import { safeHttpUrl } from "./lib/net";
import { renderGridEmpty } from "./lib/primitives";
import {
  futureEventsAscending,
  latestPastEvent,
  nextEvent,
  pastEventsDescending,
} from "./lib/events";
import { termLineParts } from "./lib/season";
import { MOUNT, viewContext, type ViewCtx } from "./lib/view";
/* Side-effect imports: each view module registers itself into MOUNT at
   load, so showPage() can find it by page key. */
import "./views/officers";
import "./views/members";
import "./views/events";
import "./views/projects";
import "./views/learn";
/* Named imports from the same view modules: the landing page shows a
   sample of each room, and a sample rendered by a second copy of the
   renderer is a sample that drifts from the room. One event row, one
   feature card, one project card, one ranking. */
import { renderEventRow, renderFeatureCard } from "./views/events";
import { deriveYearFilters, renderProjectCard } from "./views/projects";
import { rankByPoints, renderBoardRow, scoredRows } from "./views/members";
import { renderStartHereBand, startCurriculumFetch } from "./views/learn";

/* Capture mode is decided before anything renders, so ?still=1 never
   catches a frame that already started animating. See lib/capture.ts. */
const captureStill = applyCaptureMode(document.documentElement);

/* Boot blanking. The hero ships with the template's own placeholder
   text in it, so without this a visitor sees "My AI Club" before
   renderIdentity replaces it — another club's name, on this club's
   site. Added from JS rather than from the markup deliberately: if this
   module never loads at all, nothing blanked the hero, and a FOUC beats
   a permanently empty page. init()'s `finally` removes it. */
document.body.classList.add("is-booting");

declare const __HUB_CONFIG__: HubConfig;

const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/* ──────────────────────────────────────────────────────────────────
   Page structure — fixed for v1. Each section's data-page attribute
   in index.html maps it to one of these; sections not listed here
   are treated as part of the first page (defensive default).
   Later we can make the page structure dashboard-editable, but for
   now this gives us a grouped tabbed site without a schema change.
   ────────────────────────────────────────────────────────────────── */

interface Page {
  key: string;
  label: string;
  sections: string[]; // for deciding when a page is "empty"
}

/* Six destinations. The order is fixed and is never data-sorted: a nav
   that reorders per chapter is a nav nobody can learn.

   sections[] lists only *data-driven* sections — the ones an eboard can
   toggle off, or that vanish when their data array is empty. The doors
   strip and the per-page CTA bands are not here: they carry data-page
   but deliberately no data-section, so they sit outside the toggle
   system and cannot keep an otherwise-empty page alive.

   Home's list is six keys long because Home carries a *window* onto
   each destination. Two elements then legitimately share a data-section
   value — the home band and the full view — which is why
   pagesWithContent() and hideSection() are both page-scoped. */
const PAGES: Page[] = [
  { key: "home", label: "Home", sections: ["hero", "events", "leaderboard", "projects", "officers", "learning_tree"] },
  // Promoted from a home section to a destination: MSOE has run 59
  // events over three years and this site rendered one of them.
  { key: "events", label: "Events", sections: ["events"] },
  { key: "projects", label: "Projects", sections: ["projects"] },
  // The tree itself, plus a native index above it. Workshops and
  // playbooks live on the content CDN and are not mirrored here.
  { key: "learn", label: "Learn", sections: ["learning_tree"] },
  // Its own tab, named Officers, because that is what Ben asked for.
  // Team holding a 200-row leaderboard buried it.
  { key: "officers", label: "Officers", sections: ["officers", "about"] },
  // Earn points → get recognised → redeem is one story. Merch folds in
  // here: it was empty on 11 of 12 chapters, and a tab that is usually
  // empty is worse than no tab.
  { key: "members", label: "Members", sections: ["leaderboard", "badges", "merch"] },
];

/** Dashboard route each section can be edited from — used by the
 *  preview-mode click-to-edit overlay. Empty = non-editable. */
const SECTION_EDIT_INFO: Record<
  string,
  { path: string; label: string; kind: "internal" | "external" }
> = {
  hero: { path: "/website", label: "Customize → Identity", kind: "internal" },
  // The doors strip + per-page CTA bands intentionally aren't here —
  // they're decorations without data-section, so the click-to-edit
  // overlay never finds them and there's nothing for the eboard to
  // tweak per-section in the dashboard.
  about: { path: "/website", label: "Customize → About", kind: "internal" },
  events: { path: "/events", label: "Events page", kind: "internal" },
  leaderboard: { path: "/people", label: "Members page", kind: "internal" },
  badges: { path: "/awards", label: "Badges & Awards", kind: "internal" },
  merch: { path: "/merch", label: "Merch page", kind: "internal" },
  projects: { path: "/projects", label: "Projects page", kind: "internal" },
  officers: { path: "/website", label: "Customize → Officers", kind: "internal" },
  learning_tree: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
  workshops: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
  playbooks: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
};

/* Types moved to ./lib/bundle — the view modules need the same shapes
   and a second copy would drift. Imported at the top of this file. */

const config = __HUB_CONFIG__;

/* ──────────────────────────────────────────────────────────────────
   Preview mode — dashboard's Customize tab iframes this with
   ?preview=1 + theme/logo/sections + slug params. In preview mode
   we still fetch the bundle so the iframe shows the chapter's
   actual data; URL params layer in-progress edits on top. See
   hub/README for the param table.
   ────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────
   Bundle fetch — single round trip for config + data
   ────────────────────────────────────────────────────────────────── */

/** The whole archive, not the upcoming window.
 *
 *  The bundle route has supported `events=all` since it was written and
 *  this site had never sent it, so MSOE rendered 1 of its 59 events
 *  under a hero that said "59 Events". Measured: 30 KB gzipped for all
 *  59, one request, no waterfall. It also repairs the flyer's title
 *  lookup — `events.find(e => e.id === eventId)` missed every past
 *  event, so a shared archive link opened as "Event — MSOE AI Club".
 *
 *  `events=all` returns events DESCENDING; the old window returned them
 *  ascending. Anything reading "what is next" must sort its own
 *  ascending copy — see futureEventsAscending() in lib/events.
 *
 *  leaderboard_limit is deliberately NOT sent: the leaderboard query
 *  has no consent filter, so raising 20 rows is a privacy change Ben
 *  has not agreed to, not a clamp. */
const BUNDLE_QUERY = "?events=all&events_limit=200";

async function fetchBundle(slug: string): Promise<ChapterBundle | null> {
  if (!slug) return null;
  try {
    const res = await fetch(
      `${DASHBOARD_ORIGIN}/api/public/chapter/${encodeURIComponent(
        slug.toLowerCase(),
      )}/bundle${BUNDLE_QUERY}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ChapterBundle;
  } catch {
    // Dashboard unreachable / CORS hiccup — we'll fall back to bundled
    // hub.config.json and skip the data-driven sections.
    return null;
  }
}

/** Does the dashboard publish a member portfolio under this label? */
async function isPublishedMember(slug: string): Promise<boolean> {
  if (!slug) return false;
  try {
    const res = await fetch(
      `${DASHBOARD_ORIGIN}/api/public/member/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────────
   Under construction
   ──────────────────────────────────────────────────────────────────
   When the bundle can't be loaded there is no chapter data to show —
   no events, no members, no officers. The site used to fall through to
   whatever was left in hub.config.json, which on an unconfigured fork is
   the template's sample club: "My AI Club", a fake president, invented
   events. It looked completely real, so nobody ever found out their site
   was broken. Three of the four live chapter sites were serving that.

   A visitor gets a clean themed holding page instead. The person who owns
   the site gets the actual diagnosis in the console — that detail is for
   them, not for whoever wandered onto the page.
   ────────────────────────────────────────────────────────────────── */

function renderUnderConstruction(opts: {
  hubName: string;
  slug: string;
  reason: string;
}) {
  console.warn(
    `[ALL hub] This site can't load its chapter data, so it's showing the ` +
      `holding page instead of sample content.\n` +
      `Reason: ${opts.reason}\n` +
      `It is asking the dashboard for the chapter "${opts.slug || "(none set)"}".\n` +
      `Fix: set "hub_id" in hub.config.json to your chapter's slug — or open ` +
      `the Website page in your dashboard and use "Relink my site".`,
  );

  document.body.classList.add("is-holding");
  document.body.innerHTML = `
    <main class="holding" role="main">
      <div class="holding__inner">
        <div class="holding__mark" aria-hidden="true"></div>
        <h1 class="holding__title">Sorry — this site is under construction</h1>
        <p class="holding__body">
          ${escapeHtml(opts.hubName || "This chapter")} is still setting things
          up. Check back soon.
        </p>
      </div>
    </main>
  `;
}

/* ──────────────────────────────────────────────────────────────────
   Theme + layout primitives
   ────────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function applyTheme(theme: { primary: string; accent: string }) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", theme.primary);
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-primary-rgb", hexToRgb(theme.primary));
  root.style.setProperty("--color-accent-rgb", hexToRgb(theme.accent));
}

function applyLogo(logoUrl: string | null) {
  for (const id of ["nav-logo-img", "footer-logo-img"]) {
    const img = document.getElementById(id) as HTMLImageElement | null;
    if (!img) continue;
    if (logoUrl) {
      img.src = logoUrl;
      img.hidden = false;
      img.setAttribute("aria-hidden", "false");
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      img.setAttribute("aria-hidden", "true");
    }
  }
  // Hide the acronym when a real logo is shown in the nav, to avoid
  // a double-brand effect.
  const acronym = document.getElementById("nav-acronym");
  if (acronym) acronym.style.display = logoUrl ? "none" : "";
  applyFavicon(logoUrl);
}

/** Tab icon. The page ships without one, so a chapter that uploaded a logo
 *  would otherwise show the browser's blank default. With no logo we leave
 *  the head alone rather than inventing an icon. `type` is deliberately not
 *  set: the upload accepts png, jpeg, webp, svg and gif, and the browser
 *  sniffs the real type better than a guess would. */
function applyFavicon(logoUrl: string | null) {
  if (!logoUrl) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = logoUrl;
}

/** The hero mark: the chapter's uploaded logo when it has one, otherwise
 *  the generated brain in its colours. The brain is the fallback, not a
 *  competitor, so a chapter that took the trouble to upload a logo sees
 *  that logo front and centre. If the image fails to load we fall back to
 *  the brain rather than leave the hero with a broken-image icon. */
function renderHeroMark(
  el: HTMLElement | null,
  logoUrl: string | null,
  acronym: string | null,
) {
  if (!el) return;
  if (!logoUrl) {
    renderBrainMark(el, acronym);
    return;
  }
  const img = document.createElement("img");
  img.className = "hero__logo";
  // Decorative: #hero-mark is aria-hidden and the h1 already names the club.
  img.alt = "";
  img.decoding = "async";
  img.onerror = () => renderBrainMark(el, acronym);
  img.src = logoUrl;
  el.replaceChildren(img);
}

function applySectionToggles(sections: Record<string, boolean>) {
  // Remove sections (and their nav links) when a key is explicitly
  // false. Missing keys default to ON. A section-key like "events"
  // matches elements with `data-section="events"`.
  for (const [key, on] of Object.entries(sections)) {
    if (on) continue;
    document.querySelectorAll(`[data-section="${key}"]`).forEach((el) => el.remove());
  }
}

/* ──────────────────────────────────────────────────────────────────
   Identity (name / acronym / tagline / about) + hero CTAs
   ────────────────────────────────────────────────────────────────── */

function setText(id: string, text: string | null | undefined) {
  const el = document.getElementById(id);
  if (!el) return;
  if (text == null || text.length === 0) {
    el.textContent = "";
    return;
  }
  el.textContent = text;
}

function renderIdentity(
  remote: RemoteConfig | null,
  chapter: ChapterBundle["chapter"] | null,
) {
  const hubName = remote?.hub_name ?? chapter?.name ?? config.hub_name;
  const hubAcronym =
    remote?.hub_acronym ?? config.hub_acronym ?? hubName.slice(0, 4);
  // The chapter's own tagline or nothing. The old chain fell through
  // config.description to "A student-run applied AI community.", which
  // was live on MSOE under their real name and is the single loudest
  // generated-for-us tell on the property. Silence is the club's voice
  // too. .hero__subtitle:empty collapses the gap.
  const tagline = (remote?.tagline ?? "").trim();
  const university = chapter?.university ?? config.university;

  document.title = `${hubName} — ALL Applied AI Network`;
  const meta = document.querySelector('meta[name="description"]');
  // The og/meta description still needs a sentence even when the hero
  // shows none — a blank description in a link unfurl is worse than a
  // plain one. It never renders on the page.
  if (meta) {
    meta.setAttribute(
      "content",
      tagline || `${hubName} at ${university} — part of the ALL Applied AI Network.`,
    );
  }

  setText("nav-acronym", hubAcronym);
  setText("nav-hub-name", hubName);
  setText("hero-title", hubName);
  setText("hero-subtitle", tagline);
  setText("hero-university", university);
  setText("footer-hub-name", hubName);
  setText("footer-university", university);

  // Long-name guard, measured from the content and not the viewport.
  // ROAR's hub_name is "Rose Organization for AI Readiness" — 34
  // characters against clamp(2.75rem, 7vw, 5.25rem), where its first
  // word alone fills a phone.
  document
    .getElementById("hero-title")
    ?.classList.toggle("hero__title--long", hubName.length > 22);
}

/**
 * Hero CTAs.
 *
 * An authored slot renders exactly as it always has — an officer who
 * filled one in meant it, and their Discord invite is a better first
 * click than anything we could compute.
 *
 * The DEFAULTS are what changed. They used to be three fixed buttons,
 * one of which anchored at the events section — computed before
 * hideSection() ran, so on a chapter with no events it pointed at a
 * section that was about to be deleted. ROAR shipped that dead button.
 * Resolving the default to an event id instead removes the whole bug
 * class and drops the visitor straight into the flyer, where join,
 * RSVP and teams actually live:
 *
 *   a future event exists  → "Join our next event" → ?event={id}
 *   any event exists       → "See what we ran"     → #events
 *   neither                → "Become a partner"    → #sponsor
 *
 * One default button, not three. `.hero__actions:empty` collapses the
 * row if even that cannot be resolved.
 */
function renderHeroActions(
  remote: RemoteConfig | null,
  events: EventRow[],
  livePages: Set<string>,
) {
  const container = document.getElementById("hero-actions");
  if (!container) return;
  container.innerHTML = "";

  type HeroCta = {
    label: string;
    href: string;
    style: "primary" | "ghost" | "ghost-accent";
    /** True for a value the chapter typed. Officer-authored hrefs are
     *  scheme-checked; the ones we compute are not, because
     *  eventPageHref() returns a same-origin path and safeHttpUrl()
     *  rejects every path that is not an absolute URL — which silently
     *  swallowed the default button on every chapter with an event. */
    authored: boolean;
  };

  const authored = (
    label: string | null | undefined,
    href: string | null | undefined,
    style: HeroCta["style"],
  ): HeroCta | null => {
    const l = label?.trim();
    const h = href?.trim();
    // A label with no href is a button that goes nowhere; an href with
    // no label is a button with nothing on it. Both need both.
    return l && h ? { label: l, href: h, style, authored: true } : null;
  };

  const buttons: HeroCta[] = [
    authored(remote?.cta_primary_label, remote?.cta_primary_href, "primary"),
    authored(remote?.cta_secondary_label, remote?.cta_secondary_href, "ghost"),
    authored(remote?.cta_tertiary_label, remote?.cta_tertiary_href, "ghost-accent"),
  ].filter((b): b is HeroCta => b !== null);

  if (!buttons.length) {
    const next = nextEvent(events);
    if (next) {
      buttons.push({
        label: "Join our next event",
        href: eventPageHref(next.id, window.location.pathname),
        style: "primary",
        authored: false,
      });
    } else if (events.length) {
      buttons.push({ label: "See what we ran", href: "#events", style: "primary", authored: false });
    } else if (livePages.has("learn")) {
      // No events at all: 8 of 12 chapters. The curriculum band IS the
      // page here, so the masthead points at it. It used to say
      // "Become a partner", which the partner band two screens down
      // already says in the same words on the same button — the only
      // two buttons on the page were the same button.
      buttons.push({ label: "Start the curriculum", href: "#learn", style: "primary", authored: false });
    } else {
      // Nothing to show and nowhere to send them but the inbox. The
      // partner CTA posts to the dashboard rather than a per-officer
      // mailto, so the thread survives eboard turnover.
      buttons.push({ label: "Become a partner", href: "#sponsor", style: "primary", authored: false });
    }
  }

  for (const b of buttons) {
    const a = document.createElement("a");
    const styleClass =
      b.style === "primary"
        ? "btn--primary"
        : b.style === "ghost-accent"
          ? "btn--ghost btn--ghost-accent"
          : "btn--ghost";
    a.className = `btn ${styleClass}`;
    // An officer-authored href comes out of the dashboard bundle as raw
    // text. Assigning it straight to a.href executed javascript: URLs on
    // click (security audit 2026-08-18, finding 3), so it is
    // scheme-checked first. The computed defaults skip that check
    // because they are ours, and because the check rejects the
    // same-origin "?event={id}" path they are made of.
    const href = b.authored ? safeCtaHref(b.href) : b.href;
    if (!href) continue;
    a.href = href;
    // Only true externals open in a new tab — anchor + mailto + tel
    // stay in the current window.
    if (/^https?:\/\//.test(href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.textContent = b.label;
    container.appendChild(a);
  }
}

/* ──────────────────────────────────────────────────────────────────
   Per-page CTA bands — one at the bottom of each page, giving visitors
   a clear next step in the language of the room they are standing in.
   Home's is the partner band; it had none before, so a sponsor reading
   the landing page ran out of page.
   ────────────────────────────────────────────────────────────────── */

interface PageCtaBandCopy {
  kicker: string;
  title: string;
  desc: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const PAGE_CTA_BANDS: Record<string, PageCtaBandCopy> = {
  home: {
    kicker: "Get in touch",
    title: "Sponsoring, speaking, or hiring?",
    desc: "The eboard reads this inbox, and it survives every handover.",
    primary: { label: "Become a partner", href: "#sponsor" },
    secondary: { label: "Meet the officers", href: "#officers" },
  },
  projects: {
    kicker: "Build with us",
    title: "Want to ship a project with the chapter?",
    desc: "Members pitch ideas every semester and team up into Innovation Labs cohorts. Show up to a meeting, propose a project, recruit collaborators — eboard helps you scope it end-to-end.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Meet the officers", href: "#officers" },
  },
  officers: {
    kicker: "Get in touch",
    title: "Running something? Reach out.",
    desc: "Sponsoring events, guest-speaking, recruiting our members, or joining the eboard — we reply fast. The whole eboard is a student team, and we love outside-of-class opportunities to build together.",
    primary: { label: "Become a partner", href: "#sponsor" },
    secondary: { label: "See our projects", href: "#projects" },
  },
  learn: {
    kicker: "Go deeper",
    title: "Pair the curriculum with a weekly build session.",
    desc: "The tree covers the theory; our workshops and speaker nights cover the applied side. Come to one, no prior experience needed — every track starts from zero.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Meet the officers", href: "#officers" },
  },
  members: {
    kicker: "Earn & redeem",
    title: "Points are earned in person.",
    desc: "Every event check-in, shipped project, and recognition earns points. See any eboard member at a meeting to redeem — no online checkout, no shipping, all in-person.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Meet the officers", href: "#officers" },
  },
};

/** Every secondary CTA on these bands points at a destination, and on
 *  a chapter with no officers the Officers tab does not exist — NTUA
 *  shipped a "Meet the officers" button that jumped nowhere. A hash
 *  href is only rendered when its destination is one of the live
 *  pages; anything else (mailto, an absolute URL) is left alone. */
function ctaTargetLives(href: string, livePages: Set<string>): boolean {
  if (!href.startsWith("#")) return true;
  const key = href.slice(1).split("/")[0];
  // #sponsor is not a page: it falls through to home and opens the
  // sponsor modal (wireSponsorHashRoute), so it always resolves.
  if (key === "sponsor" || key === "") return true;
  return livePages.has(key);
}

function renderPageCtaBands(livePages: Set<string>) {
  for (const [pageKey, copy] of Object.entries(PAGE_CTA_BANDS)) {
    const band = document.querySelector<HTMLElement>(
      `.page-cta-band[data-page="${pageKey}"]`,
    );
    if (!band) continue;

    // A band whose primary target does not exist is not a band with a
    // dead button — it is a band whose whole premise is false. The
    // Learn band says "pair the curriculum with a weekly build
    // session… come to one", and on the eight chapters that have never
    // run an event that is the template describing a club that does
    // not exist yet. The copy goes with the link.
    if (!ctaTargetLives(copy.primary.href, livePages)) {
      band.remove();
      continue;
    }

    const secondaryHtml =
      copy.secondary && ctaTargetLives(copy.secondary.href, livePages)
        ? `<a class="btn btn--ghost" href="${escapeAttr(copy.secondary.href)}">${escapeHtml(copy.secondary.label)}</a>`
        : "";
    band.innerHTML = `
      <div class="page-cta-band__inner">
        <div class="page-cta-band__copy">
          <div class="page-cta-band__kicker">${escapeHtml(copy.kicker)}</div>
          <h2 class="page-cta-band__title">${escapeHtml(copy.title)}</h2>
          <p class="page-cta-band__desc">${escapeHtml(copy.desc)}</p>
        </div>
        <div class="page-cta-band__actions">
          <a class="btn btn--primary" href="${escapeAttr(copy.primary.href)}">${escapeHtml(copy.primary.label)}</a>
          ${secondaryHtml}
        </div>
      </div>
    `;
  }
}

/* ──────────────────────────────────────────────────────────────────
   Sponsor inquiry modal — triggered by the `#sponsor` hash route,
   which is the default href for the hero's partner CTA. Posts to
   the dashboard's public sponsor endpoint so inquiries land in the
   chapter's Inbox tab instead of a disappearing mailto thread.

   Why network-hosted instead of mailto: eboard leadership turns over
   every year or two, and any email history tied to a graduating
   officer's inbox leaves with them. A network-hosted inbox persists
   across that turnover so the next eboard inherits the full history.

   Falls back to an alert if no slug is resolvable (e.g., a fork of
   the template deployed without linking to the dashboard). No silent
   swallow — better for a visitor to see "couldn't send, email us at
   …" than to click and get nothing.
   ────────────────────────────────────────────────────────────────── */

let sponsorModalState: {
  slug: string;
  chapterName: string;
  fallbackEmail: string | null;
} | null = null;

function setupSponsorModal(
  slug: string | null,
  chapterName: string,
  remote: RemoteConfig | null,
) {
  // Remove any previous modal DOM so preview-mode hot swaps don't
  // leave stacked modals in the tree.
  document.getElementById("sponsor-modal-root")?.remove();

  if (!slug) {
    sponsorModalState = null;
    return;
  }
  sponsorModalState = {
    slug,
    chapterName,
    fallbackEmail: remote?.social_links?.email ?? null,
  };

  const root = document.createElement("div");
  root.id = "sponsor-modal-root";
  root.className = "sponsor-modal-root";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "sponsor-modal-title");
  root.innerHTML = `
    <div class="sponsor-modal__backdrop" data-close="true" aria-hidden="true"></div>
    <div class="sponsor-modal__panel" role="document">
      <button
        type="button"
        class="sponsor-modal__close"
        aria-label="Close"
        data-close="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="sponsor-modal__head">
        <div class="sponsor-modal__kicker">Partnership inquiry</div>
        <h2 class="sponsor-modal__title" id="sponsor-modal-title">
          Work with ${escapeHtml(chapterName)}
        </h2>
        <p class="sponsor-modal__desc">
          Sponsor an event, bring a speaker, recruit our members, or propose
          something else. Your note lands directly in the eboard's inbox —
          they'll get back within a few days.
        </p>
      </div>
      <form class="sponsor-modal__form" novalidate>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-name">Your name *</label>
          <input class="sponsor-field__input" id="sponsor-name" name="name" type="text" required maxlength="200" autocomplete="name" />
        </div>
        <div class="sponsor-field sponsor-field--row">
          <div class="sponsor-field__col">
            <label class="sponsor-field__label" for="sponsor-email">Email *</label>
            <input class="sponsor-field__input" id="sponsor-email" name="email" type="email" required maxlength="320" autocomplete="email" />
          </div>
          <div class="sponsor-field__col">
            <label class="sponsor-field__label" for="sponsor-company">Company / organization</label>
            <input class="sponsor-field__input" id="sponsor-company" name="company" type="text" maxlength="200" autocomplete="organization" />
          </div>
        </div>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-phone">Phone (optional)</label>
          <input class="sponsor-field__input" id="sponsor-phone" name="phone" type="tel" maxlength="50" autocomplete="tel" placeholder="Optional — easier than email if it's time-sensitive" />
        </div>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-message">Message *</label>
          <textarea class="sponsor-field__input sponsor-field__textarea" id="sponsor-message" name="message" required minlength="10" maxlength="5000" rows="5" placeholder="What would you like to partner on? The more detail, the faster we can reply."></textarea>
        </div>
        <!-- Honeypot — display:none on the CSS side, real users never touch
             this, bots that auto-fill every field will. Server drops any
             submission with content here. -->
        <div class="sponsor-field__honeypot" aria-hidden="true">
          <label>Website <input name="website" type="text" tabindex="-1" autocomplete="off" /></label>
        </div>
        <div class="sponsor-modal__status" role="status" aria-live="polite"></div>
        <div class="sponsor-modal__actions">
          <button type="button" class="btn btn--ghost" data-close="true">Cancel</button>
          <button type="submit" class="btn btn--primary sponsor-modal__submit">
            <span class="sponsor-modal__submit-label">Send inquiry</span>
          </button>
        </div>
      </form>
      <div class="sponsor-modal__success" hidden>
        <div class="sponsor-modal__success-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 class="sponsor-modal__success-title">Got it — thanks for reaching out.</h3>
        <p class="sponsor-modal__success-desc">
          The eboard has your note and typically replies within a few days.
          If anything's urgent, feel free to email us directly.
        </p>
        <button type="button" class="btn btn--primary" data-close="true">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const form = root.querySelector("form") as HTMLFormElement;
  const statusEl = root.querySelector(".sponsor-modal__status") as HTMLElement;
  const successEl = root.querySelector(".sponsor-modal__success") as HTMLElement;
  const submitBtn = root.querySelector(".sponsor-modal__submit") as HTMLButtonElement;
  const submitLabel = root.querySelector(".sponsor-modal__submit-label") as HTMLElement;

  // Close handlers — delegate through the root so each [data-close]
  // element (backdrop + X button + Cancel + success Close) wires up
  // with one listener.
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-close]")) closeSponsorModal();
  });

  // Esc to close, focus-trap-lite within the modal while open.
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSponsorModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.classList.remove("sponsor-modal__status--error");

    const fd = new FormData(form);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim() || null,
      message: String(fd.get("message") ?? "").trim(),
      website: String(fd.get("website") ?? ""),
    };

    if (!body.name || !body.email || !body.message) {
      statusEl.textContent = "Please fill in the required fields.";
      statusEl.classList.add("sponsor-modal__status--error");
      return;
    }
    if (body.message.length < 10) {
      statusEl.textContent = "Add a bit more detail — 10 characters minimum.";
      statusEl.classList.add("sponsor-modal__status--error");
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = "Sending…";
    try {
      const res = await fetch(
        `${DASHBOARD_ORIGIN}/api/public/sponsor/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent =
          (data && typeof data.error === "string" && data.error) ||
          "Couldn't send — please try again.";
        statusEl.classList.add("sponsor-modal__status--error");
        submitBtn.disabled = false;
        submitLabel.textContent = "Send inquiry";
        return;
      }
      // Swap to success state. Keep the modal open so the visitor
      // reads the confirmation rather than a flash that vanishes.
      form.hidden = true;
      successEl.hidden = false;
    } catch {
      statusEl.textContent =
        "Network error — please try again, or email the eboard directly.";
      statusEl.classList.add("sponsor-modal__status--error");
      submitBtn.disabled = false;
      submitLabel.textContent = "Send inquiry";
    }
  });
}

function openSponsorModal() {
  const root = document.getElementById("sponsor-modal-root");
  if (!root || !sponsorModalState) {
    // No modal available — fall back to mailto if the chapter has one
    // configured, else quietly surface the #team page where the
    // eboard emails live.
    const email = sponsorModalState?.fallbackEmail;
    if (email) {
      window.location.href = `mailto:${email}?subject=Partnership inquiry`;
    } else {
      window.location.hash = "#officers";
    }
    return;
  }
  root.hidden = false;
  document.body.classList.add("sponsor-modal-open");
  const nameInput = root.querySelector("#sponsor-name") as HTMLInputElement | null;
  // Defer focus so it fires after the browser paints the modal.
  setTimeout(() => nameInput?.focus(), 30);
}

function closeSponsorModal() {
  const root = document.getElementById("sponsor-modal-root");
  if (!root) return;
  root.hidden = true;
  document.body.classList.remove("sponsor-modal-open");
  // Reset form state so a second open starts fresh. Preserves the
  // content the user typed only if the submit failed — but once
  // they've closed the modal, assume they're starting over.
  const form = root.querySelector("form") as HTMLFormElement | null;
  const success = root.querySelector(".sponsor-modal__success") as HTMLElement | null;
  const status = root.querySelector(".sponsor-modal__status") as HTMLElement | null;
  const submitBtn = root.querySelector(".sponsor-modal__submit") as HTMLButtonElement | null;
  const submitLabel = root.querySelector(".sponsor-modal__submit-label") as HTMLElement | null;
  if (form && success && success.hidden === false) {
    form.reset();
    form.hidden = false;
    success.hidden = true;
  }
  if (status) {
    status.textContent = "";
    status.classList.remove("sponsor-modal__status--error");
  }
  if (submitBtn && submitLabel) {
    submitBtn.disabled = false;
    submitLabel.textContent = "Send inquiry";
  }

  // Clear the hash so re-triggering the CTA re-opens, not no-ops.
  if (window.location.hash === "#sponsor") {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

function wireSponsorHashRoute() {
  function maybeOpen() {
    if (window.location.hash === "#sponsor") openSponsorModal();
  }
  window.addEventListener("hashchange", maybeOpen);
  // Also fire on initial load so a deep link to #sponsor opens the modal.
  maybeOpen();
}

/**
 * The stat strip — members / events / projects, the trio a prospective
 * member or a partner is actually asking about.
 *
 * Two counting laws decide what survives. An entry below 1 is dropped
 * outright (a hero reading `0 · 1 · 0` reads as a broken deploy, which
 * is what ROAR shipped), and the whole strip is hidden when fewer than
 * two entries are left, because a strip is a comparison and one number
 * is not one. Labels are singular at 1.
 *
 * MSOE: 596 Members · 59 Events · 41 Projects.
 * ROAR: one entry survives → no strip.
 * NTUA: none survive → no strip.
 */
function renderStats(
  chapter: ChapterBundle["chapter"] | null,
  projects: ProjectRow[],
): Set<string> {
  const strip = document.getElementById("hero-stats") as HTMLElement | null;
  const shown = new Set<string>();
  if (!strip) return shown;
  strip.innerHTML = "";
  if (!chapter) return shown;

  const entries: { key: string; n: number; one: string; many: string }[] = [
    { key: "members", n: chapter.member_count, one: "Member", many: "Members" },
    { key: "events", n: chapter.event_count, one: "Event", many: "Events" },
    { key: "projects", n: projects.length, one: "Project", many: "Projects" },
  ].filter((s) => s.n >= 1);

  if (entries.length < 2) return shown;

  strip.innerHTML = entries
    .map(
      (s) => `
      <div class="hero__stat">
        <span class="hero__stat-num">${escapeHtml(formatCount(s.n))}</span>
        <span class="hero__stat-label">${escapeHtml(s.n === 1 ? s.one : s.many)}</span>
      </div>`,
    )
    .join("");

  for (const s of entries) shown.add(s.key);
  return shown;
}

/**
 * The term line, under the CTAs. `Fall 2026 · 3 events this term ·
 * Next: Oct 8` — and on a chapter that has run nothing, `Fall 2026`
 * alone. Every clause is the chapter's own data and any clause that
 * would count zero was already dropped upstream (lib/season.ts).
 *
 * `.term-line:empty` collapses it, so a chapter whose clock is somehow
 * unreadable loses the line rather than printing a fragment.
 */
function renderTermLine(events: EventRow[]) {
  const line = document.getElementById("term-line");
  if (!line) return;
  const parts = termLineParts(events, nextEvent(events));
  // The separator travels INSIDE the clause it introduces. The line
  // wraps at 375px, and a separator that is its own flex item wraps on
  // its own — leaving a "·" dangling at the end of the first line,
  // which reads as a typo rather than as punctuation.
  line.innerHTML = parts
    .map((part, i) => {
      // The first clause is the term itself and is the only one set in
      // the page's own voice; the rest are counts and dates.
      const cls = i === 0 ? "term-line__name" : "term-line__n";
      const sep = i === 0 ? "" : `<span class="term-line__sep" aria-hidden="true">·</span> `;
      return `<span class="${cls}">${sep}${escapeHtml(part)}</span>`;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Sections
   ────────────────────────────────────────────────────────────────── */

/** Remove a section. Used by the data-driven renderers below when the
 *  API returns no rows — empty "no events yet" cards on a public site
 *  read as broken, better to hide the section entirely and surface the
 *  warning on the dashboard.
 *
 *  `page` scopes the removal to one destination. The landing page
 *  carries a window onto several destinations, so two elements can share
 *  a data-section value: the home band and the full view. Passing a page
 *  removes one of them and leaves the other. Passing nothing removes
 *  every instance, which is what an officer switching a section off in
 *  Customize means — see applySectionToggles, which is deliberately
 *  never scoped. */
function hideSection(sectionKey: string, page?: string) {
  const selector = page
    ? `[data-page="${page}"][data-section="${sectionKey}"]`
    : `[data-section="${sectionKey}"]`;
  document.querySelectorAll(selector).forEach((el) => el.remove());
}

/**
 * Remove every destination section the chapter has no data for, BEFORE
 * pagesWithContent() reads the DOM.
 *
 * This has to live here rather than inside the views. A view mounts on
 * first entry to its tab, and the tab is decided by pagesWithContent()
 * at boot — so a view that removes its own empty section removes it
 * after the nav already grew a tab that leads to nothing. The views
 * still prune themselves (they are each other's only defence against a
 * bundle that changed under them); this makes the nav honest.
 *
 * Only destination instances are named. Home's bands decide for
 * themselves, because a home band can have an empty state worth
 * showing — "Points start showing up here once members check in" — and
 * a destination cannot.
 */
function pruneEmptySections(bundle: ChapterBundle | null) {
  const events = bundle?.events ?? [];
  const projects = bundle?.projects ?? [];
  const officers = bundle?.config?.officers ?? [];
  const badges = bundle?.badges ?? [];
  const merch = bundle?.merch ?? [];
  const about = (bundle?.config?.about ?? "").trim();
  // A member on zero points is not a standing — see scoredRows. ML@IIT
  // ships 20 rows of 0 against 100 members, which ranked is twenty tied
  // firsts each printing a zero beside a real student's name.
  const scored = scoredRows(bundle?.leaderboard ?? []).length;

  // Events and projects have no empty state anywhere: a chapter with
  // none of either simply has no band and no tab.
  if (!events.length) hideSection("events");
  if (!projects.length) hideSection("projects");

  if (!officers.length) hideSection("officers");
  if (!about) hideSection("about", "officers");
  if (!scored) hideSection("leaderboard", "members");
  // The badges section carries the three points-explainer cards as well
  // as the wall, and the explainer earns its place whenever there are
  // points OR badges to explain.
  if (!badges.length && !scored) hideSection("badges", "members");
  if (!merch.length) hideSection("merch", "members");
}

/* ──────────────────────────────────────────────────────────────────
   THE LANDING PAGE

   A front door: who this is, what is next, and a sample of each room
   behind the nav. Every sample is rendered by the destination's own
   renderer — renderFeatureCard, renderEventRow, renderProjectCard,
   renderBoardRow, renderStartHereBand — so the sample and the room can
   never disagree about what an event or a tie looks like.
   ────────────────────────────────────────────────────────────────── */

/** Home bands sample three rows / three cards / five names. More than
 *  that is not a sample, it is the destination rendered twice. */
const BAND_ROWS = 3;
const BAND_STANDINGS = 5;
const STRIP_OFFICERS = 6;

/** The band head: a quiet title on the left, a way into the room on the
 *  right. No .section__kicker anywhere on this page — six uppercase
 *  eyebrows at even intervals down one page is the drumbeat. */
function bandHead(title: string, link: { label: string; href: string }): string {
  return `
    <div class="band-head rv">
      <h2 class="band-head__title">${escapeHtml(title)}</h2>
      <a class="band-head__link" href="${escapeAttr(link.href)}">${escapeHtml(link.label)} <span aria-hidden="true">→</span></a>
    </div>`;
}

/** Fill a band's interior, or remove the band. A band that renders its
 *  head and then nothing is the empty grid this pass exists to kill. */
function fillBand(id: string, inner: string): HTMLElement | null {
  const band = document.getElementById(id);
  if (!band) return null;
  if (!inner) {
    band.remove();
    return null;
  }
  band.innerHTML = `<div class="section__inner">${inner}</div>`;
  return band;
}

/* ── 2 — The doors ────────────────────────────────────────────────── */

interface Door {
  key: string;
  name: string;
  href: string;
  n: number;
  /** Singular / plural unit, plus any " since 2023" suffix. */
  unit: string;
  /** One live line out of the bundle — a real title or a real name. */
  line: string;
}

/** The year this chapter's record starts, when the record is long
 *  enough for a start to mean anything. Under twelve months, "since
 *  2026" on a chapter founded in March says nothing. */
function sinceYear(events: EventRow[]): number | null {
  if (!events.length) return null;
  const times = events.map((e) => new Date(e.date).getTime()).filter(Number.isFinite);
  if (!times.length) return null;
  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  const TWELVE_MONTHS = 365 * 24 * 60 * 60 * 1000;
  return span < TWELVE_MONTHS ? null : new Date(first).getFullYear();
}

function renderDoor(d: Door, heroPrinted: Set<string>): string {
  // Law 2: never headline a one. ROAR's Events door reads
  // "Events / Welcome Back Wednesday · Sep 2 →", never a giant 1.
  //
  // And never twice: the stat strip sits ~150px above this row, so on
  // MSOE the hero said "59 Events · 41 Projects" and the doors said
  // "59 events since 2023" and "41 projects" in the same glance. The
  // strip owns the integers it prints; a door that would repeat one
  // keeps its name and its live line, which is the more useful half
  // of the card anyway.
  const count =
    d.n >= 2 && !heroPrinted.has(d.key)
      ? `<div><span class="door__n">${escapeHtml(formatCount(d.n))}</span><span class="door__unit">${escapeHtml(d.unit)}</span></div>`
      : "";
  return `
    <a class="door" href="${escapeAttr(d.href)}" role="listitem">
      <div class="door__name">${escapeHtml(d.name)}</div>
      ${count}
      ${d.line ? `<div class="door__line">${escapeHtml(d.line)}</div>` : ""}
    </a>`;
}

/**
 * Four cards carrying the club's own integers, each a way into a room.
 * Returns the set of destination keys that printed a numeral, so the
 * band heads below do not print the same integer again a hundred pixels
 * further down the same screen.
 *
 * A door whose destination is not in `pages` does not render, and fewer
 * than two doors omits the strip — one door is a link, not a choice.
 * Members is deliberately not a door: the standings band IS the door to
 * it, and five doors on a 375px phone is two rows of squint.
 */
function renderDoors(
  bundle: ChapterBundle,
  pages: Page[],
  lessons: { count: number; first: string },
  heroPrinted: Set<string>,
): Set<string> {
  const printed = new Set<string>();
  const grid = document.getElementById("doors-grid");
  const band = document.getElementById("doors-band");
  if (!grid || !band) return printed;

  const live = new Set(pages.map((p) => p.key));
  const events = bundle.events ?? [];
  const projects = bundle.projects ?? [];
  const officers = bundle.config?.officers ?? [];
  const doors: Door[] = [];

  if (live.has("events") && events.length) {
    const lead = nextEvent(events) ?? latestPastEvent(events);
    const year = sinceYear(events);
    doors.push({
      key: "events",
      name: "Events",
      href: "#events",
      n: events.length,
      // A non-breaking space before the year: at 150px the unit wraps,
      // and "59 events since / 2023" is a worse break than "59 events /
      // since 2023".
      unit: events.length === 1 ? "event" : `events${year ? ` since ${year}` : ""}`,
      line: lead ? lead.title : "",
    });
  }

  if (live.has("projects") && projects.length) {
    doors.push({
      key: "projects",
      name: "Projects",
      href: "#projects",
      n: projects.length,
      unit: projects.length === 1 ? "project" : "projects",
      line: projects[0]?.title ?? "",
    });
  }

  if (live.has("officers") && officers.length) {
    const lead = officers[0];
    const role = (lead?.role ?? "").trim();
    doors.push({
      key: "officers",
      name: "Officers",
      href: "#officers",
      n: officers.length,
      unit: officers.length === 1 ? "officer" : "officers",
      // An empty role renders nothing rather than a dangling comma:
      // ROAR's one officer has role: "".
      line: lead ? (role ? `${lead.name}, ${role}` : lead.name) : "",
    });
  }

  if (live.has("learn") && lessons.count) {
    doors.push({
      key: "learn",
      name: "Learn",
      href: "#learn",
      n: lessons.count,
      unit: lessons.count === 1 ? "lesson" : "lessons",
      line: lessons.first,
    });
  }

  if (doors.length < 2) {
    band.remove();
    return printed;
  }

  grid.innerHTML = doors.map((d) => renderDoor(d, heroPrinted)).join("");
  for (const d of doors) if (d.n >= 2) printed.add(d.key);
  return printed;
}

/* ── 3 — What's on ───────────────────────────────────────────────── */

function renderEventsBand(bundle: ChapterBundle, printed: Set<string>) {
  const events = bundle.events ?? [];
  if (!events.length) return;

  const byId = new Map(events.map((e) => [e.id, e]));
  // The first future event, or the most recent past one labelled for
  // what it is. A chapter with nothing scheduled still has something to
  // show; it just does not pretend the date is ahead.
  const next = nextEvent(events);
  const feature = next ?? latestPastEvent(events);
  if (!feature) return;

  // No object appears twice in one screen: whatever is in the feature
  // slot is skipped in the rows under it.
  const rows = pastEventsDescending(events)
    .filter((e) => e.id !== feature.id)
    .slice(0, BAND_ROWS);

  // The hero strip or the door above already printed "59 events".
  // Printing it again in
  // the link a hundred pixels below is the same integer twice on one
  // screen, so the number is dropped where the door carried it.
  const link =
    events.length >= 2
      ? { label: printed.has("events") ? "All events" : `All ${plural(events.length, "event")}`, href: "#events" }
      : { label: "Open the archive", href: "#events" };

  fillBand(
    "band-events",
    bandHead("What's on", link) +
      `<div class="rv">${renderFeatureCard(feature, byId, { pastLabel: !next })}</div>` +
      (rows.length
        ? `<div class="band-rows">${rows.map((e) => renderEventRow(e, window.location.pathname)).join("")}</div>`
        : ""),
  );
}

/* ── 4 — The people ──────────────────────────────────────────────── */

function renderOfficerChip(o: Officer): string {
  const avatar = o.image_url
    ? `<img src="${escapeAttr(o.image_url)}" alt="" loading="lazy" />`
    : escapeHtml(officerInitials(o.name));
  // A blank role renders no element at all. ROAR's one officer has
  // role: "", and a grey empty line under a name reads as a bug.
  const role = (o.role ?? "").trim();
  return `
    <a class="officer-chip" href="#officers">
      <span class="officer-chip__avatar">${avatar}</span>
      <span class="officer-chip__name">${escapeHtml(o.name)}</span>
      ${role ? `<span class="officer-chip__role">${escapeHtml(role)}</span>` : ""}
    </a>`;
}

/**
 * Two blocks under one head: the officers' faces, and the top of the
 * board. They carry their own data-section so `?off=leaderboard` takes
 * the standings and leaves the strip — which means the head can belong
 * to either one, and is given to whichever survives first.
 */
function renderPeopleBand(bundle: ChapterBundle) {
  const band = document.getElementById("band-people");
  const officersEl = document.getElementById("band-officers");
  const standingsEl = document.getElementById("band-standings");
  if (!band) return;

  const officers = bundle.config?.officers ?? [];
  const rows = scoredRows(bundle.leaderboard ?? []);
  const hasEvents = (bundle.events ?? []).length > 0;
  let headUsed = false;

  if (officersEl) {
    if (!officers.length) {
      officersEl.remove();
    } else {
      const shown = officers.slice(0, STRIP_OFFICERS);
      const rest = officers.length - shown.length;
      officersEl.innerHTML =
        bandHead("The people", { label: "Meet the officers", href: "#officers" }) +
        `<div class="officer-strip">
           ${shown.map(renderOfficerChip).join("")}
           ${rest > 0 ? `<a class="officer-chip officer-chip--more" href="#officers">+${rest} more</a>` : ""}
         </div>`;
      headUsed = true;
    }
  }

  if (standingsEl) {
    if (rows.length) {
      const ranked = rankByPoints(rows).slice(0, BAND_STANDINGS);
      standingsEl.innerHTML =
        (headUsed ? "" : bandHead("The people", { label: "Full leaderboard", href: "#members" })) +
        ranked.map(renderBoardRow).join("") +
        // Law 3: a link says there is more only when there is more.
        (rows.length > BAND_STANDINGS
          ? `<a class="band-head__link band-head__link--under" href="#members">Full leaderboard <span aria-hidden="true">→</span></a>`
          : "");
    } else if (hasEvents) {
      // An empty state that names the fix, and the fix is true for a
      // visitor to read. Without events there is nothing to check into,
      // so the block is removed instead — an empty board on a chapter
      // with no events is an accusation.
      standingsEl.innerHTML =
        (headUsed ? "" : bandHead("The people", { label: "Meet the officers", href: "#officers" })) +
        `<p class="note">Points start showing up here once members check in at an event.</p>`;
    } else {
      standingsEl.remove();
    }
  }

  if (!band.querySelector(".band-head")) band.remove();
}

/* ── 5 — What we've built ────────────────────────────────────────── */

function renderProjectsBand(bundle: ChapterBundle, printed: Set<string>) {
  const projects = bundle.projects ?? [];
  // No empty state and no "coming soon": a club with no projects simply
  // has no projects band on its front page.
  if (!projects.length) return;

  // The newest year group, in bundle order — which is the order
  // officers arranged them in. deriveYearFilters already knows how to
  // sort a free-text year field and which strings it cannot parse.
  const newest = deriveYearFilters(projects)[0]?.year ?? null;
  const pool = newest ? projects.filter((p) => (p.year ?? "").trim() === newest) : projects;
  const shown = (pool.length ? pool : projects).slice(0, BAND_ROWS);

  const link =
    projects.length >= 2
      ? {
          label: printed.has("projects") ? "All projects" : `All ${plural(projects.length, "project")}`,
          href: "#projects",
        }
      : { label: "See the project", href: "#projects" };

  fillBand(
    "band-projects",
    bandHead("What we've built", link) +
      `<div class="projects-grid rv-group" role="list">
         ${shown.map((p) => renderProjectCard(p, window.location.pathname)).join("")}
       </div>`,
  );
}

/**
 * CTA hrefs come from chapter officers. Anchors, mailto: and tel: are
 * legitimate button targets; anything else has to parse as http(s).
 * Returns null for values that should not become a link at all.
 */
function safeCtaHref(raw: string): string | null {
  const h = (raw ?? "").trim();
  if (!h) return null;
  if (h.startsWith("#")) return h;
  if (/^(mailto|tel):[^\s<>"']+$/i.test(h)) return h;
  return safeHttpUrl(h);
}

/* ──────────────────────────────────────────────────────────────────
   Social links footer
   ────────────────────────────────────────────────────────────────── */

const SOCIAL_ICONS: Record<string, string> = {
  discord: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.32 4.37a19.79 19.79 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.2.38-.43.87-.59 1.26a18.27 18.27 0 0 0-5.52 0c-.17-.39-.4-.88-.6-1.26a.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.44 9.05-.27 13.58.1 18.06a.1.1 0 0 0 .04.07 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-2a.07.07 0 0 0-.04-.11 13.1 13.1 0 0 1-1.88-.9.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.3a.08.08 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.07 0a.08.08 0 0 1 .08.01c.12.1.24.2.37.3a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.88.9.08.08 0 0 0-.04.11c.37.7.78 1.37 1.24 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .04-.07c.44-5.18-.73-9.67-3.1-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.22 0 2.19 1.1 2.16 2.42 0 1.33-.94 2.42-2.16 2.42z"/></svg>`,
  github: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.77 5.46.77 11.73c0 4.96 3.22 9.17 7.68 10.66.56.1.77-.24.77-.54v-2.06c-3.13.68-3.79-1.3-3.79-1.3-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.72-1.5-2.5-.28-5.12-1.25-5.12-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.15a10.8 10.8 0 0 1 5.62 0c2.15-1.46 3.09-1.15 3.09-1.15.61 1.54.23 2.69.11 2.97.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.26-5.14 5.54.4.35.76 1.03.76 2.07v3.07c0 .3.21.65.78.54 4.45-1.49 7.67-5.7 7.67-10.66C23.23 5.46 18.27.5 12 .5z"/></svg>`,
  instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37a4 4 0 1 1-7.914 1.172A4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.67H5.67v8.67zM7 8.5a1.54 1.54 0 1 0 0-3.08 1.54 1.54 0 0 0 0 3.08zm11.34 9.84v-4.75c0-2.53-1.35-3.7-3.15-3.7-1.45 0-2.1.8-2.47 1.37V9.67h-2.68s.03.76 0 8.67h2.68v-4.84c0-.24.02-.48.09-.65.18-.48.62-.98 1.35-.98.96 0 1.34.73 1.34 1.8v4.67z"/></svg>`,
  twitter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  youtube: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3 3 0 0 0-2.11-2.12C19.505 3.545 12 3.545 12 3.545s-7.504 0-9.389.521A3 3 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3 3 0 0 0 2.11 2.12c1.885.521 9.389.521 9.389.521s7.504 0 9.389-.521a3 3 0 0 0 2.11-2.12C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"/></svg>`,
  email: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
};

const SOCIAL_LABELS: Record<string, string> = {
  discord: "Discord",
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  youtube: "YouTube",
  email: "Email",
};

function renderSocials(links: Record<string, string>) {
  const container = document.getElementById("footer-socials");
  if (!container) return;

  // Merge remote over bundled so a fresh fork has something.
  const merged: Record<string, string> = { ...(config.links ?? {}) };
  for (const [k, v] of Object.entries(links)) {
    if (v) merged[k] = v;
  }

  const entries = Object.entries(merged).filter(([, v]) => v);
  if (!entries.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = entries
    .map(([key, url]) => {
      const href = key === "email" ? `mailto:${url}` : url;
      const icon = SOCIAL_ICONS[key] ?? SOCIAL_ICONS.email;
      const label = SOCIAL_LABELS[key] ?? key;
      return `<a class="footer-social" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${icon}</a>`;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Learning / Workshops / Playbooks — CDN content
   ────────────────────────────────────────────────────────────────── */

function isLocalPath(path: string): boolean {
  return path.startsWith("local/");
}

function renderCard(entry: {
  title: string;
  description?: string;
  thumbnail?: string;
  path?: string;
  difficulty?: string;
  estimated_minutes?: number;
  isLocal?: boolean;
}): string {
  const local = entry.isLocal || (entry.path && isLocalPath(entry.path));
  const thumbSrc = entry.thumbnail
    ? local
      ? entry.thumbnail
      : `${config.content_url}/${entry.thumbnail}`
    : "";
  const thumb = thumbSrc
    ? `<img class="card__thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy" />`
    : "";

  const badges = [
    entry.difficulty
      ? `<span class="card__badge card__badge--${escapeAttr(
          entry.difficulty,
        )}">${escapeHtml(entry.difficulty)}</span>`
      : "",
    entry.estimated_minutes
      ? `<span class="card__meta">${entry.estimated_minutes} min</span>`
      : "",
    local ? '<span class="card__badge card__badge--local">Chapter</span>' : "",
  ]
    .filter(Boolean)
    .join("");

  const href = entry.path
    ? local
      ? `./article.html?local=${encodeURIComponent(entry.path)}`
      : `./article.html?path=${encodeURIComponent(entry.path)}`
    : "#";

  return `
    <a href="${escapeAttr(href)}" class="card">
      ${thumb}
      <div class="card__body">
        <h3 class="card__title">${escapeHtml(entry.title)}</h3>
        ${badges ? `<div class="card__meta-row">${badges}</div>` : ""}
        ${
          entry.description
            ? `<p class="card__desc">${escapeHtml(entry.description)}</p>`
            : ""
        }
      </div>
    </a>
  `;
}

function isPathExcluded(path: string | undefined): boolean {
  if (!path || !config.content?.exclude_paths?.length) return false;
  return config.content.exclude_paths.some(
    (excluded) => path === excluded || path.startsWith(excluded + "/"),
  );
}

function applyCustomOrder<T extends { path?: string; content_path?: string; title?: string }>(
  items: T[],
): T[] {
  const order = config.content?.custom_order;
  if (!order?.length) return items;
  const orderMap = new Map(order.map((p, i) => [p, i]));
  return items.sort((a, b) => {
    const pathA = a.path || a.content_path || "";
    const pathB = b.path || b.content_path || "";
    const idxA = orderMap.has(pathA) ? orderMap.get(pathA)! : Infinity;
    const idxB = orderMap.has(pathB) ? orderMap.get(pathB)! : Infinity;
    if (idxA !== Infinity || idxB !== Infinity) return idxA - idxB;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

function getLocalContentForSection(
  section: "learning" | "workshops" | "playbooks",
): LocalContentEntry[] {
  return (
    config.content?.local_content?.filter((lc) => lc.section === section) ?? []
  );
}

/**
 * Load the learning tree by embedding the content repo's /tree.html
 * directly in the Learn page. The content repo already ships a full
 * interactive tree visualization (D3-based, with expandable node
 * detail drawers); reimplementing that inside every hub template
 * would duplicate a lot of carefully-tuned code and diverge over
 * time. Iframe lets every chapter site inherit upstream improvements
 * for free.
 *
 * If the iframe never loads (content_url missing, CORS hiccup,
 * content repo down), we flip to a simple fallback message with a
 * link out to the tree page.
 *
 * This only wires the missing-config fallback and the "open full
 * tree" link at boot. Setting frame.src and starting the load
 * timeout is deferred to activateLearningTree() — the iframe is
 * loading="lazy" inside the Learn tab, which is display:none until
 * clicked, so starting an 8 s timer here would race against a load
 * the browser hasn't even attempted yet.
 */
async function loadLearningTree() {
  const frame = document.getElementById(
    "learn-tree-frame",
  ) as HTMLIFrameElement | null;
  const fallback = document.getElementById("learn-tree-fallback");
  if (!frame) return;

  if (!config.content_url) {
    frame.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      renderGridEmpty(
        "learning-grid",
        "Curriculum will appear here",
        "Once the ALL Applied AI Network content library is wired to this site, the tree loads automatically.",
      );
    }
    return;
  }

  // Wire the fallback's "Open the full interactive tree" link in
  // case the iframe itself is ever unreachable. &chapter=<slug> (see
  // learningTreeChapterSlug()) makes the content site fetch THIS
  // chapter's merged tree instead of just the base curriculum.
  const treeLink = document.getElementById(
    "tree-link",
  ) as HTMLAnchorElement | null;
  if (treeLink) {
    const slug = learningTreeChapterSlug();
    treeLink.href = `${config.content_url}/tree.html${
      slug ? `?chapter=${encodeURIComponent(slug)}` : ""
    }`;
  }
}

/** Chapter slug to overlay on the base curriculum — explicit ?slug=
 *  wins (dashboard preview), otherwise this hub's own configured id.
 *  Shared by loadLearningTree()'s fallback link and
 *  activateLearningTree()'s iframe src so both point at the same
 *  chapter's merged tree. */
/* ──────────────────────────────────────────────────────────────────
   Which chapter is this page for?

   The network hosts chapter sites at {slug}.all-ai-network.org from ONE
   deployment of this template, so the hostname is the chapter — not a
   value baked into hub.config.json at build time. That is the whole point:
   a hosted site can never carry a stale hub_id, and a template update
   reaches every chapter the moment it deploys rather than never.

   The baked hub_id remains the fallback, because it is still correct for a
   chapter running its own fork on GitHub Pages, for a self-hosted copy, and
   for local development.
   ────────────────────────────────────────────────────────────────── */

/** The domain whose subdomains are chapters. Overridable so a fork
 *  self-hosting under its own domain still resolves. */
const HUB_DOMAIN = (config.hub_domain ?? "all-ai-network.org").toLowerCase();

/** The chapter this page is for. NEVER reads ?slug= — that is honoured
 *  only in dashboard preview (see the boot path), because a query string
 *  any link can set must not change which chapter a hub site shows
 *  (security audit 2026-08-18, finding 6). */
function canonicalSlug(): string {
  return hostnameSlug(HUB_DOMAIN) || (config.hub_id?.trim().toLowerCase() ?? "");
}

function learningTreeChapterSlug(): string {
  // Deliberately ignores ?slug=: it used to be honoured here even without
  // preview=1, so any link could swap which chapter's tree this hub showed
  // (security audit 2026-08-18, finding 6). The dashboard preview drives
  // the iframe through its own URL, not through this hub's query string.
  return canonicalSlug();
}

let learningTreeActivated = false;

/** Fires the iframe load + 8 s fallback timer. Called once, the
 *  first time the Learn tab is actually shown (see showPage()) —
 *  not at boot, so the timer only starts once the lazy iframe has a
 *  real chance to load. */
function activateLearningTree() {
  if (learningTreeActivated) return;
  const frame = document.getElementById(
    "learn-tree-frame",
  ) as HTMLIFrameElement | null;
  const fallback = document.getElementById("learn-tree-fallback");
  if (!frame || !config.content_url) return;
  learningTreeActivated = true;

  // Point the iframe at the upstream tree page. ?embed=1 is a hint
  // for any future embed tweaks on the content side; &chapter=<slug>
  // makes the content site fetch THIS chapter's merged tree from the
  // dashboard's public endpoint — the chapter's own nodes, colors,
  // and layout render on top of the base curriculum. Older content
  // deploys ignore the param and just show the base tree.
  const slug = learningTreeChapterSlug();
  const chapterParam = slug ? `&chapter=${encodeURIComponent(slug)}` : "";
  frame.src = `${config.content_url}/tree.html?embed=1${chapterParam}`;

  // If the iframe takes more than 8 s to signal load, show the
  // fallback. The content repo is usually sub-second, so this only
  // trips when something's actually wrong.
  const loadTimeout = window.setTimeout(() => {
    frame.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      renderGridEmpty(
        "learning-grid",
        "Couldn't reach the content library",
        "The learning tree lives at all-ai-network.org/tree.html — try the link above.",
      );
    }
  }, 8000);
  frame.addEventListener(
    "load",
    () => window.clearTimeout(loadTimeout),
    { once: true },
  );
}

/** Compact card for a single learning-tree node — visually smaller
 *  than the big workshop/playbook cards so a long row of nodes
 *  reads as a tier. */
/* ──────────────────────────────────────────────────────────────────
   Hero neural-network background

   Generates an SVG mesh of nodes + connecting edges into #hero-network.
   Nodes inherit currentColor (which main.ts sets from --color-primary
   and --color-accent), so the whole pattern recolors live when the
   eboard changes their theme.

   Why procedural instead of hardcoded markup: we want different
   layouts on different reloads so no two sessions look identical,
   and fixed coordinates in HTML would bake a specific pattern into
   every chapter's site. Seeded so the generation is stable for the
   duration of a page load (looks the same after re-renders).
   ────────────────────────────────────────────────────────────────── */

interface NetworkNode {
  x: number;
  y: number;
  r: number;
  /** "primary" or "accent" — which theme color this node uses. */
  tone: "primary" | "accent";
}

function renderHeroNetwork() {
  const svg = document.getElementById("hero-network");
  if (!svg) return;

  const VB_W = 1200;
  const VB_H = 500;

  /* The mesh is generated rather than authored so no two sessions look
     identical and no chapter's site ships a pattern baked into the
     markup — but ?still=1 has to be reproducible, and a capture that
     differs between two loads of the same URL is not a capture anyone
     can compare against. In capture mode the source is a fixed seed
     instead of Math.random, which makes the mesh a deterministic
     function of nothing at all. mulberry32: 4 lines, no dependency. */
  let seed = 0x5eed_1a11;
  const rand = captureStill
    ? () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
    : Math.random;

  // A rough hex-ish grid of node slots. We jitter each slot a bit
  // and then drop ~25% randomly so the mesh doesn't look machine-
  // regular. The center column is thinned further to keep the hero
  // text (H1 + subtitle) readable.
  const COLS = 8;
  const ROWS = 4;
  const cellW = VB_W / (COLS - 1);
  const cellH = VB_H / (ROWS - 1);

  const nodes: NetworkNode[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const jitterX = (rand() - 0.5) * cellW * 0.4;
      const jitterY = (rand() - 0.5) * cellH * 0.35;
      const x = c * cellW + jitterX;
      const y = r * cellH + jitterY;

      // Thin out the center zone where the hero title lives so the
      // mesh frames the text rather than running through it.
      const cx = VB_W / 2;
      const cy = VB_H / 2;
      const dx = (x - cx) / (VB_W / 2);
      const dy = (y - cy) / (VB_H / 2);
      const centerDist = Math.sqrt(dx * dx + dy * dy); // 0 at center, ~1 at edges

      // Probability of keeping the node increases toward the edges.
      const keepChance = 0.4 + centerDist * 0.6;
      if (rand() > keepChance) continue;

      nodes.push({
        x,
        y,
        r: 2.5 + rand() * 2.5,
        tone: rand() < 0.55 ? "primary" : "accent",
      });
    }
  }

  // Edges: connect each node to its closest 2 neighbors, capped at
  // ~1.5 cells away. Dedupe so (a→b) and (b→a) aren't both drawn.
  const maxEdgeDist = Math.sqrt(cellW * cellW + cellH * cellH) * 1.5;
  const edgeSet = new Set<string>();
  const edges: Array<{ a: NetworkNode; b: NetworkNode }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const distances = nodes
      .map((n, j) => ({
        j,
        d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y),
      }))
      .filter((x) => x.j !== i && x.d <= maxEdgeDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of distances) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ a: nodes[i], b: nodes[j] });
    }
  }

  // Build the SVG markup. The `svg` element is the existing one in
  // index.html — we only replace its inner content.
  const edgesSvg = edges
    .map(
      (e) => `
      <line
        x1="${e.a.x.toFixed(1)}" y1="${e.a.y.toFixed(1)}"
        x2="${e.b.x.toFixed(1)}" y2="${e.b.y.toFixed(1)}"
        class="hero-net-line"
      />`,
    )
    .join("");

  const nodesSvg = nodes
    .map(
      (n) => `
      <circle
        cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}"
        class="hero-net-node hero-net-node--${n.tone}"
      />`,
    )
    .join("");

  svg.innerHTML = `
    <g class="hero-net-edges">${edgesSvg}</g>
    <g class="hero-net-nodes">${nodesSvg}</g>
  `;
}

/* Workshops + playbooks sections used to live on the hub template
 * and mirror content from the aain-content CDN. They've been
 * removed now — the Learn page iframes the content repo's full
 * tree visualization instead of splitting curriculum across three
 * separate in-page grids. Chapters who want their members to see
 * workshop / playbook content link out to all-ai-network.org from
 * wherever makes sense. */

/* ──────────────────────────────────────────────────────────────────
   Page navigation (tabs + hash routing + visibility)
   ────────────────────────────────────────────────────────────────── */

/** A page is "empty" if every section it contains is either missing
 *  from the DOM (toggled off by the dashboard) or has zero data. */
function pagesWithContent(sectionsEnabled: Record<string, boolean>): Page[] {
  return PAGES.filter((p) => {
    return p.sections.some((sectionKey) => {
      // Section was toggled off entirely by the dashboard — gone from DOM.
      if (sectionsEnabled[sectionKey] === false) return false;
      // Scoped to this page, not site-wide. Home carries a window onto
      // several destinations, so a home band with data-section="projects"
      // would otherwise keep the Projects TAB alive for a chapter that
      // has no projects view — the exact broken render the tab-dropping
      // exists to prevent.
      const el = document.querySelector(
        `[data-page="${p.key}"][data-section="${sectionKey}"]`,
      );
      return el !== null;
    });
  });
}

function renderPageNav(pages: Page[], activeKey: string) {
  const container = document.getElementById("nav-links");
  if (!container) return;
  container.innerHTML = pages
    .map(
      (p) => `
      <a
        href="#${p.key}"
        class="nav__link nav__tab${p.key === activeKey ? " nav__tab--active" : ""}"
        data-page-tab="${p.key}"
        role="tab"
        aria-selected="${p.key === activeKey ? "true" : "false"}"
      >${escapeHtml(p.label)}</a>
    `,
    )
    .join("");
}

/** Short copy shown in the compact page-header band at the top of
 *  non-home pages. Gives each page a sense of "arrival" without
 *  repeating the full hero. */
const PAGE_HEADER_COPY: Record<
  string,
  { kicker: string; title: string; desc: string }
> = {
  events: {
    kicker: "Calendar",
    title: "Events",
    desc: "Every event this chapter has run, newest first. Open any one for the schedule and how to take part.",
  },
  projects: {
    kicker: "Our work",
    title: "Projects",
    desc: "What members have built, and who built it.",
  },
  learn: {
    kicker: "Curriculum",
    title: "Learn",
    desc: "The applied-AI path every chapter in the network teaches.",
  },
  officers: {
    kicker: "Leadership",
    title: "Officers",
    // {acronym} is filled in by showPage from the live config — an
    // acronym is the one thing in this map the chapter owns.
    desc: "Who runs {acronym}, and how to reach us.",
  },
  members: {
    kicker: "Points & recognition",
    title: "Members",
    desc: "Points come from event check-ins, projects, and recognitions.",
  },
};

/** The chapter's acronym, for the one header line that names it.
 *  Resolved once in init(); "us" is the wording that stays true when a
 *  fork has no acronym at all. */
let chapterAcronym = "us";

/** The context every view is handed. Set in init() once the bundle has
 *  resolved; null when there is no bundle at all (the demo site and a
 *  preview of a slug the dashboard doesn't know), in which case there is
 *  no chapter data for a view to render and mounting is skipped. */
let viewCtx: ViewCtx | null = null;

/** Page keys whose view has already run. A view is mounted at most
 *  once — it fills markup that then stays filled. */
const mounted = new Set<string>();

function showPage(pageKey: string, pages: Page[]) {
  const page = pages.find((p) => p.key === pageKey) ?? pages[0];
  if (!page) return;

  // Mount-on-enter. Home renders at init() because it is where a
  // visitor lands; every other view waits for its tab, so a phone does
  // not build the 59-row archive, the projects grid and the badge wall
  // before first paint. activateLearningTree() already worked this way;
  // this generalises it. Safe to defer because pagesWithContent() reads
  // the DOM's data-section markup, not whether a renderer has run.
  if (viewCtx && !mounted.has(page.key)) {
    mounted.add(page.key);
    MOUNT[page.key]?.(viewCtx);
  }

  // Learning tree's iframe is loading="lazy" and sits behind this
  // tab, so only start loading it (and its 8s fallback timer) once
  // the tab is actually shown.
  if (page.key === "learn") activateLearningTree();

  // Flip nav tab active state.
  document.querySelectorAll("[data-page-tab]").forEach((el) => {
    const match = el.getAttribute("data-page-tab") === page.key;
    el.classList.toggle("nav__tab--active", match);
    el.setAttribute("aria-selected", String(match));
  });

  // Show/hide sections by data-page attribute. We query [data-page]
  // (not [data-section]) so decoration blocks like the "what we do"
  // pillars and per-page CTA bands — which carry data-page but
  // intentionally NOT data-section, so they sit outside the eboard's
  // section-toggle and empty-data-warning systems — still flip
  // visibility on page change. Anything without data-page defaults
  // to "home" so nothing is orphaned.
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
    const assigned = el.getAttribute("data-page") ?? "home";
    el.style.display = assigned === page.key ? "" : "none";
  });

  // Page-header band: populate + show on non-home pages (home has
  // the full hero already). On mobile, visitors get a compact
  // title bar that tells them where they are.
  const header = document.getElementById("page-header");
  if (header) {
    if (page.key === "home") {
      header.hidden = true;
    } else {
      const copy = PAGE_HEADER_COPY[page.key] ?? {
        kicker: "",
        title: page.label,
        desc: "",
      };
      setText("page-header-kicker", copy.kicker);
      setText("page-header-title", copy.title);
      setText("page-header-desc", copy.desc.replace("{acronym}", chapterAcronym));
      header.hidden = false;
    }
  }

  // Don't scroll on initial load (hashchange on boot), and don't scroll
  // when only the sub-route moved: choosing a filter chip sets
  // #events/hackathon, which is the same page and must not jump the
  // visitor back to the top of a list they were reading.
  const changed = document.body.dataset.pageShown !== page.key;
  document.body.dataset.pageShown = page.key;
  if (document.body.dataset.pageInited === "1" && changed) {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
}

/**
 * The page a hash names, ignoring anything after the first slash.
 *
 * `#events/hackathon`, `#projects/2024-2025` and `#learn/python` are
 * sub-routes — a filtered archive and a curriculum topic, both of which
 * have to survive a reload and be shareable. Matching the whole hash
 * against the page keys sent all three to Home.
 *
 * An unknown key still falls through to the first page, so `#sponsor`
 * keeps landing on Home with the modal open.
 */
function getValidPageFromHash(pages: Page[]): string {
  const key = window.location.hash.replace(/^#/, "").trim().split("/")[0];
  if (pages.some((p) => p.key === key)) return key;
  return pages[0]?.key ?? "home";
}

function wirePageRouting(pages: Page[]) {
  renderPageNav(pages, getValidPageFromHash(pages));
  showPage(getValidPageFromHash(pages), pages);
  document.body.dataset.pageInited = "1";

  window.addEventListener("hashchange", () => {
    showPage(getValidPageFromHash(pages), pages);
  });
}

/* ──────────────────────────────────────────────────────────────────
   Click-to-edit overlays (preview mode only)
   ────────────────────────────────────────────────────────────────── */

function enableEditOverlays() {
  document.body.classList.add("preview-edit-mode");
  // One pill per section KEY, not per element. The landing page now
  // carries a window onto several destinations, so `events`,
  // `projects`, `officers`, `leaderboard` and `learning_tree` each match
  // two elements — and an officer looking at Customize would see the
  // same "Events page" pill twice with no way to tell them apart. First
  // in document order wins, which is the Home band: the page an officer
  // is looking at while they edit.
  const claimed = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => {
    const key = section.getAttribute("data-section");
    if (!key) return;
    const info = SECTION_EDIT_INFO[key];
    if (!info) return;
    if (claimed.has(key)) return;
    claimed.add(key);

    // Position the pill relative to the section.
    if (getComputedStyle(section).position === "static") {
      section.style.position = "relative";
    }

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "edit-pill";
    pill.innerHTML = `
      <svg class="edit-pill__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span>${escapeHtml(info.label)}</span>
    `;
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // postMessage the parent (dashboard). The dashboard's Customize
      // panel listens for this and navigates the main window. Using
      // postMessage (not direct navigation) means this still works
      // when the iframe is cross-origin, which it is in production.
      window.parent?.postMessage(
        { type: "aain-edit-section", section: key, target: info.path, kind: info.kind },
        "*",
      );
    });
    section.appendChild(pill);
  });
}

/* ──────────────────────────────────────────────────────────────────
   Nav toggle (mobile)
   ────────────────────────────────────────────────────────────────── */

function wireNavToggle() {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("nav__links--open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Close when clicking a link
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("nav__links--open");
      toggle.setAttribute("aria-expanded", "false");
    }),
  );
}

/* ──────────────────────────────────────────────────────────────────
   Motion

   Five behaviours, and all five settle. Nothing loops, nothing counts,
   nothing lifts, nothing drifts. Two of them live here:

     2  Band reveal — each .band-head and its first row/card rises once
        as you reach it. One reveal per band, never per card: staggering
        41 project cards is a loading screen, not choreography.
     3  The term rule — the 2px line under the term line, drawn once.

   The rest are CSS: boot assembly (body.is-ready), the Events year
   spine (views/events.ts owns its observer) and the filter step.

   Every path here checks the settled case FIRST. Under ?still=1, under
   reduced motion, and in a browser without IntersectionObserver, the
   end state is applied immediately and no observer is created — so a
   .rv element can never be left invisible by an observer that never
   fired, which is the one way this pattern breaks a page.
   ────────────────────────────────────────────────────────────────── */

/** True when this load should show every arrival already arrived. */
function motionSettled(): boolean {
  return (
    captureStill ||
    typeof IntersectionObserver === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

let revealObserver: IntersectionObserver | null = null;

/** Observe every .rv / .rv-group that is in the DOM now. Safe to call
 *  again for content that arrived later — an element already marked
 *  `in` is skipped, and the observer unobserves on first hit. */
function initReveal(root: ParentNode = document) {
  const targets = [...root.querySelectorAll<HTMLElement>(".rv, .rv-group")].filter(
    (el) => !el.classList.contains("in"),
  );
  if (!targets.length) return;

  if (motionSettled()) {
    targets.forEach((el) => el.classList.add("in"));
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("in");
          revealObserver?.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
  }
  targets.forEach((el) => revealObserver!.observe(el));
}

/** Motion 3. The rule under the term line draws once, 240 ms after the
 *  page has settled. Under ?still=1 and reduced motion the stylesheet
 *  has already drawn it, so nothing is scheduled at all. */
function drawTermRule() {
  const line = document.getElementById("term-line");
  if (!line || !line.textContent?.trim()) return;
  if (motionSettled()) return;
  window.setTimeout(() => line.classList.add("is-in"), 240);
}

/* ──────────────────────────────────────────────────────────────────
   Footer — the network's own two integers

   #footer-network-stats has been documented as "populated at runtime
   from the network-stats endpoint" since the template shipped, and
   nothing ever fetched it. Wired here, on idle, because it is the least
   important number on the page: the static sentence already in the
   markup is correct, so a failed fetch changes nothing.
   ────────────────────────────────────────────────────────────────── */

function renderFooterNetworkStats() {
  const el = document.getElementById("footer-network-stats");
  if (!el) return;

  const run = async () => {
    try {
      const res = await fetch(`${DASHBOARD_ORIGIN}/api/public/network-stats`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      // The two integers are nested under `stats`; the same response
      // also carries the full chapter directory, which is none of this
      // sentence's business.
      const data = (await res.json()) as {
        stats?: { chapters_active?: number; members_total?: number };
      };
      const chapters = Number(data.stats?.chapters_active);
      const members = Number(data.stats?.members_total);
      // Both integers or neither: "12 chapters · 0 members" is worse
      // than the sentence that shipped.
      if (!(chapters >= 1) || !(members >= 1)) return;
      el.innerHTML = `${escapeHtml(plural(chapters, "chapter"))} &middot; ${escapeHtml(
        plural(members, "member"),
      )} across the network
        <a href="https://all-ai-network.org/impact.html" target="_blank" rel="noopener">See the network &rarr;</a>`;
    } catch {
      // The static line stays. Nothing to say and nobody to say it to.
    }
  };

  // Idle when the browser offers it, a late timeout when it does not.
  // Read off a local so the `in` check does not narrow `window` itself
  // out from under the fallback.
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (typeof idle === "function") idle.call(globalThis, run);
  else window.setTimeout(run, 1200);
}

/* ──────────────────────────────────────────────────────────────────
   Init
   ────────────────────────────────────────────────────────────────── */

/**
 * Chapter banners are not 16:9. The covers officers upload are wide
 * strips — the MSOE hackathon banner is 1128x191 (5.9:1) — and cropping
 * one to the card's 16:9 frame throws away two thirds of its width,
 * which on these banners is where the words are. So a cover wider than
 * 2.2:1 keeps its own shape, clamped at 5:1 so a freak panorama cannot
 * turn the card into a hairline. Narrower covers keep the 16:9 frame the
 * dashboard preview shows.
 *
 * Global because the markup is built as a string in lib/events.ts and
 * the handler has to exist before those images decode.
 */
function fitCover(img: HTMLImageElement): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const ratio = w / h;
  if (ratio <= 2.2) return;
  const box = img.parentElement;
  if (box) box.style.aspectRatio = `${Math.min(ratio, 5)}`;
}
(window as unknown as { fitCover: typeof fitCover }).fitCover = fitCover;

async function init() {
  wireNavToggle();

  // Started here, beside the bundle fetch and never awaited before it.
  // The "Start here" band it feeds is the only content on 8 of the 12
  // chapters, and ~16 KB gzipped for both calls is less than one cover
  // image. A lazy fetch would mean those eight sites render empty until
  // somebody clicks a tab.
  const curriculum = startCurriculumFetch();

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  // Preview overrides exist for the dashboard's Customize iframe. Honouring
  // them at top level let anyone paint another chapter's identity onto this
  // hostname and divert its sponsor leads (security audit 2026-08-18,
  // finding 6), so require that we are genuinely embedded by the dashboard.
  const isPreview = isDashboardPreview(params);
  const editMode = isPreview && params?.get("edit") === "1";

  // Resolve which slug to fetch: preview mode passes slug explicitly
  // from the dashboard; normal mode reads it from the bundled config
  // (set by the chapter's hub.config.json).
  // Hosted: the hostname. Forked/self-hosted: the baked hub_id. Preview:
  // whatever the dashboard asked for, and only there.
  const configuredSlug = canonicalSlug();
  const slug = (isPreview ? params?.get("slug") : null) ?? configuredSlug;

  // Always try to fetch the bundle — in preview we want live data on
  // top of in-progress URL overrides; in normal mode it's the whole
  // source of truth.
  const bundle = slug ? await fetchBundle(slug) : null;

  // No bundle means no chapter data at all. Rather than dressing the
  // template's sample club up as this chapter, say so. Preview is exempt:
  // the dashboard's Customize iframe is a controlled context where a
  // transient miss shouldn't replace the theme the eboard is editing, and
  // the dashboard raises its own banner for a genuinely broken site.
  // The canonical template repo's own Pages deploy is the public demo
  // linked from all-ai-network.org ("See the deployed template before you
  // fork"). It has no chapter behind it and never will, so it renders the
  // sample club that ships in hub.config.json — which is the whole point of
  // a demo. The flag is set by this repo's own Actions workflow and only
  // when the build is running in THIS repository, so a fork can never
  // inherit it: an unconfigured fork still gets the holding page rather
  // than quietly serving someone else's sample club as its own.
  const isDemoSite = import.meta.env.VITE_DEMO_SITE === "1";

  if (!isPreview && !bundle && !isDemoSite) {
    // A hostname label that is not a chapter may be a member portfolio
    // (both live at {label}.all-ai-network.org; the middleware serves
    // portfolio.html when it can, but it fails open to index.html during
    // a dashboard blip). Bounce to the portfolio page rather than show a
    // shared link a holding page — it renders without baked og tags,
    // which beats "under construction".
    if (hostnameSlug(HUB_DOMAIN) && (await isPublishedMember(slug))) {
      location.replace("./portfolio.html" + location.search);
      return;
    }
    applyTheme({
      primary: config.theme.primary_color,
      accent: config.theme.accent_color,
    });
    renderUnderConstruction({
      hubName: config.hub_name ?? "",
      slug,
      reason: slug
        ? `the dashboard has no chapter with the id "${slug}"`
        : hostnameSlug(HUB_DOMAIN)
          ? "this address doesn't match a chapter"
          : "no hub_id is set in hub.config.json",
    });
    return;
  }

  const remote = bundle?.config ?? null;
  const savedSections: Record<string, boolean> = remote?.sections ?? {};

  // Theme: URL overrides beat saved config beat bundled defaults.
  const primary =
    (isPreview ? params?.get("primary") : null) ??
    remote?.theme.primary ??
    config.theme.primary_color;
  const accent =
    (isPreview ? params?.get("accent") : null) ??
    remote?.theme.accent ??
    config.theme.accent_color;
  applyTheme({ primary, accent });

  // Logo: in preview, a URL `logo=` param wins (including empty-string
  // = explicitly clear). Otherwise saved config wins. Resolved once so the
  // nav, footer, tab icon and hero can never disagree about which logo it is.
  let logoUrl: string | null;
  if (isPreview && params && params.get("logo") !== null) {
    const logoParam = params.get("logo");
    logoUrl = logoParam && logoParam.length > 0 ? logoParam : null;
  } else {
    logoUrl = remote?.logo_url ?? null;
  }
  applyLogo(logoUrl);

  // Section visibility: start from saved + fold in preview `off=` list.
  const sectionsToApply: Record<string, boolean> = { ...savedSections };
  if (isPreview && params?.get("off")) {
    for (const key of params
      .get("off")!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sectionsToApply[key] = false;
    }
  }
  applySectionToggles(sectionsToApply);

  // The flyer takeover owns the whole document when ?event= names a
  // real event. Resolved before anything renders so the landing page's
  // work — four bands, the doors, a curriculum wait — is never done
  // behind an event nobody will see it under.
  const eventId = eventFromSearch(window.location.search);
  const isFlyer = Boolean(eventId) && !isPreview;

  // Identity and chrome: every load gets these, flyer included. The
  // takeover reads .nav__brand and #page-header, and its title bar says
  // the chapter's name.
  chapterAcronym = (remote?.hub_acronym ?? config.hub_acronym ?? "").trim() || "us";
  renderIdentity(remote, bundle?.chapter ?? null);
  renderSocials(remote?.social_links ?? {});
  renderHeroNetwork();
  // The chapter's own mark: its uploaded logo if it has one, else the
  // generated brain in its colours. Acronym (used by the brain) falls back
  // through the live config, then the baked one, then "ALL".
  renderHeroMark(
    document.getElementById("hero-mark"),
    logoUrl,
    remote?.hub_acronym ?? config.hub_acronym ?? null,
  );
  // Sponsor inquiry modal — mounted once; triggered via the
  // `#sponsor` hash route which the hero's partner CTA points to.
  // Always the configured chapter, never the preview slug: a diverted
  // sponsor lead is the part of finding 6 that costs real money.
  setupSponsorModal(
    configuredSlug || null,
    bundle?.chapter?.name ?? remote?.hub_name ?? config.hub_name,
    remote,
  );
  wireSponsorHashRoute();

  // Drop every destination whose data is empty, BEFORE the nav is built
  // from the DOM. A tab that opens on nothing is the render this whole
  // pass exists to prevent.
  pruneEmptySections(bundle);

  if (isFlyer) {
    // No landing page, no views, and no learning tree: the takeover
    // hides [data-page] and injects its own main. loadLearningTree()
    // used to fire here and point an iframe at the content site behind
    // an event the visitor is reading.
    const pages = pagesWithContent(sectionsToApply);
    renderPageNav(pages, "");
    mountEventPage({
      eventId: eventId!,
      chapterSlug: bundle?.chapter.slug ?? slug,
      chapterName: bundle?.chapter.name ?? remote?.hub_name ?? config.hub_name,
      // events=all is what makes this resolve for a past event. Before
      // it, every shared archive link opened as "Event — MSOE AI Club".
      title: bundle?.events.find((event) => event.id === eventId)?.title,
    });
    return;
  }

  // Learning tree iframes the content repo's tree page — fire-and-
  // forget since the iframe handles its own load / timeout states. Only
  // the fallback link is wired here; the iframe's src and its 8-second
  // timer wait for the Learn tab (activateLearningTree).
  loadLearningTree();

  // The nav is built from the DOM after the prune, so it lists exactly
  // the rooms that have something in them: MSOE 6 tabs, ROAR 4, NTUA 2.
  //
  // This is computed BEFORE the hero and the CTA bands render, because
  // both of them link to destinations. A button pointing at a tab that
  // does not exist is the bug class the hero's own default CTA was
  // rewritten to kill; the partner band was still shipping one.
  const pages = pagesWithContent(sectionsToApply);
  const livePages = new Set(pages.map((p) => p.key));

  renderHeroActions(remote, bundle?.events ?? [], livePages);
  const heroPrinted = renderStats(bundle?.chapter ?? null, bundle?.projects ?? []);
  renderTermLine(bundle?.events ?? []);
  renderPageCtaBands(livePages);

  if (bundle) {
    // The curriculum call went out beside the bundle and has had the
    // bundle's whole round trip to land, so this is normally already
    // resolved. Raced anyway: the Learn door must not be the reason a
    // chapter's front page waits on a third-party endpoint.
    const floor = await Promise.race([
      curriculum,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
    const lessons = {
      count: floor?.path.length ?? 0,
      first: floor?.path[0]?.title ?? "",
    };

    // Every integer on the landing page is printed exactly once. Three
    // components can claim the same one — the hero strip, the door, the
    // band head — and on MSOE all three did: "59 Events" in the
    // masthead, "59 events since 2023" on the door 130px below it, and
    // "All 59 events →" a band further down, every pair inside one
    // 900px screen. The strip wins because it is the club's own claim
    // about its scale; the door keeps its live line and the band head
    // reads "All events →". On a chapter with no strip (ROAR, NTUA)
    // nothing is suppressed and the doors carry the counts.
    const printed = new Set([
      ...renderDoors(bundle, pages, lessons, heroPrinted),
      ...heroPrinted,
    ]);
    renderEventsBand(bundle, printed);
    renderPeopleBand(bundle);
    renderProjectsBand(bundle, printed);

    // Views mount on tab entry and read this.
    viewCtx = viewContext(bundle, slug, window.location.pathname);
  } else {
    // No bundle: the demo site and a preview of a slug the dashboard
    // does not know. There is no chapter data for a band to sample, and
    // a synthesised empty one would be the template pretending to be a
    // chapter — which renderUnderConstruction exists to refuse.
    document.getElementById("doors-band")?.remove();
    ["band-events", "band-people", "band-projects"].forEach((id) =>
      document.getElementById(id)?.remove(),
    );
  }

  wirePageRouting(pages);

  // The floor band, last and async. It is the one band that renders
  // identically on a three-year-old chapter and a two-week-old one, so
  // it is also the only one that can fail to arrive — and when it does,
  // the band goes with it rather than leaving a head over nothing.
  void renderStartHereBand(document.getElementById("band-learn-inner"), {
    isFloor:
      (bundle?.events ?? []).length === 0 &&
      (bundle?.config?.officers ?? []).length === 0,
  }).then((ok) => {
    if (!ok) {
      hideSection("learning_tree", "home");
      return;
    }
    // Reveal the head that just arrived; the rows under it never
    // animate, per the one-reveal-per-band rule.
    document
      .getElementById("band-learn-inner")
      ?.querySelector(".band-head")
      ?.classList.add("rv");
    initReveal(document.getElementById("band-learn") ?? document);
  });

  initReveal();
  drawTermRule();
  renderFooterNetworkStats();

  // Preview + edit mode → attach clickable "Edit here" pills to every
  // section that maps to a dashboard route. Dashboard parent listens
  // for postMessage and navigates.
  if (editMode) enableEditOverlays();
}

/* The `finally` is load-bearing. `.is-booting` blanks the hero so the
   template's placeholder name never flashes as this chapter's; if
   init() throws anywhere above — a malformed bundle, a DOM the fork
   changed — an unguarded blank hero is a permanently empty page, which
   is strictly worse than the flash it was added to fix.

   `body.is-ready` is the same class the boot assembly animates from, so
   this line both un-blanks the hero and starts motion 1. */
init()
  .catch((err) => console.error("[ALL hub] render failed", err))
  .finally(() => {
    document.body.classList.remove("is-booting");
    document.body.classList.add("is-ready");
  });
