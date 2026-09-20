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
import { initChapterMark } from "./chapter-mark";
import { applyCaptureMode, isCaptureStill } from "./lib/capture";
import { escapeHtml, escapeAttr } from "./lib/html";
import { hostnameSlug, isDashboardPreview } from "./lib/slug";
import { eventFromSearch, eventPageHref, mountEventPage } from "./event-page";
import {
  initJoinPanel,
  joinChannels,
  offerIsReal,
  renderChannelButtons,
} from "./join-panel";
import type {
  ChapterBundle,
  EventRow,
  FeatureBlockRow,
  HubConfig,
  LocalContentEntry,
  Officer,
  ProjectRow,
  RemoteConfig,
} from "./lib/bundle";
import { formatCount, monthDay, officerInitials, plural } from "./lib/format";
import { DASHBOARD_ORIGIN, mailtoHref, safeHttpUrl } from "./lib/net";
import { renderGridEmpty } from "./lib/primitives";
import { renderInlineMarkdown, renderRichMarkdown } from "./lib/markdown";
import {
  communityHref,
  linksFromSocial,
  platformIcon,
  platformMeta,
  type CommunityLink,
} from "./lib/platforms";
import { latestPastEvent, nextEvent } from "./lib/events";
import { termLineParts } from "./lib/season";
import { MOUNT, viewContext, type ViewCtx } from "./lib/view";
/* Side-effect imports: each view module registers itself into MOUNT at
   load, so showPage() can find it by page key. views/members.ts is not
   here — it stopped registering a view in this pass and is imported
   for its named exports below, because the board is Home's, not a
   destination's. */
import "./views/about";
/* About's header line claims a contact only when a card will carry
   one, so the claim is checked with the view's own rule. */
import { officerIsReachable } from "./views/about";
import "./views/events";
import "./views/projects";
import "./views/learn";
import "./views/sponsor";
/* Explore's Projects block names the newest project and its builders.
   Both come from the Projects room's own helpers — the year sort it
   uses to decide which group is newest, and the byline renderer that
   knows what to do with an advisor and with a fourth name — so the
   block and the room can never disagree about whose work it is. */
import {
  deriveYearFilters,
  renderByline,
  type ProjectWithMembers,
} from "./views/projects";
/* The board is Home's: views/members.ts registers no view, and these
   two functions are all Home needs from it. The badge wall went to
   About and the merch shelf to an Explore block, so neither is
   imported here any more. */
import { renderBoard, scoredRows } from "./views/members";
/* The curriculum floor feeds the "learning tree" Explore block. The
   fetch still starts at boot beside the bundle — that block is the one
   thing on the page that renders identically on a three-year-old
   chapter and a two-week-old one, and a lazy fetch would leave the
   eight empty chapters with three blocks. */
import { startCurriculumFetch, type CurriculumFloor } from "./views/learn";
/* The sponsor page is told which chapter it acts for, rather than
   reading it from the view context: ViewCtx.slug honours the preview
   ?slug= param and a partner's message must always reach the chapter
   whose hostname this is. */
import { setSponsorChapter } from "./views/sponsor";

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
   toggle off, or that vanish when their data array is empty. The
   per-page CTA bands are not here: they carry data-page but
   deliberately no data-section, so they sit outside the toggle system
   and cannot keep an otherwise-empty page alive.

   Home's list is three keys now. `leaderboard` is the people band and
   `about` is its left column — the landing page's two halves, each
   toggleable from Customize on its own. The bands that used to share
   `projects`, `badges`, `merch` and `learning_tree` with a destination
   are gone: Explore reads those records rather than sampling their
   sections, so no home band can keep a destination's tab alive any
   more. (pagesWithContent() and hideSection() stay page-scoped
   regardless — `about` is on both Home and the About page.)

   `hero` is in Home's list and is always in the DOM, so Home is the
   one page that can never lose its tab. That is deliberate: a site
   with no Home is not a site. */
const PAGES: Page[] = [
  { key: "home", label: "Home", sections: ["hero", "leaderboard", "about"] },
  // Promoted from a home section to a destination: MSOE has run 59
  // events over three years and this site rendered one of them. Home
  // no longer samples it at all — the hero's next-event CTA and the
  // Events door say what is next, and the board gets the room a feed
  // of three rows used to take.
  { key: "events", label: "Events", sections: ["events"] },
  { key: "projects", label: "Projects", sections: ["projects"] },
  // The tree, and nothing else. Workshops and playbooks live on the
  // content CDN and are not mirrored here.
  { key: "learn", label: "Learn", sections: ["learning_tree"] },
  // What the club is and who runs it, in one room. Officers used to be
  // their own tab beside the board, which read as though the eboard
  // were the top of it; they are people, and this is where a visitor
  // looks for people.
  { key: "about", label: "About", sections: ["about", "officers"] },
  // The hand-off. The chapter's own pitch, the button through to the
  // involvement platform that owns tiers and prices, and the chapter's
  // own inbox. Its one section is dropped when no slug resolves, which
  // takes the tab with it.
  { key: "sponsor", label: "Sponsor", sections: ["sponsor"] },
];

/** Dashboard route each section can be edited from — used by the
 *  preview-mode click-to-edit overlay. Empty = non-editable. */
const SECTION_EDIT_INFO: Record<
  string,
  { path: string; label: string; kind: "internal" | "external" }
> = {
  hero: { path: "/website", label: "Customize → Identity", kind: "internal" },
  // The per-page CTA bands intentionally aren't here — they're
  // decorations without data-section, so the click-to-edit overlay
  // never finds them and there's nothing for the eboard to tweak
  // per-section in the dashboard.
  about: { path: "/website", label: "Customize → About", kind: "internal" },
  // Both new to this pass, and both point at Customize rather than at
  // a record page: an Explore block and a community link are written
  // on the website form, not derived from events or members.
  explore: { path: "/website", label: "Customize → Explore", kind: "internal" },
  community: { path: "/website", label: "Customize → Community", kind: "internal" },
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

/** A logo that can hold the hero's left half.
 *
 *  The slot is 300px square now, and at that size the shape of the file
 *  is the whole design. MSOE's uploaded logo is a 2732×2048 JPEG of
 *  their mark on an opaque black field: at 116px it read as a small
 *  dark tile and nobody minded, and at 300px it is a 300px black
 *  rectangle on a near-black hero, letterboxed inside a square box.
 *  A logo that is far from square, or too small to be drawn at 300
 *  without softening, is not a logo we can show at this size — and the
 *  brain mark in the chapter's own colours is a better answer than a
 *  bad crop of the chapter's own file. Measured from the decoded image
 *  rather than from the URL, because the bundle says nothing about
 *  either. */
function logoFitsHeroSlot(img: HTMLImageElement): boolean {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return true; // an SVG with no intrinsic size: trust it
  const ratio = w / h;
  return ratio >= 0.8 && ratio <= 1.25 && w >= 160;
}

/** The hero mark: the chapter's uploaded logo when it has one, otherwise
 *  the generated brain in its colours. The brain is the fallback, not a
 *  competitor, so a chapter that took the trouble to upload a logo sees
 *  that logo front and centre. If the image fails to load — or turns
 *  out to be the wrong shape for the slot — we fall back to the brain
 *  rather than leave the hero with a broken image or a black slab. */
/** The mark itself: the living canvas when we can draw it, the SVG when we
 *  cannot. The canvas needs a 2d context and a slot big enough for its own
 *  nodes to be more than a couple of pixels across; below that the SVG,
 *  hinted by the browser rather than rasterised by us, is the better
 *  picture. Colours are read back off the document because applyTheme has
 *  already written the chapter's onto :root — the mark and the rest of the
 *  page therefore cannot disagree about what the theme is. */
let disposeChapterMark: (() => void) | null = null;
function mountHeroMark(el: HTMLElement, acronym: string | null) {
  disposeChapterMark?.();
  disposeChapterMark = null;
  const cs = getComputedStyle(document.documentElement);
  try {
    disposeChapterMark = initChapterMark(el, {
      acronym,
      primary: cs.getPropertyValue("--color-primary"),
      accent: cs.getPropertyValue("--color-accent"),
      still: isCaptureStill(),
    });
  } catch {
    renderBrainMark(el, acronym);
  }
}

/**
 * Is this the dashboard's generated chapter logo rather than one the
 * eboard uploaded? `buildHubConfigPayload` fills `logo_url` with
 * `{dashboard}/api/public/chapter-logo/{slug}` whenever a chapter has no
 * upload, so "no logo" never arrives as null. The hero wants to know the
 * difference; the nav and the favicon do not, and keep using the PNG.
 */
function isGeneratedLogo(url: string): boolean {
  return url.startsWith(`${DASHBOARD_ORIGIN}/api/public/chapter-logo/`);
}

function renderHeroMark(
  el: HTMLElement | null,
  logoUrl: string | null,
  acronym: string | null,
) {
  if (!el) return;
  if (!logoUrl) {
    mountHeroMark(el, acronym);
    return;
  }
  const img = document.createElement("img");
  img.className = "hero__logo";
  // Decorative: #hero-mark is aria-hidden and the h1 already names the club.
  img.alt = "";
  img.decoding = "async";
  img.onerror = () => mountHeroMark(el, acronym);
  img.onload = () => {
    if (!logoFitsHeroSlot(img)) mountHeroMark(el, acronym);
  };
  img.src = logoUrl;
  disposeChapterMark?.();
  disposeChapterMark = null;
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

/**
 * The one sentence that is true of every chapter in the network.
 *
 * It is not a fallback tagline, and the difference matters: the
 * template used to say "A student-run applied AI community." under a
 * real club's name, which is a slogan nobody wrote, for a club it does
 * not describe. This is a fact — who runs it, where, and what it is
 * part of — assembled from the chapter's own two fields. It goes in
 * the hero because all three live test chapters have tagline = null,
 * and a masthead that reads mark | pill | name | buttons never answers
 * the question a visitor arrived with.
 *
 * The clause about the university goes when there is no university,
 * rather than becoming "the student-run applied AI club at ,".
 */
function chapterSentence(hubName: string, university: string): string {
  const where = university.trim() ? ` at ${university.trim()}` : "";
  return `${hubName} is the student-run applied AI club${where}, and a chapter of the ALL Applied AI Network.`;
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
  // The chapter's own words when it wrote any, the true sentence when
  // it did not. Never both, and never nothing: this is the paragraph
  // the reference hero has and this one did not.
  setText("hero-subtitle", tagline || chapterSentence(hubName, university));
  setText("hero-university", university);
  setText("footer-hub-name", hubName);
  setText("footer-university", university);
  setText("footer-about", tagline || chapterSentence(hubName, university));

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
 *   a standing invite      → "Join {acronym}"      → join_url
 *   a future event exists  → "Join our next event" → ?event={id}
 *   any event exists       → "See what we ran"     → #events
 *   neither                → "Start the curriculum" / "Become a partner"
 *
 * The invite leads because it is the one button that does what the
 * page is for: joining there creates the membership and the member is
 * on the board on the next load.
 *
 * ONE secondary, and only when it goes somewhere the primary does not:
 * the next event's flyer, or the eboard 600px below. `#band-people` is
 * scrolled to by hand rather than linked to, so the hash router never
 * fires and the URL stays clean.
 */
function renderHeroActions(
  remote: RemoteConfig | null,
  chapter: ChapterBundle["chapter"] | null,
  events: EventRow[],
  livePages: Set<string>,
  peopleBandShown: boolean,
  /** The chapter's join-kind channels. The masthead's invite opens the
   *  join panel over both these and the roster link, so a chapter that
   *  runs a Discord and no roster still gets an invite button. */
  channels: CommunityLink[],
) {
  const container = document.getElementById("hero-actions");
  if (!container) return;
  container.innerHTML = "";

  type HeroCta = {
    label: string;
    href: string;
    style: "primary" | "ghost" | "ghost-accent";
    /** Opens the join panel instead of following its own href. The href
     *  is still real — a cmd-click on it is a request for the invite in
     *  a second tab, and that request is none of the panel's business. */
    panel?: boolean;
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

  const next = nextEvent(events);
  const joinUrl = safeHttpUrl(chapter?.join_url ?? "");

  if (!buttons.length) {
    /* The invite leads whenever there is one, and "one" now means a
       roster link OR a channel to walk into. It used to mean the roster
       link alone, which is why a chapter that ran a Discord and no
       roster got "See what we ran" on its masthead. The href underneath
       is the roster when there is one and the first channel otherwise;
       the click opens the panel over both. */
    if (joinUrl || channels.length) {
      buttons.push({
        label: `Join ${chapterAcronym}`,
        href: joinUrl ?? channels[0].url,
        style: "primary",
        panel: true,
        authored: false,
      });
    } else if (next) {
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
    } else if (livePages.has("sponsor")) {
      // Nothing to show and nowhere to send them but the inbox. The
      // partner CTA posts to the dashboard rather than a per-officer
      // mailto, so the thread survives eboard turnover. Gated on the
      // page existing, like every other computed default: an unlinked
      // fork has no Sponsor tab and this button would go nowhere.
      buttons.push({ label: "Become a partner", href: "#sponsor", style: "primary", authored: false });
    }

    // The secondary, once, and only where it adds a destination. A
    // chapter whose primary already IS the next event does not get a
    // button to the next event beside it.
    const primary = buttons[0];
    if (primary) {
      if (next && primary.label !== "Join our next event") {
        buttons.push({
          label: `Next event · ${monthDay(next.date, next.timezone)}`,
          href: eventPageHref(next.id, window.location.pathname),
          style: "ghost",
          authored: false,
        });
      } else if (peopleBandShown) {
        buttons.push({
          label: "Meet the eboard",
          href: "#band-people",
          style: "ghost",
          authored: false,
        });
      }
    }

    /* And the other audience. A visitor who came to sponsor this
       chapter had to read three bands of the page to find the door;
       the masthead now holds it open beside the member's one.

       It goes LAST of the three, not second, because the row reads in
       priority order once a phone stacks it and the member's path —
       join, then the next event — is the one this page is for. It is
       gated on the Sponsor page being live, like every other computed
       default: an unlinked fork has no Sponsor tab and this would be a
       button to a room that is not there. And it never doubles the
       primary on a chapter whose only door IS the inbox, which is what
       the href check is for rather than a repeat of the branch above.

       ghost-accent is the variant that exists for exactly this: one
       audience-distinct button that does not compete with the invite. */
    if (
      livePages.has("sponsor") &&
      buttons.length < 3 &&
      !buttons.some((b) => b.href === "#sponsor")
    ) {
      buttons.push({
        label: `Sponsor ${chapterAcronym}`,
        href: "#sponsor",
        style: "ghost-accent",
        authored: false,
      });
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
    // stay in the current window. The standing invite is the one
    // absolute URL that does NOT: joining is the thing the visitor
    // came to do, and handing them a second tab to do it in leaves
    // this page behind them as litter. The panel's own button is the
    // same case for the same reason, whatever href happens to be under
    // it — it does not navigate on an ordinary click at all.
    if (/^https?:\/\//.test(href) && href !== joinUrl && !b.panel) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else if (href === joinUrl || b.panel) {
      a.rel = "noopener";
    }
    // The delegated listener in join-panel.ts picks this up. It is an
    // attribute rather than a handler here because the empty
    // leaderboard's Join button and the band's are rendered elsewhere
    // and have to behave identically.
    if (b.panel) a.dataset.joinPanel = "";
    // #band-people is a place on this page, not a route. Scrolled by
    // hand so the hash router never sees it and the URL a visitor
    // might share stays the page's own.
    if (href === "#band-people") {
      a.addEventListener("click", (e) => {
        // preventDefault FIRST. Bailing before it let the browser
        // navigate to #band-people on a page that no longer has one:
        // getValidPageFromHash falls back to Home and the visitor gets
        // a changed URL and no movement, which reads as a dead button.
        e.preventDefault();
        document
          .getElementById("band-people")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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

/* Home has no band. It ended on a two-button pitch at a sponsor, which
   is the wrong last word on a page a prospective MEMBER is reading —
   the join band is the close now, and the one line a partner needs is
   an aside inside it. The Members band went with the Members page. */
const PAGE_CTA_BANDS: Record<string, PageCtaBandCopy> = {
  projects: {
    kicker: "Build with us",
    title: "Want to ship a project with the chapter?",
    desc: "Members pitch ideas every semester and team up into Innovation Labs cohorts. Show up to a meeting, propose a project, recruit collaborators — eboard helps you scope it end-to-end.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Meet the officers", href: "#about" },
  },
  about: {
    kicker: "Get in touch",
    title: "Running something? Reach out.",
    desc: "Sponsoring events, guest-speaking, recruiting our members, or joining the eboard — we reply fast. The whole eboard is a student team, and we love outside-of-class opportunities to build together.",
    primary: { label: "Become a partner", href: "#sponsor" },
    secondary: { label: "See our projects", href: "#projects" },
  },
  // Learn has no band either: "Learn should just be the learning tree"
  // — a full-bleed canvas with a two-button pitch bolted under it is
  // the page saying one more thing after the thing it is for.
};

/** Every secondary CTA on these bands points at a destination, and on
 *  a chapter with no officers and no About text the About tab does not
 *  exist — NTUA shipped a "Meet the officers" button that jumped
 *  nowhere, and the same is true of a Sponsor button on an unlinked
 *  fork, which is why #sponsor is checked here like any other. A hash
 *  href is only rendered when its destination is one of the live
 *  pages; anything else (mailto, an absolute URL) is left alone. */
function ctaTargetLives(href: string, livePages: Set<string>): boolean {
  if (!href.startsWith("#")) return true;
  const key = href.slice(1).split("/")[0];
  // #sponsor used to be the exception here: it was not a page, it fell
  // through to Home and opened a modal. It is a destination now, so it
  // is checked like every other one — a chapter whose slug does not
  // resolve has no Sponsor tab, and a button to it would be the dead
  // link this function exists to prevent.
  if (key === "") return true;
  return livePages.has(key);
}

function renderPageCtaBands(livePages: Set<string>) {
  for (const [pageKey, copy] of Object.entries(PAGE_CTA_BANDS)) {
    const band = document.querySelector<HTMLElement>(
      `.page-cta-band[data-page="${pageKey}"]`,
    );
    if (!band) continue;

    // A band belonging to a page that does not exist. ML@IIT has no
    // officers and no About text, so its About tab is gone — and the
    // About band was still being filled with copy nobody could ever
    // reach. showPage() hides it, which is not the same as it not
    // being there: it is in the DOM, in the a11y tree, and in the
    // ?still=1 capture.
    if (!livePages.has(pageKey)) {
      band.remove();
      continue;
    }

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
 * A third law arrives with the people band: every integer is printed
 * once per screen, and the board's head now prints the members count
 * 600px below this strip on the same screen. So when the board renders
 * rows, the BOARD owns that integer and the strip gives it up — the
 * head is where it means something, because it is sitting on top of
 * the names it counts. This reverses the old "the strip wins" rule for
 * that one entry, deliberately.
 *
 * MSOE: 59 Events · 41 Projects (the board carries 595 members).
 * ROAR: one entry survives → no strip.
 * NTUA: none survive → no strip.
 */
function renderStats(
  chapter: ChapterBundle["chapter"] | null,
  projects: ProjectRow[],
  boardOwnsMembers: boolean,
): Set<string> {
  const strip = document.getElementById("hero-stats") as HTMLElement | null;
  const shown = new Set<string>();
  if (!strip) return shown;
  strip.innerHTML = "";
  if (!chapter) return shown;

  const entries: { key: string; n: number; one: string; many: string }[] = [
    { key: "members", n: boardOwnsMembers ? 0 : chapter.member_count, one: "Member", many: "Members" },
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
  const about = (bundle?.config?.about ?? "").trim();

  // Events and projects have no empty state anywhere: a chapter with
  // none of either simply has no band and no tab.
  if (!events.length) hideSection("events");
  if (!projects.length) hideSection("projects");

  if (!officers.length) hideSection("officers");
  if (!about) hideSection("about", "about");

  // `leaderboard` is deliberately absent from this list. It is Home's
  // people band, Home keeps its tab on `hero` whatever the board does,
  // and deciding it early would cost the board its one honest empty
  // state ("Points start showing up here once members check in at an
  // event.") — which a destination could not have shown but the front
  // page can. renderPeopleBand() decides, on the render that found
  // nothing.
  //
  // `badges` is absent for a different reason: the wall is on About
  // now, its section ships empty like every other destination block,
  // and views/about.ts removes it when the chapter awards none.
}

/* ──────────────────────────────────────────────────────────────────
   THE LANDING PAGE

   Ben's brief was one sentence: the leaderboard and "About Us" front
   and centre, "because that's what people care about — what the
   organization is and the people who are a part of it". So the page is
   five things and no more:

     the split hero        who this is, in one sentence and one button
     the people band       the eboard and the board, side by side
     Explore               what the club does, with pictures
     Ready to join         the invite, the channels, one cited number
     the footer            every room, and the network's line

   What left, and where it went: the doors strip (the hero strip and
   Explore's live lines carry the same facts once), the points
   explainer (the board's own note and the Network block say it in a
   line each), the badge wall (About, under the roster), the merch
   shelf (Explore's Rewards block), the projects band and the Start
   here band (Explore's Projects and learning-tree blocks), and Home's
   partner band (one aside inside the join band).

   The rule that governs every renderer below: a block with nothing
   true to say is REMOVED, never emptied. Nothing on this page is a
   sample of a room any more, so nothing is truncated towards one.
   ────────────────────────────────────────────────────────────────── */

/**
 * Officer tiles the faces grid shows before the last one becomes the
 * overflow link: three rows of three at 88px.
 *
 * The size is the ruling — a tile has to read as a person at arm's
 * length, which 72px does not — and the count is what the size then
 * costs. At six tiles MSOE's column was two rows and a link beside a
 * 735px board, which is 380px of dead column: the void this band was
 * redesigned to remove, moved to the other side. Nine keeps every
 * face at 88px, ends the two columns within a row of each other, and
 * puts eight of the thirteen people Ben wanted front and centre on
 * the page instead of five.
 */
const FACE_TILES = 9;

/** Names on the Rewards block's line before it becomes a +N. */
const REWARD_NAMES = 3;

/** Explore blocks a chapter may author. Past this it is a page, not a
 *  section of one. */
const MAX_FEATURES = 6;

/** The two photographs every chapter's Explore falls back to. They are
 *  real rooms at real chapters — and NOT at this one, which is what
 *  the caption is for. An uncaptioned photograph on a club's own page
 *  claims to be the club. */
const DEFAULT_PHOTOS = {
  events: {
    src: "/explore/project-kickoff.jpg",
    caption: "A speaker night at a network chapter.",
  },
  projects: {
    src: "/explore/build-night.jpg",
    caption: "Students demoing their project at a network chapter.",
  },
};

/** The network's own page of numbers — where the one percentage on
 *  this page is explained. */
const IMPACT_URL = "https://all-ai-network.org/impact.html";

/* ── The people band ─────────────────────────────────────────────── */

/** What the band needs that is not in the bundle: which chapter to
 *  page the board against, which rooms exist, and the standing invite
 *  (already scheme-checked, so the empty board's button and the hero's
 *  cannot disagree about whether there is one). */
interface PeopleBandCtx {
  slug: string;
  livePages: Set<string>;
  /** Where the empty leaderboard's Join button points: the roster, or
   *  the first channel on a chapter that runs one and no roster. The
   *  same expression the masthead's button uses, so the two cannot
   *  disagree about where Join goes. */
  joinHref: string | null;
  /** Whether a Join button has anywhere to go — the roster, a channel,
   *  or both. Decided once in boot() so the empty leaderboard's button
   *  and the masthead's cannot disagree about whether there is one. */
  joinable: boolean;
}

/** One officer tile: a face or a monogram, a name, and a role when
 *  they have one. ROAR's single officer has role: "" — a grey line
 *  with nothing in it under a name reads as a rendering bug. */
function renderFace(o: Officer, href: string): string {
  const name = escapeHtml(o.name);
  const photo = o.image_url ? safeHttpUrl(o.image_url) : null;
  // Eager under ?still=1: a capture stitches the page from the top and
  // a lazy portrait two screens down is a grey circle in the
  // screenshot, which is exactly the render being compared.
  // A portrait that 404s leaves a fixed-size empty circle in a grid of
  // faces, which reads as the page failing rather than as an officer
  // who has not uploaded one — so it falls back to the same monogram
  // an officer with no portrait at all gets. Same guard the group
  // photo and the hero mark already have.
  const initials = officerInitials(o.name);
  const avatar = photo
    ? `<img src="${escapeAttr(photo)}" alt="" loading="${isCaptureStill() ? "eager" : "lazy"}" decoding="async" data-initials="${escapeAttr(initials)}" onerror="this.parentElement.setAttribute('aria-hidden','true');this.parentElement.textContent=this.dataset.initials" />`
    : escapeHtml(initials);
  const role = (o.role ?? "").trim();
  return `
    <a class="face" href="${escapeAttr(href)}" role="listitem">
      <span class="face__avatar" aria-hidden="${photo ? "false" : "true"}">${avatar}</span>
      <span class="face__name">${name}</span>
      ${role ? `<span class="face__role">${escapeHtml(role)}</span>` : ""}
    </a>`;
}

/**
 * The picture at the top of the left column: the chapter's group photo
 * if it uploaded one, otherwise its officers as faces.
 *
 * The faces grid is 3×2 at 88px rather than the 4×2 at 72px it started
 * as. A tile has to read as a person at arm's length or the column is
 * a contact sheet — and MSOE's roster is 13 people of whom three have
 * no portrait, so at 72px those three are monogram chips in a grid of
 * faces. Role order is the API's (President first, by role_order) and
 * is never re-sorted to put the photographed officers first: that
 * would be the site editing the eboard.
 *
 * Nothing at all when there is neither a photo nor an officer. There
 * is no placeholder portrait and there never will be.
 */
function renderPeoplePicture(cfg: RemoteConfig, href: string): string {
  const photo = cfg.group_photo_url ? safeHttpUrl(cfg.group_photo_url) : null;
  if (photo) {
    // A group photo that 404s leaves a 4:3 empty frame at the top of
    // the column, which reads as the page failing rather than as a
    // chapter that has not uploaded one. The handler is wired in
    // renderPeopleBand rather than inline, because when the photo was
    // the ONLY thing in this column its death has to take the column —
    // and possibly the band — with it. See wirePeoplePhoto.
    return `<figure class="people__photo"><img src="${escapeAttr(photo)}" alt="" loading="eager" decoding="async" data-people-photo /></figure>`;
  }

  const officers = cfg.officers ?? [];
  if (!officers.length) return "";

  // One or two people in a three-column grid is one face and two
  // holes, so they lie down instead.
  if (officers.length <= 2) {
    return `<div class="faces faces--row" role="list">${officers
      .map((o) => renderFace(o, href))
      .join("")}</div>`;
  }

  // Only when the roster genuinely outruns the grid. At exactly
  // FACE_TILES the naive subtraction yields 1, and the grid trades a
  // named officer for a "+1" chip that stands for nobody it could not
  // have shown.
  const overflow =
    officers.length > FACE_TILES ? officers.length - (FACE_TILES - 1) : 0;
  const shown = overflow > 0 ? officers.slice(0, FACE_TILES - 1) : officers.slice(0, FACE_TILES);
  const more =
    overflow > 0
      ? `<a class="face face--more" href="${escapeAttr(href)}" role="listitem">
           <span class="face__avatar" aria-hidden="true">+${overflow}</span>
           <span class="face__name">All officers</span>
         </a>`
      : "";
  return `<div class="faces" role="list">${shown
    .map((o) => renderFace(o, href))
    .join("")}${more}</div>`;
}

/**
 * The left column: the people, the chapter's own paragraph, and the
 * way to all of them.
 *
 * The paragraph is `config.about` and nothing else. The one true
 * sentence is in the hero now, and printing it here as well would be
 * the same sentence twice, 600px apart, on every chapter that has not
 * written an About yet — which today is all twelve.
 */
function renderEboardColumn(bundle: ChapterBundle, livePages: Set<string>): boolean {
  const host = document.getElementById("eboard-host");
  if (!host) return false;
  const cfg = bundle.config;
  const officers = cfg?.officers ?? [];
  const about = (cfg?.about ?? "").trim();
  // Every link out of this column goes to the roster, so all of them
  // go when the roster has no page to be on.
  const href = livePages.has("about") ? "#about" : "";

  const picture = renderPeoplePicture(cfg, href || "#");
  const paragraph = about
    ? `<div class="people__about">${about
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p) => `<p>${renderInlineMarkdown(p)}</p>`)
        .join("")}</div>`
    : "";

  // "and how to reach them" is checked against the cards rather than
  // against the roster existing: ROAR's one officer has no email and
  // no LinkedIn, and the offer would be false there.
  const link =
    officers.length && href
      ? `<p class="people__links"><a class="link--arrow" href="${href}">${
          officers.some(officerIsReachable)
            ? "Every officer, and how to reach them"
            : "Every officer"
        }</a></p>`
      : "";

  if (!picture && !paragraph && !link) return false;
  host.innerHTML = `${picture}${paragraph}${link}`;
  return true;
}

/**
 * Give up the eboard column — and the band with it when the board was
 * not carrying anything either.
 *
 * Shared by the ordinary "nothing to show" path and by the group
 * photo's error handler, which can arrive at the same state one round
 * trip after everybody else has decided the page.
 */
function collapseEboardColumn(boardRendered: boolean): void {
  document.getElementById("people-eboard")?.remove();
  if (boardRendered) {
    // One column left standing spans the band at the board's own
    // measure rather than sitting in a half-width track with a hole
    // beside it.
    document.getElementById("people")?.classList.add("people--solo");
    return;
  }
  document.getElementById("band-people")?.remove();
  // The hero's secondary button scrolls to this band by id. A band
  // that removed itself must not leave a button to nowhere behind it.
  document
    .querySelectorAll('#hero-actions a[href="#band-people"]')
    .forEach((a) => a.remove());
}

/**
 * The group photo can 404 after renderEboardColumn has already counted
 * it as something to show.
 *
 * On a chapter whose column is the photo and nothing else — no
 * officers, no About — that leaves "Meet the eboard" as a head over an
 * empty column, which is precisely the state the band-removal rule
 * exists to prevent. So the failure takes the column with it, and the
 * band too when the board beside it is only a note.
 */
function wirePeoplePhoto(boardRendered: boolean): void {
  const img = document.querySelector<HTMLImageElement>("img[data-people-photo]");
  const host = document.getElementById("eboard-host");
  if (!img || !host) return;
  const fail = () => {
    img.closest(".people__photo")?.remove();
    if (!host.children.length) collapseEboardColumn(boardRendered);
  };
  // Already resolved (cache, or a capture's eager decode): naturalWidth
  // is the only thing that says which way it went.
  if (img.complete) {
    if (!img.naturalWidth) fail();
    return;
  }
  img.addEventListener("error", fail, { once: true });
}

/**
 * The band, both columns.
 *
 * Returns whether the board took ownership of the members count, so
 * the hero's stats strip knows not to print it twice. The removal
 * is the interesting case — on a chapter with no officers, no group
 * photo, no About paragraph and nobody on the board, the band would
 * render "Meet the eboard" over one sentence and "The board" over a
 * note, which is two headings and no people. A visitor reads that as
 * the template talking about itself. NTUA is exactly that chapter, and
 * there Explore becomes the first band under the hero.
 *
 * ROAR keeps the band on one real officer, a note and a Join button,
 * because every one of those three is true.
 */
function renderPeopleBand(bundle: ChapterBundle, ctx: PeopleBandCtx): boolean {
  const band = document.getElementById("band-people");
  if (!band) return false;

  const boardHost = document.getElementById("board-host");
  const state = boardHost
    ? renderBoard(boardHost, bundle, {
        slug: ctx.slug,
        joinHref: ctx.joinHref,
        joinable: ctx.joinable,
        acronym: chapterAcronym,
        settled: motionSettled(),
      })
    : "note";

  // The eboard column can be gone before this runs: `about` is one of
  // the keys Customize toggles, and applySectionToggles removes every
  // element carrying it.
  const eboardCol = document.getElementById("people-eboard");
  const filled = eboardCol ? renderEboardColumn(bundle, ctx.livePages) : false;

  if (!filled) {
    collapseEboardColumn(state === "board");
    if (state !== "board") return false;
  }

  // The members claim, on the head of the object it counts. Only when
  // the board actually rendered rows: over a note it would be a count
  // of members none of whom are visible under it.
  const total = bundle.chapter?.member_count ?? 0;
  const ownsMembers = state === "board" && total >= 2;
  if (ownsMembers) setText("board-total", plural(total, "member"));

  if (filled) {
    wirePeoplePhoto(state === "board");
    if (state === "board") fitBoardToColumn();
  }
  return ownsMembers;
}

/**
 * End the two columns on the same line.
 *
 * The board is a scroller with a max-height, and 600px of it beside
 * MSOE's six face tiles and one link left 235px of dead column under
 * the eboard — the same hole the reference's own two-column band does
 * not have. So the scroller is measured against the column beside it
 * rather than set to a constant.
 *
 * Two floors under that, and they are not negotiable: eight rows,
 * because a board you cannot scan is not a board, and the natural
 * height of however many rows there are, because a six-row board must
 * never grow a scrollbar (WSU's whole board is seven members, and a
 * scrollbar there says there is more when there is not). The cap stays
 * 600px. Desktop only — below 900px the columns are stacked and below
 * 640px there is no scroller at all.
 */
function fitBoardToColumn(): void {
  const eboard = document.getElementById("people-eboard");
  const eboardHead = eboard?.querySelector<HTMLElement>(".band-head");
  const eboardHost = document.getElementById("eboard-host");
  const boardCol = document.getElementById("people-board");
  const board = boardCol?.querySelector<HTMLElement>(".board");
  const scroller = board?.querySelector<HTMLElement>(".board__scroll");
  const head = boardCol?.querySelector<HTMLElement>(".band-head");
  const rows = scroller?.querySelectorAll<HTMLElement>("[data-lb-row]");
  if (!eboard || !eboardHost || !board || !scroller || !head || !rows?.length) return;
  if (window.matchMedia?.("(max-width: 899px)").matches) return;

  /* Every measurement below is taken with containment off over the
     first block of rows, and that is not a nicety.

     The rows sit in `content-visibility: auto` blocks (see hub.css), so
     a block the browser has not decided is on screen yet reports its
     intrinsic estimate rather than the height its rows really have —
     and this runs in the same task as the render, before anything has
     been on screen at all. Measured against the estimate, a six-row
     board came out 56px short of its own content and a seven-row board
     66px, so both grew a scrollbar and the "there is more" fade over
     rows that were simply cut off. That is the exact case the floor
     below exists to prevent. One block is enough: the floor is eight
     rows, and a board past 25 of them is over the 600px cap either
     way. */
  board.classList.add("is-measuring");

  // What the frame costs before a single row: the search box, the
  // sticky head and the status line.
  const chrome = board.offsetHeight - scroller.offsetHeight;
  const headBlock = head.offsetHeight + 24; /* .band-head--lead margin */
  /* The eboard column's own CONTENT, not its box. `.people` is
     `align-items: stretch` (which is what makes the two columns end
     level in the first place), so #people-eboard has already been
     stretched to the grid row — which is the taller of the two
     columns, which is usually this board. Measuring that box made the
     target a function of the board's current height, so `h` could only
     ever grow: the whole function was inert. The head and the host are
     the column's two real children, so their heights are the number
     this wants. */
  const eboardBlock =
    (eboardHead ? eboardHead.offsetHeight + 24 : 0) + eboardHost.offsetHeight;
  const target = eboardBlock - headBlock - chrome;

  const eighth = rows[Math.min(7, rows.length - 1)];
  /* Rectangles, not offsetTop: `content-visibility` carries paint
     containment, which makes the block a containing block — and so the
     offsetParent of the rows inside it. offsetTop then counts from the
     top of the block rather than from the top of the scroller and drops
     the sticky head's 36px, which is a board 36px short of its own
     floor. This is measured against the scroller's content origin and
     does not care what contains what. */
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const floor = eighth.getBoundingClientRect().bottom - origin;
  const natural = scroller.scrollHeight;
  board.classList.remove("is-measuring");

  const h = Math.min(Math.max(target, Math.min(floor, natural)), 600);
  board.style.setProperty("--board-h", `${Math.round(h)}px`);
}

/* ── Explore ─────────────────────────────────────────────────────── */

interface FeatureImage {
  src: string;
  /** Says a photograph is from somewhere else. Chapter-authored
   *  pictures never have one. */
  caption?: string;
  /** Drawn inside the box rather than cropped to fill it: a logo. */
  contain?: boolean;
  /** Where to go when this picture turns out not to be a picture —
   *  see wireFeatureImages. */
  fallback?: { src: string; caption: string };
}

interface Feature {
  title: string;
  subtitle: string;
  /** Markdown; rendered with the same pass event descriptions get. */
  body: string;
  image: FeatureImage | null;
  /** One line of this chapter's own live data, already escaped. */
  live?: string;
  link?: { label: string; href: string };
}

function renderFeature(f: Feature, i: number): string {
  const fallback = f.image?.fallback;
  const photo = f.image
    ? `<figure class="feature__figure">
         <div class="feature__photo${f.image.contain ? " feature__photo--contain" : ""}">
           <img src="${escapeAttr(f.image.src)}" alt="" loading="${
             isCaptureStill() ? "eager" : "lazy"
           }" decoding="async"${
             fallback
               ? ` data-fallback="${escapeAttr(fallback.src)}" data-fallback-caption="${escapeAttr(fallback.caption)}"`
               : ""
           } />
         </div>
         ${f.image.caption ? `<figcaption class="feature__caption">${escapeHtml(f.image.caption)}</figcaption>` : ""}
       </figure>`
    : "";
  // The photo changes sides down the column so the page has a rhythm
  // rather than a left margin of pictures. Below 900px there is one
  // column and the flip is meaningless, which the stylesheet handles.
  const flip = f.image && i % 2 === 1 ? " feature--flip" : "";
  const bare = f.image ? "" : " feature--bare";
  const link = f.link
    ? `<a class="feature__link link--arrow" href="${escapeAttr(f.link.href)}"${
        /^https?:/.test(f.link.href) ? ` target="_blank" rel="noopener noreferrer"` : ""
      }>${escapeHtml(f.link.label)}</a>`
    : "";
  return `
    <div class="feature${flip}${bare}" role="listitem">
      ${photo}
      <div class="feature__body">
        <h3 class="feature__title">${escapeHtml(f.title)}</h3>
        ${f.subtitle ? `<p class="feature__sub">${escapeHtml(f.subtitle)}</p>` : ""}
        <div class="feature__text">${renderRichMarkdown(f.body)}</div>
        ${f.live ? `<p class="feature__live">${f.live}</p>` : ""}
        ${link}
      </div>
    </div>`;
}

/**
 * The block's picture has to survive a 4:3 frame, and a cover is not
 * always a photograph.
 *
 * MSOE's next event carries the 1128×191 network banner as its cover —
 * a 5.9:1 strip with words on it. Cropped to 4:3 that is a black tile
 * with half a letter in it, which is worse than no picture and much
 * worse than a real photograph of a real room. So a cover wider than
 * 2.2:1 (lib events already calls that a banner rather than a photo,
 * see fitCover) hands the slot to the default photograph, and so does
 * a cover that fails to load at all.
 *
 * Measured from the decoded image because nothing in the bundle says
 * what shape a cover is.
 *
 * A picture with no fallback to hand — an authored block's own
 * image_url, the learning tree's thumbnail, the rewards photo — gets
 * the other half of this: its figure goes and the block's text spans
 * the row, exactly as a block with no picture renders. The alternative
 * is a bordered, empty 4:3 box, which is the empty photo frame §12
 * forbids.
 */
function wireFeatureImages(host: HTMLElement): void {
  host.querySelectorAll<HTMLImageElement>(".feature__figure img").forEach((img) => {
    if (img.dataset.fallback === undefined) {
      const drop = () => {
        const feature = img.closest<HTMLElement>(".feature");
        img.closest(".feature__figure")?.remove();
        feature?.classList.remove("feature--flip");
        feature?.classList.add("feature--bare");
      };
      if (img.complete) {
        if (!img.naturalWidth) drop();
      } else {
        img.addEventListener("error", drop, { once: true });
      }
      return;
    }
    const swap = (force: boolean) => {
      const ratio = img.naturalWidth && img.naturalHeight
        ? img.naturalWidth / img.naturalHeight
        : 0;
      if (!force && ratio && ratio <= 2.2) return;
      const src = img.dataset.fallback;
      const caption = img.dataset.fallbackCaption ?? "";
      if (!src) return;
      delete img.dataset.fallback;
      img.src = src;
      const figure = img.closest("figure");
      if (figure && caption && !figure.querySelector(".feature__caption")) {
        figure.insertAdjacentHTML(
          "beforeend",
          `<figcaption class="feature__caption">${escapeHtml(caption)}</figcaption>`,
        );
      }
    };
    if (img.complete && img.naturalWidth) swap(false);
    else {
      img.addEventListener("load", () => swap(false), { once: true });
      img.addEventListener("error", () => swap(true), { once: true });
    }
  });
}

/** An authored block, or null when the chapter left it unusable. A
 *  block is its title: without one there is nothing to head it with. */
function authoredFeature(row: FeatureBlockRow, livePages: Set<string>): Feature | null {
  const title = (row.title ?? "").trim();
  if (!title) return null;
  const image = row.image_url ? safeHttpUrl(row.image_url) : null;
  const href = (row.link_href ?? "").trim();
  const label = (row.link_label ?? "").trim();
  // A hash link is checked against the pages that exist, an absolute
  // one against its scheme. Anything else is dropped rather than
  // rendered as a button into nowhere.
  const target = href.startsWith("#")
    ? ctaTargetLives(href, livePages)
      ? href
      : null
    : safeHttpUrl(href);
  return {
    title,
    subtitle: (row.subtitle ?? "").trim(),
    body: (row.body ?? "").trim(),
    // An officer's own photo of their own club is never captioned:
    // the caption exists to say a picture is from somewhere else.
    image: image ? { src: image } : null,
    link: target && label ? { label, href: target } : undefined,
  };
}

/**
 * The four default blocks, plus Rewards when there is a shelf.
 *
 * Every sentence here is either true of the NETWORK or read off this
 * chapter's live data. That rule is why the Events copy does not name
 * a cadence: the draft said "ALL chapters run on a two-week rhythm",
 * and a chapter that meets monthly reads its own front page telling it
 * otherwise. Anything we would have to guess at is not printed.
 */
function defaultFeatures(
  bundle: ChapterBundle,
  livePages: Set<string>,
  floor: CurriculumFloor | null,
  boardAbove: boolean,
): Feature[] {
  const events = bundle.events ?? [];
  const projects = bundle.projects ?? [];
  const merch = bundle.merch ?? [];
  const hubName = bundle.config?.hub_name ?? bundle.chapter?.name ?? config.hub_name;
  const out: Feature[] = [];

  /* 1 — Events. */
  const next = nextEvent(events);
  const past = latestPastEvent(events);
  const lead = next ?? past;
  const eventCover = lead?.image_url ? safeHttpUrl(lead.image_url) : null;
  out.push({
    title: "Events",
    subtitle: "Something to show up to",
    // "the board above" is a reference to something on this page, so
    // it is only made when the page has one: on a chapter with no
    // officers and nobody scored, the people band removed itself and
    // Explore is the first band under the hero.
    body:
      "Chapters run speakers, workshops and build nights through the term, with projects going on between them. Every event has a QR check-in, and checking in is what puts your name on " +
      (boardAbove ? "the leaderboard above." : "the chapter's leaderboard."),
    image: eventCover
      ? { src: eventCover, fallback: DEFAULT_PHOTOS.events }
      : { src: DEFAULT_PHOTOS.events.src, caption: DEFAULT_PHOTOS.events.caption },
    live: lead
      ? `${next ? "Next up" : "Most recent"}: <strong>${escapeHtml(lead.title)}</strong> · ${escapeHtml(
          monthDay(lead.date, lead.timezone),
        )}`
      : undefined,
    link: livePages.has("events") ? { label: "All events", href: "#events" } : undefined,
  });

  /* 2 — Projects. The newest year group's first project, which is the
     same pick the old projects band led with. */
  const newestYear = projects.length ? deriveYearFilters(projects)[0]?.year ?? null : null;
  const pool = newestYear
    ? projects.filter((p) => (p.year ?? "").trim() === newestYear)
    : projects;
  const newest = (pool.length ? pool : projects)[0] ?? null;
  const projectCover = newest?.image_url ? safeHttpUrl(newest.image_url) : null;
  const byline = newest ? renderByline((newest as ProjectWithMembers).members ?? []) : "";
  out.push({
    title: "Projects",
    subtitle: "Build something you can point to",
    // The second sentence names a room, so it is only written on a
    // chapter that has that room — the same rule the Events copy
    // honours with its boardAbove branch. ROAR and NTUA have no
    // Projects tab and were being told where their finished work
    // lives.
    body:
      "Small teams take a real problem for a term — a sponsor's brief, a competition, a research question — and ship something with their names on it" +
      (livePages.has("projects")
        ? ". Finished work lives on the Projects page, credited to the students who built it, and on each builder's network profile."
        : ", credited on each builder's network profile."),
    image: projectCover
      ? { src: projectCover, fallback: DEFAULT_PHOTOS.projects }
      : { src: DEFAULT_PHOTOS.projects.src, caption: DEFAULT_PHOTOS.projects.caption },
    live: newest
      ? `Latest: <strong>${escapeHtml(newest.title)}</strong>${byline ? ` — ${escapeHtml(byline)}` : ""}`
      : undefined,
    link: livePages.has("projects") ? { label: "All projects", href: "#projects" } : undefined,
  });

  /* 3 — The learning tree. The one block that renders the same on a
     three-year-old chapter and a two-week-old one. */
  const lessons = floor?.path ?? [];
  const firstLesson = lessons[0] ?? null;
  const thumb = firstLesson?.thumbnail ? safeHttpUrl(firstLesson.thumbnail) : null;
  out.push({
    title: "The learning tree",
    subtitle: "A path from zero to shipping",
    // The count is only printed when the curriculum actually resolved.
    // A guessed number of free lessons is a number somebody counts.
    body: `${
      lessons.length ? `${lessons.length} free lessons` : "Free lessons"
    }, self-paced, from what AI actually is through setting up an editor and writing your first program, to training and deploying models. It is the same path every chapter in the network teaches, and officers add their own lessons on top.`,
    image: thumb ? { src: thumb } : null,
    live: firstLesson
      ? `Starts with: <strong>${escapeHtml(firstLesson.title)}</strong>${
          firstLesson.estimated_minutes
            ? ` · ${escapeHtml(String(firstLesson.estimated_minutes))} min`
            : ""
        }`
      : undefined,
    link: livePages.has("learn")
      ? { label: "Open the learning tree", href: "#learn" }
      : undefined,
  });

  /* 4 — The network. */
  out.push({
    title: "The network",
    subtitle: "One record, every chapter",
    body: `${hubName} is a chapter of the ALL Applied AI Network. Your check-ins, projects and badges here also land on your ALL profile, which travels with you between chapters and is what sponsors browse when they are hiring.`,
    image: { src: "/all-logo-transparent.png", contain: true },
    link: { label: "See the network", href: IMPACT_URL },
  });

  /* 5 — Rewards, only where there is a shelf: 1 chapter of 12. */
  if (merch.length) {
    const named = merch
      .slice(0, REWARD_NAMES)
      .map((m) => `<strong>${escapeHtml(m.name)}</strong>`)
      .join(", ");
    const rest = merch.length - REWARD_NAMES;
    const photo = merch
      .flatMap((m) => (m.images?.length ? m.images : m.image_url ? [m.image_url] : []))
      .map((u) => safeHttpUrl(u))
      .find((u): u is string => !!u);
    out.push({
      title: "Rewards",
      subtitle: "What the points are for",
      // Not "points buy things": half of MSOE's shelf carries
      // cost_points: 0 and a cost_text like "Participate in and
      // Complete a MAIC Research Group" — which is why renderMerchCard
      // prefers cost_text over the price at all. And no cadence: we do
      // not know when this chapter meets.
      body: "Some of the shelf is bought with the points you earn at events, and some of it is earned by doing the thing itself.",
      image: photo ? { src: photo } : null,
      live: `On the shelf: ${named}${rest > 0 ? ` +${rest}` : ""}`,
    });
  }

  return out;
}

/**
 * Explore: the chapter's own blocks, or the defaults.
 *
 * "Authored means authored" — one block written in Customize replaces
 * all five defaults rather than joining them, because a chapter that
 * started writing its own page should not find ours appended to it.
 */
function renderExplore(
  bundle: ChapterBundle,
  livePages: Set<string>,
  floor: CurriculumFloor | null,
): void {
  const band = document.getElementById("band-explore");
  const host = document.getElementById("features-host");
  if (!band || !host) return;

  const authored = (bundle.config?.feature_blocks ?? [])
    .slice(0, MAX_FEATURES)
    .map((row) => authoredFeature(row, livePages))
    .filter((f): f is Feature => f !== null);

  // Read off the DOM rather than recomputed: renderPeopleBand has
  // already run and is the only thing that decides this, so asking it
  // beats keeping a second copy of its rule in step with it.
  const features = authored.length
    ? authored
    : defaultFeatures(bundle, livePages, floor, !!document.getElementById("band-people"));

  if (!features.length) {
    band.remove();
    return;
  }

  const acronym = (bundle.config?.hub_acronym ?? "").trim();
  setText("explore-title", acronym ? `Explore ${acronym}` : "What we do");
  host.innerHTML = features.map(renderFeature).join("");
  wireFeatureImages(host);
  // The capture recipe waits for this: a screenshot taken before
  // Explore renders is a screenshot of a page with a hole in it.
  host.dataset.ready = "1";
}

/* ── Community links ─────────────────────────────────────────────── */

/**
 * Every channel this chapter points people at, in the eboard's own
 * order, deduped and scheme-checked.
 *
 * Three sources, in precedence order. `community_links` is the list
 * officers now edit, and the API folds the legacy seven-key
 * `social_links` blob into it — but only on an API that has shipped
 * the field, so this falls back to folding it in itself. The baked
 * `config.links` comes last and only fills gaps: it exists for a fork
 * running its own hub.config.json, and a live chapter's own dashboard
 * must always win over a value compiled into the bundle.
 */
function communityLinks(remote: RemoteConfig | null): CommunityLink[] {
  const rows: CommunityLink[] = [
    ...(remote?.community_links ?? []).map((r) => ({
      platform: (r.platform ?? "").trim().toLowerCase(),
      url: (r.url ?? "").trim(),
      label: (r.label ?? "")?.trim() || null,
    })),
  ];
  if (!rows.length) rows.push(...linksFromSocial(remote?.social_links));
  rows.push(...linksFromSocial(config.links));

  const seen = new Set<string>();
  const out: CommunityLink[] = [];
  for (const row of rows) {
    if (!row.platform || !row.url) continue;
    if (seen.has(row.platform)) continue;
    // An address is not a URL and must never be trusted as an href:
    // the mailto: is built here from a value that parses as one
    // address, exactly as the officer cards build theirs.
    const ok =
      row.platform === "email" ? mailtoHref(row.url) : safeHttpUrl(communityHref(row));
    if (!ok) continue;
    seen.add(row.platform);
    out.push({ ...row, url: ok });
  }
  // Join-type first, in the eboard's order within each group: a
  // visitor reading this row is deciding whether to join, and an
  // Instagram link is not that decision.
  const rank = (l: CommunityLink) => (platformMeta(l.platform).kind === "join" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** The buttons in the join band. Join-type gets the label and the
 *  tint; everything else is a mark and a word. */
function renderCommunityLinks(links: CommunityLink[]): string {
  return links
    .map((l) => {
      const meta = platformMeta(l.platform);
      const join = meta.kind === "join";
      const label = l.label || (join ? meta.verb : meta.label);
      return `
        <a class="plink ${join ? "plink--join" : "plink--follow"}" href="${escapeAttr(l.url)}"
           ${l.platform === "email" ? "" : `target="_blank" rel="noopener noreferrer"`}
           aria-label="${escapeAttr(label)}">
          <span class="plink__icon" aria-hidden="true">${platformIcon(l.platform)}</span>
          <span class="plink__label">${escapeHtml(label)}</span>
        </a>`;
    })
    .join("");
}

/* ── Ready to join ───────────────────────────────────────────────── */

/**
 * The close: the invite, the channels, the partner aside, and the one
 * number on this page that is a percentage.
 *
 * The description is written from what the chapter actually has, in
 * four cases, because "Join our Discord" on a chapter with no Discord
 * is the failure this whole pass is about.
 */
function renderJoin(
  bundle: ChapterBundle,
  livePages: Set<string>,
  links: CommunityLink[],
  joinUrl: string | null,
): void {
  const band = document.getElementById("band-join");
  if (!band) return;

  const events = bundle.events ?? [];
  const joinLinks = joinChannels(links);
  const next = nextEvent(events);

  let desc: string;
  if (joinUrl) {
    desc = joinLinks.length
      ? "Pick a channel and you will hear about the next event. Adding your name takes a minute and is what puts you on the leaderboard."
      : "Joining takes a minute and puts your name on the leaderboard.";
  } else if (joinLinks.length) {
    desc = `The fastest way in is the ${platformMeta(joinLinks[0].platform).label}: that is where the next event is announced.`;
  } else if (next) {
    // Not "come to the next event": the button 40px under this one
    // already says that, and the same sentence twice in a row is the
    // duplication Ben rejected on the last pass. This one carries what
    // the button cannot — that there is nothing else to do.
    desc = "There is no application. Turn up, check in, and your name is on the leaderboard.";
  } else if (events.length) {
    // The chapter has run events but has nothing on the calendar, so
    // there is no "next event" to send anyone to and the sentence
    // above would be promising one. ROAR is exactly here: one event,
    // in September, and no invite.
    desc = "Turning up is the whole application — the next event is announced here.";
  } else {
    desc = "The first members are joining now. Check back for the invite, or start the curriculum meanwhile.";
  }
  const descEl = document.getElementById("join-desc");
  if (descEl) {
    // The one case with a link in it: on a chapter with nothing else
    // to offer, the curriculum is the offer.
    descEl.innerHTML =
      !joinUrl && !joinLinks.length && !events.length && livePages.has("learn")
        ? desc.replace(
            "start the curriculum",
            `<a href="#learn">start the curriculum</a>`,
          )
        : escapeHtml(desc);
  }

  /* The band LEADS with the rooms.

     It used to lead with one button — "Join MAIC", the bare roster link
     — and hang the channels under it as an afterthought, which is the
     same mistake the masthead was making: the thing a visitor is here
     to do is get into the room where the next event is announced, and
     the roster is the second half of that, not the first. So every
     join-kind channel is a button here, and the roster follows as a
     named line rather than as an unlabelled "Join".

     With no channels — every chapter in the network today — this is the
     button it always was, and it opens the panel rather than jumping
     straight out to the roster form. */
  const actions = document.getElementById("join-actions");
  if (actions) {
    if (joinLinks.length) {
      const roster = joinUrl
        ? `<a class="join__roster link--arrow" href="${escapeAttr(joinUrl)}" rel="noopener">Add my name to the leaderboard</a>`
        : "";
      // The class, not a :has() — the stylesheet has no other one and
      // the render already knows which shape this row is.
      actions.classList.add("join__actions--channels");
      actions.innerHTML = `<div class="plinks plinks--lead">${renderChannelButtons(joinLinks)}</div>${roster}`;
    } else if (joinUrl) {
      actions.innerHTML = `<a class="btn btn--primary" href="${escapeAttr(joinUrl)}" rel="noopener" data-join-panel>Join ${escapeHtml(chapterAcronym)}</a>`;
    } else if (next) {
      actions.innerHTML = `<a class="btn btn--primary" href="${escapeAttr(
        eventPageHref(next.id, window.location.pathname),
      )}">Come to our next event</a>`;
    }
  }

  // Whatever is left, which is never a channel: the channels are all
  // above now, so this row cannot repeat one. That also retires the
  // slice that used to guess which link the button had taken — it was
  // deleting a real Instagram or email row on the chapters where the
  // button had not come from this list at all.
  const linksEl = document.getElementById("join-links");
  if (linksEl) {
    linksEl.innerHTML = renderCommunityLinks(
      links.filter((l) => platformMeta(l.platform).kind !== "join"),
    );
  }

  const aside = document.getElementById("join-aside");
  if (aside && livePages.has("sponsor")) {
    aside.innerHTML = `Sponsoring, speaking, or hiring? <a class="link--arrow" href="#sponsor">Write to the eboard</a>`;
  }

  /* The one percentage on the page, and the only claim on it the
     chapter did not make itself. It sits last in the band, under a
     hairline, because it is the answer to "why join" at the moment of
     joining — and it is set at body size, not in grey small print: a
     cited outcome that reads as legal boilerplate is a cited outcome
     nobody reads. */
  const proof = document.getElementById("proof");
  if (proof) {
    proof.innerHTML =
      "Across the network, active members graduated into starting salaries " +
      "<strong>38% above their non-member peers.</strong><sup>*</sup>";
  }
  const note = document.getElementById("proof-note");
  if (note) {
    note.innerHTML =
      `<sup>*</sup> ALL Applied AI Network Spring 2025 graduate outcomes among active members — ` +
      `two or more events in a semester, or one project event — across every chapter and every major. ` +
      `<a href="${IMPACT_URL}" target="_blank" rel="noopener">Methodology on the network site</a>.`;
  }
}

/* ── The footer ──────────────────────────────────────────────────── */

/**
 * Brand, every room, the channels, and the network's line.
 *
 * It replaces a footer that was a logo, seven hand-drawn social icons
 * and an attribution: a visitor who read to the bottom of the page had
 * nowhere to go from there. The quick links are the live pages in
 * PAGES order, which is the nav's order — a second ordering of the
 * same six rooms is a second thing to learn.
 */
function renderFooter(pages: Page[], links: CommunityLink[], joinUrl: string | null): void {
  const list = document.getElementById("footer-links");
  if (list) {
    const rooms = pages
      .map((p) => `<li><a href="#${escapeAttr(p.key)}">${escapeHtml(p.label)}</a></li>`)
      .join("");
    const join = joinUrl
      ? `<li><a href="${escapeAttr(joinUrl)}" rel="noopener">Join ${escapeHtml(chapterAcronym)}</a></li>`
      : "";
    list.innerHTML = `${rooms}${join}`;
  }

  const socials = document.getElementById("footer-socials");
  const follow = document.getElementById("footer-follow");
  if (!socials) return;
  if (!links.length) {
    // #footer-socials is one of the ten ids the dashboard detects this
    // template by, so the element survives even when its column does
    // not — it moves into the brand column, empty, where the :empty
    // rule collapses it.
    if (follow && follow.parentElement) {
      const inner = follow.parentElement;
      inner.querySelector(".footer__brand")?.appendChild(socials);
      follow.remove();
      inner.classList.add("footer__inner--no-follow");
    }
    return;
  }
  socials.innerHTML = links
    .map((l) => {
      const meta = platformMeta(l.platform);
      return `<a class="footer-social" href="${escapeAttr(l.url)}"${
        l.platform === "email" ? "" : ` target="_blank" rel="noopener noreferrer"`
      } aria-label="${escapeAttr(meta.label)}" title="${escapeAttr(meta.label)}">${platformIcon(l.platform)}</a>`;
    })
    .join("");
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

/* The SOCIAL_ICONS / SOCIAL_LABELS maps and renderSocials are gone.
   Seven hand-traced glyphs for seven platforms — one of them still
   labelled "Twitter / X" — have become the sixteen real marks in
   lib/platform-icons.ts, and the footer row is rendered by
   renderFooter above from the same community list the join band uses.
   One list, two surfaces; a chapter can no longer have a Discord in
   its footer and not in its join band. */

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
  about: {
    kicker: "The club",
    title: "About",
    // Overridden per chapter by aboutHeaderDesc() — About is the one
    // page whose blocks are both optional, so its line is the one
    // line that cannot be written once. The fallback here is only
    // reached if that resolver is ever unwired.
    desc: "The students who run {acronym}, and how to reach them.",
  },
  sponsor: {
    kicker: "Partners",
    title: "Sponsor",
    desc: "Back {acronym}'s events and projects through the network's involvement platform, or write to the eboard directly.",
  },
};

/** The chapter's acronym, for the one header line that names it.
 *  Resolved once in init(); "us" is the wording that stays true when a
 *  fork has no acronym at all. */
let chapterAcronym = "us";

/**
 * About's header line, which names only the blocks the page actually
 * carries.
 *
 * Both of About's blocks are optional and each removes itself when the
 * chapter has not filled it in (see views/about.ts), so this is the one
 * header line in the map that cannot be written once. It matters today
 * rather than in theory: `about` is "" on all twelve chapters (verified
 * live, 2026-09-18), so the fixed line promised "What MAIC does" at the
 * top of a page that was a roster and nothing else — the header is the
 * first thing read on a page and it has to be true of the page under it.
 *
 * "how to reach them" is held to the same standard and checked against
 * the cards, not against the roster existing: ROAR's one officer has
 * no email and no LinkedIn, so its card is a monogram and a name and
 * the offer of a contact was false there too.
 *
 * The neither-block case is not handled because it cannot arrive: with
 * no About text and no officers the tab has no content and
 * pagesWithContent() drops it (NTUA, verified).
 */
function aboutHeaderDesc(): string {
  const cfg = viewCtx?.bundle.config;
  const hasAbout = !!(cfg?.about ?? "").trim();
  const officers = cfg?.officers ?? [];
  const reach = officers.some(officerIsReachable) ? ", and how to reach them" : "";
  if (hasAbout && officers.length) {
    return `What {acronym} does, the students who run it${reach}.`;
  }
  if (hasAbout) return "What {acronym} does.";
  return `The students who run {acronym}${reach}.`;
}

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
      // About's line is resolved per chapter: its two blocks are both
      // optional, so the fixed line can promise a block that is not there.
      const desc = page.key === "about" ? aboutHeaderDesc() : copy.desc;
      setText("page-header-kicker", copy.kicker);
      setText("page-header-title", copy.title);
      setText("page-header-desc", desc.replace("{acronym}", chapterAcronym));
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
 * An unknown key still falls through to the first page, so a hash
 * nothing owns lands on Home rather than on a blank document.
 */
function getValidPageFromHash(pages: Page[]): string {
  const raw = window.location.hash.replace(/^#/, "").trim().split("/")[0];
  const key = LEGACY_PAGE_KEYS[raw] ?? raw;
  if (pages.some((p) => p.key === key)) return key;
  return pages[0]?.key ?? "home";
}

/** Hashes that were page keys on a site these twelve chapters have
 *  been linking to for months. `#officers` and `#team` were the
 *  roster, which is on About now; `#members` and `#merch` were the
 *  board and the shelf, which are on Home. An unknown hash already
 *  falls through to the first page, so the last two are documentation
 *  as much as routing — but a reader should not have to know about the
 *  fallthrough to see that those links still land right. Four lines
 *  here beats a dead link in somebody's Discord from last semester. */
const LEGACY_PAGE_KEYS: Record<string, string> = {
  officers: "about",
  team: "about",
  members: "home",
  merch: "home",
};

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
  // One pill per section KEY, not per element. The landing page
  // carries a window onto two destinations, so `projects` and
  // `learning_tree` each match two elements — and an officer looking
  // at Customize would see the same "Projects page" pill twice with no
  // way to tell them apart. First in document order wins, which is the
  // Home band: the page an officer is looking at while they edit.
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
  // work — the people band, the board, Explore, a curriculum wait — is
  // never done behind an event nobody will see it under.
  const eventId = eventFromSearch(window.location.search);
  const isFlyer = Boolean(eventId) && !isPreview;

  // Identity and chrome: every load gets these, flyer included. The
  // takeover reads .nav__brand and #page-header, and its title bar says
  // the chapter's name.
  chapterAcronym = (remote?.hub_acronym ?? config.hub_acronym ?? "").trim() || "us";
  renderIdentity(remote, bundle?.chapter ?? null);
  renderHeroNetwork();
  // The chapter's own mark: its uploaded logo if it has one, else the
  // generated brain in its colours. Acronym (used by the brain) falls back
  // through the live config, then the baked one, then "ALL".
  // The hero takes the LIVING mark unless the chapter uploaded a real logo.
  // The API never hands back a null logo_url: a chapter with no upload gets
  // the dashboard's generated brain PNG, which is a still picture of the
  // very thing chapter-mark.ts draws and animates. Passing that URL through
  // meant the canvas mounted on exactly one chapter in the network — MSOE,
  // and only because its uploaded JPEG is a black slab that fails the
  // aspect guard. Treating the generated endpoint as "no logo" puts the
  // live mark on every chapter that has not chosen a logo of its own, which
  // is what it is for; an actual upload still wins, and the nav and favicon
  // keep using the PNG because they need a raster image.
  const uploadedLogo = logoUrl && !isGeneratedLogo(logoUrl) ? logoUrl : null;
  renderHeroMark(
    document.getElementById("hero-mark"),
    uploadedLogo,
    remote?.hub_acronym ?? config.hub_acronym ?? null,
  );
  // The sponsor page — a destination now, not a modal over Home. It is
  // told which chapter it acts for here, and on a page anyone can load
  // that is ALWAYS the configured chapter and never a ?slug= a link
  // set: a diverted sponsor lead is the part of finding 6 that costs
  // real money.
  //
  // Inside the dashboard's Customize iframe — which isDashboardPreview
  // has already proven is the dashboard, not a link — the previewed
  // chapter is used, so an officer previewing their site sees their own
  // sponsor page rather than a tab that has quietly removed itself.
  const sponsorSlug =
    configuredSlug || (isPreview ? (bundle?.chapter?.slug ?? "") : "");
  setSponsorChapter(
    sponsorSlug
      ? {
          slug: sponsorSlug,
          name: bundle?.chapter?.name ?? remote?.hub_name ?? config.hub_name,
        }
      : null,
  );
  // No chapter to post to and no chapter page to link at, so there is
  // no Sponsor tab. That is a fork of this template that never linked
  // itself to the dashboard; every hosted chapter has a slug.
  if (!sponsorSlug) hideSection("sponsor");

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

  const joinUrl = safeHttpUrl(bundle?.chapter?.join_url ?? "");

  /* The channels, before anything that offers to join.

     This used to be computed further down, beside the band that
     consumed it. It moved up because three surfaces now ask the same
     question — the masthead, the empty leaderboard's note and the band
     at the foot — and all three have to get the same answer: is there
     anything behind a Join button on this chapter, and what is it. The
     panel is wired once here, before the first of them renders, because
     its listener is delegated and the buttons arrive after it. */
  const links = communityLinks(remote);
  const joinOffer = { acronym: chapterAcronym, joinUrl, links };
  initJoinPanel(joinOffer);
  const channels = joinChannels(links);

  /* The people band renders BEFORE the hero, and the hero then reads
     the page rather than re-deciding it.

     Both of the hero's facts are facts about this band: whether it
     gets a "Meet the eboard" button, and whether the board below has
     taken ownership of the members count. Predicting them from bundle
     data meant predicting renderPeopleBand's own rule AND every way
     the band can disappear that the bundle does not know about —
     `applySectionToggles` removing [data-section="leaderboard"] is one,
     a group_photo_url that is not an http URL is another. Both shipped
     as a button to a band that was not there. The band's return value
     and the band's presence in the DOM cannot disagree with the band. */
  const boardOwnsMembers = bundle
    ? renderPeopleBand(bundle, {
        slug,
        livePages,
        joinHref: joinUrl ?? channels[0]?.url ?? null,
        joinable: offerIsReal(joinOffer),
      })
    : false;
  const peopleBandShown = Boolean(document.getElementById("band-people"));

  renderHeroActions(
    remote,
    bundle?.chapter ?? null,
    bundle?.events ?? [],
    livePages,
    peopleBandShown,
    channels,
  );
  renderStats(bundle?.chapter ?? null, bundle?.projects ?? [], boardOwnsMembers);
  renderTermLine(bundle?.events ?? []);
  renderPageCtaBands(livePages);

  if (bundle) {
    // The curriculum call went out beside the bundle and has had the
    // bundle's whole round trip to land, so this is normally already
    // resolved. Raced anyway: the learning-tree block must not be the
    // reason a chapter's front page waits on a third-party endpoint —
    // it renders without the count and without a thumbnail if the race
    // is lost, and every other block is already on the page.
    const floor = await Promise.race([
      curriculum,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
    renderExplore(bundle, livePages, floor);
    renderJoin(bundle, livePages, links, joinUrl);

    // Views mount on tab entry and read this.
    viewCtx = viewContext(bundle, slug, window.location.pathname);
  } else {
    // No bundle: the demo site and a preview of a slug the dashboard
    // does not know. There is no chapter data for any of the three
    // bands, and a synthesised empty one would be the template
    // pretending to be a chapter — which renderUnderConstruction
    // exists to refuse.
    ["band-people", "band-explore", "band-join"].forEach((id) =>
      document.getElementById(id)?.remove(),
    );
  }

  renderFooter(pages, links, joinUrl);
  wirePageRouting(pages);

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
