/* Member profile — https://{slug}.all-ai-network.org

   One keyless fetch of the member bundle, then the whole page is rendered
   once from string templates. It is the same person officers open on the
   dashboard: who they are and where to find them, three or four numbers
   that are doors to the rows they count, then the work itself — projects
   with their real covers, their own LinkedIn posts, the roles, the events
   they turned up to, the badges, the schools.

   Ben, 2026-10-12: the page was "pretty bland … doesn't include many
   colors nor images that could be of the actual content of stuff they
   worked on, or from their actual posts". So it now carries the member's
   LinkedIn cover, project covers, post photos, company and school logos,
   event photos and the badges' own artwork — every one of them a field of
   the bundle, on our storage, never a hotlink — and two chapter colours
   instead of one.

   Rules the page keeps:
   - Only what /api/public/member/{slug} sends. A section with no data is
     absent, never empty, and no number is ever printed as zero.
   - Two chapter colours (portfolio-colors.ts), both contrast-gated; a
     second colour that cannot be read is dropped, never faked.
   - No gradient, glow, blur or orb; no hover lift (hover changes colour
     or border, on pointer devices only).
   - Never: an accent disc or bullet before text, a "Now · member of …"
     line, an ID strip, eyebrows in mono capitals, a colophon, a logo
     inside a seal, a hand-drawn company or school logo.
   - The name sits under the cover, never on it: a LinkedIn banner often
     has its own words in it (the first draft printed a name over one).
   - Motion settles. The arrival is one seekable timeline (?seek=ms
     freezes it at that frame); after it, nothing runs until a visitor
     does something, and then only for as long as that takes. */

document.documentElement.classList.add("js-rv");

import { escapeHtml as esc, escapeAttr as attr } from "./lib/html";
import { hostnameSlug, isDashboardPreview } from "./lib/slug";
import { badgeGlyph } from "./portfolio-badge-icons";
import { chapterColors } from "./portfolio-colors";
import { languageColor } from "./portfolio-lang";
import { plainText } from "./plain-text";
import { GITHUB_MARK } from "./lib/brand-marks";

declare const __HUB_CONFIG__: { hub_domain?: string };

const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";
const HUB_DOMAIN = (__HUB_CONFIG__.hub_domain ?? "all-ai-network.org").toLowerCase();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── the bundle (mirrors network-api/src/lib/portfolio/compose.ts) ──
   One to one with PortfolioBundle and RecordEntry (src/lib/record.ts),
   optionality included, so a change to the contract shows up here as a
   diff. Fields this page does not read are still declared; the comment
   says so where it matters. */

type Entry = {
  id: string;
  kind: "checkin" | "badge" | "lesson" | "starting";
  date: string;
  title: string;
  chapterId: string | null;
  chapterName: string | null;
  chapterSlug: string | null;
  hubUrl: string | null;
  points: number | null;
  phase: string | null;
  /** Badge rows. Not read here: badges are drawn from `badges`. */
  badgeIcon: string | null;
  /** Check-in rows only: the event's cover photo, on our storage. */
  eventImageUrl?: string | null;
  learningTreeNodeRef: string | null;
  eventId?: string | null;
  badgeId?: string | null;
  description?: string | null;
};
type Project = {
  id: string;
  kind: "build" | "chapterProject" | "repo";
  title: string;
  description: string | null;
  url: string | null;
  /** Same as kind === "chapterProject"; this page reads `kind`. */
  chapterProject: boolean;
  chapterName: string | null;
  status: "recruiting" | "building" | "shipped" | null;
  language: string | null;
  stars: number | null;
  /** A cover mirrored to our storage, or null (always null for repos,
   *  which get their language's colour instead). */
  imageUrl: string | null;
  /** created_at for builds and chapter projects (an import date for the
   *  latter, so never printed), updated_at for repos. */
  date: string;
};
type Experience = {
  role: string; company: string; period: string; location: string | null;
  description: string | null; bullets: string[]; current: boolean;
  /** The company's logo on our storage, or null → an initial tile. */
  logoUrl: string | null;
};
type Education = {
  school: string; degree: string; field: string | null; period: string; highlights: string[];
  logoUrl: string | null;
};
type Badge = {
  id: string;
  name: string;
  icon: string | null;
  awardedAt: string;
  chapterName: string | null;
  description?: string | null;
  badgeId?: string | null;
};
type Post = {
  id: string;
  url: string | null;
  /** The post's own words, at most 280 characters, never rewritten. */
  text: string;
  /** The post's first image on our storage, or null (text-only post). */
  imageUrl: string | null;
  reactions: number;
  postedAt: string | null;
};
type Bundle = {
  slug: string | null;
  name: string;
  /** The Clerk avatar when actually set, else the mirrored LinkedIn
   *  photo, else null → initials on the chapter colour. */
  imageUrl: string | null;
  headline: string | null;
  chapter: {
    id: string;
    name: string;
    slug: string | null;
    hubUrl: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    /** The chapter's second colour (theme_accent). */
    accentColor: string | null;
    acronym: string | null;
    verifyStudentId: string | null;
  } | null;
  chapterCount: number;
  since: string;
  /** Read by nothing on this page: the present-tense line it fed
   *  repeated the first row of the record under it. */
  now: { kind: "learning" | "building" | "checkin"; text: string } | null;
  record?: {
    entries: Entry[];
    totals: { points: number; events: number; badges: number };
    /** Points carried in from before events were tracked. */
    startingBalance: number;
  };
  badges?: Badge[];
  learning?: { bands: { id: string; title: string; done: number; count: number; lessons: { id: string; title: string; completedAt: string }[] }[] };
  projects?: Project[];
  resume?: {
    tagline: string | null; keywords: string[];
    /** Null when `source` is "linkedin": a LinkedIn sync has roles and
     *  schools but no summary, so that page has no About. */
    overview: { headline: string; summary: string; location: string | null } | null;
    experience: Experience[]; education: Education[];
    source: "resume" | "linkedin";
  };
  github?: { username: string; topLanguages: string[] };
  /** The LinkedIn banner, mirrored. Absent → a solid band in the
   *  chapter's primary. */
  cover?: { imageUrl: string };
  /** Up to 6 original LinkedIn posts, most-reacted first. */
  posts?: Post[];
  updatedAt: string;
};

/* ── helpers ─────────────────────────────────────────────────────── */

/** Year/month/day from the ISO date part only, so the day matches the
 *  /p/ sheet and the preview regardless of the viewer's zone. */
function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}
function formatMonth(iso: string): string {
  const [y, m] = ymd(iso);
  return `${MONTHS[m - 1]} ${y}`;
}
function formatLong(iso: string): string {
  const [y, m, d] = ymd(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
/** The first letter or digit of a name, for an initial tile. */
function initial(name: string): string {
  return (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? "").toUpperCase();
}
function safeHttp(raw: string | null | undefined): string | null {
  try {
    const u = new URL((raw ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Set once the bundle came from a local fixture. Only then may an image
 *  be a path on this host (the fixture's own copies); the live bundle's
 *  images are always absolute URLs on our storage. */
let fixtureMode = false;

/** An image URL from the bundle, or null. Never anything the bundle did
 *  not send: no fallbacks to third-party hosts, no guessed paths. */
function safeImg(raw: string | null | undefined): string | null {
  const http = safeHttp(raw);
  if (http) return http;
  const v = (raw ?? "").trim();
  return fixtureMode && /^\/fixtures\/portfolio\/img\/[\w.-]+$/.test(v) ? v : null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(location.search);
/** A ?seek= frame is a capture: it stitches the whole page from the top,
 *  and a lazy picture two screens down would be a hole in it. */
const EAGER = params.has("seek");

/* ── templates ───────────────────────────────────────────────────── */

const ext = ' target="_blank" rel="noopener"';
const btn = (label: string, extra = "", cls = "") =>
  `<button type="button" class="pp-btn${cls}"${extra}><span>${label}</span></button>`;

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>`;

/**
 * An image from the bundle. `fail` is what a broken load leaves behind:
 *   "drop"   the <img> goes and whatever is painted under it shows (the
 *            initials, the band, an initial tile, a date tile);
 *   "frame"  the picture's whole frame goes and its card closes up
 *            around the text, as if it never had a picture.
 * `fit` asks fitCovers to look at the image's edge first (project covers).
 */
function pic(src: string, cls: string, fail: "drop" | "frame", opts: { eager?: boolean; fit?: boolean } = {}): string {
  const load = opts.eager || EAGER ? "eager" : "lazy";
  // A capture decodes in step with the paint. With async decoding, a
  // full-page ?seek= capture painted most photos below the fold as empty
  // frames even though every one of them had loaded.
  const decoding = EAGER ? "sync" : "async";
  return `<img class="${cls}" src="${attr(src)}" alt="" loading="${load}" decoding="${decoding}" referrerpolicy="no-referrer" data-fail="${fail}"${opts.fit ? " data-fit" : ""}>`;
}

/** Rows past a section's cap: hidden until Show all, then revealed. */
const restOf = (html: string, label: string) => html
  ? `<div class="pp-rest" hidden>${html}</div><div class="pp-more">${btn(label, " data-show-all")}</div>` : "";

/**
 * A section: its name and its count. `count` is markup, already escaped,
 * because the Events count is two numbers a door can each land on.
 */
const section = (key: string, title: string, count: string, body: string) => `
  <section class="pp-section pp-section--${key} rv" id="pp-${key}" aria-labelledby="pp-${key}-h">
    <div class="pp-section__head">
      <h2 class="pp-section__title" id="pp-${key}-h" tabindex="-1">${title}${count ? `<span class="pp-section__count">${count}</span>` : ""}</h2>
    </div>${body}
  </section>`;

/** The number a door lands on, inside a section's count. */
const landing = (key: string, n: number) => `<b data-land="${key}">${n.toLocaleString()}</b>`;

/* ── the header: cover, portrait, name, links, numbers ──────────── */

/* The ring draws once around the portrait on arrival, in the chapter's
   colour, and stays. 2πr with r = 48.5 in a 100-unit box. */
const RING = 304.7;

/** The member's LinkedIn banner, or a solid band in the chapter's primary
 *  when they have none. A banner that fails to load leaves the band. */
function renderCover(b: Bundle): string {
  const src = safeImg(b.cover?.imageUrl);
  return `<div class="pp-cover${src ? "" : " pp-cover--band"}" id="pp-cover" aria-hidden="true">${
    src ? pic(src, "pp-cover__img", "drop", { eager: true }) : ""}</div>`;
}

function renderPortrait(b: Bundle): string {
  const photo = safeImg(b.imageUrl);
  return `
    <div class="pp-photo" id="pp-photo">
      <span class="pp-photo__mono" aria-hidden="true">${esc(initials(b.name))}</span>${
        photo ? pic(photo, "pp-photo__img", "drop", { eager: true }) : ""}
      <svg class="pp-photo__ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48.5" stroke-dasharray="${RING}" transform="rotate(-90 50 50)"/></svg>
    </div>`;
}

/** The name, one masked span per word so the arrival can raise each word
 *  out of its own baseline. Screen readers get the name once, whole. */
function renderName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return `<h1 class="pp-name" id="pp-name" aria-label="${attr(name)}">${words
    .map((w) => `<span class="pp-w" aria-hidden="true"><span>${esc(w)}</span></span>`)
    .join(" ")}</h1>`;
}

/** This page's own address, as the chip prints it and as Copy link and
 *  the share sheet hand it over: the canonical {slug}.all-ai-network.org
 *  with nothing after it, never location.href (which carries ?seek=,
 *  tracking tags, or the dashboard preview's own URL). Without a slug
 *  (a local fixture) it is this origin. */
function pageHost(b: Bundle): string {
  return b.slug ? `${b.slug}.${HUB_DOMAIN}` : location.host;
}
function pageUrl(b: Bundle): string {
  return b.slug ? `https://${b.slug}.${HUB_DOMAIN}/` : `${location.origin}/`;
}

function renderHeader(b: Bundle): string {
  const ch = b.chapter;
  const headline = b.headline ?? b.resume?.tagline ?? null;
  const hub = safeHttp(ch?.hubUrl);
  const chapterName = ch
    ? hub
      ? `<a class="pp-meta__chapter" href="${attr(hub)}">${esc(ch.name)}</a>`
      : `<span class="pp-meta__chapter">${esc(ch.name)}</span>`
    : "";
  const more = b.chapterCount > 1 ? `<span>and ${plural(b.chapterCount - 1, "more chapter")}</span>` : "";
  const where = plainText(b.resume?.overview?.location);
  const meta = [
    chapterName ? `<span>${chapterName}${more ? ` ${more}` : ""}</span>` : "",
    `<span>Member since ${formatMonth(b.since)}</span>`,
    where ? `<span>${esc(where)}</span>` : "",
  ].filter(Boolean).join(`<span class="pp-meta__sep" aria-hidden="true">·</span>`);

  // Where to find them: this page's own address (a click copies it),
  // their GitHub, and the chapter's own record of them.
  const host = pageHost(b);
  const verify = ch?.verifyStudentId
    ? `${DASHBOARD_ORIGIN}/verify/${encodeURIComponent(ch.verifyStudentId)}` : null;
  const chips = [
    `<button type="button" class="pp-chip" data-copy aria-label="Copy the link to this page">${LINK_ICON}<span class="pp-chip__label">${esc(host)}</span></button>`,
    b.github
      ? `<a class="pp-chip" href="https://github.com/${attr(b.github.username)}"${ext}>${GITHUB_MARK}<span class="pp-chip__label">${esc(b.github.username)}</span></a>`
      : "",
    verify ? `<a class="pp-chip" href="${attr(verify)}"${ext}><span class="pp-chip__label">Network record</span>${OUT_ICON}</a>` : "",
  ].filter(Boolean).join("");

  return `
  <header class="pp-head" id="pp-head">
    ${renderCover(b)}
    <div class="pp-id">
      ${renderPortrait(b)}
      <div class="pp-id__text">
        ${renderName(b.name)}
        ${headline ? `<p class="pp-headline pp-late">${esc(headline)}</p>` : ""}
        <p class="pp-meta pp-late">${meta}</p>
      </div>
    </div>
    <div class="pp-chips" id="pp-chips">${chips}</div>
    ${renderDoors(b)}
  </header>`;
}

/**
 * The numbers, and each one is a door to the rows it counts: events and
 * points open Events, badges the Badges, projects the Projects. A number
 * that would be zero is not a door to anything, so it is not here.
 */
function renderDoors(b: Bundle): string {
  const doors: { key: string; n: number; label: string; to: string }[] = [];
  const t = b.record?.totals;
  const ev = eventRows(b);
  const hasEvents = ev.checkins.length + ev.carried.length > 0;
  if (t && t.events >= 1 && hasEvents) doors.push({ key: "events", n: t.events, label: t.events === 1 ? "event" : "events", to: "events" });
  if (t && t.points >= 1 && hasEvents) doors.push({ key: "points", n: t.points, label: t.points === 1 ? "point" : "points", to: "events" });
  const nb = (b.badges ?? []).length;
  if (nb) doors.push({ key: "badges", n: nb, label: nb === 1 ? "badge" : "badges", to: "badges" });
  const np = (b.projects ?? []).length;
  if (np) doors.push({ key: "projects", n: np, label: np === 1 ? "project" : "projects", to: "projects" });
  if (!doors.length) return "";
  const SECTION: Record<string, string> = {
    events: ev.checkins.length ? "Events" : "Points", badges: "Badges", projects: "Projects",
  };
  // The count is said twice: --n sizes the columns, and data-n is what the
  // phone rule matches. Never match on the style attribute: the arrival
  // writes the strip's opacity into it, which reserialises "--n:4" as
  // "--n: 4;", and every visitor who saw the arrival got four cramped
  // columns at 390px instead of two by two.
  return `<div class="pp-doors" id="pp-doors" data-n="${doors.length}" style="--n:${doors.length}">${doors
    .map(
      (d) => `<button type="button" class="pp-door" data-door="${d.key}" data-to="${d.to}" aria-label="${attr(`${d.n.toLocaleString()} ${d.label}, go to ${SECTION[d.to]}`)}"><b class="pp-door__n">${d.n.toLocaleString()}</b><span class="pp-door__l">${d.label}</span></button>`,
    )
    .join("")}</div>`;
}

/* ── projects ───────────────────────────────────────────────────── */

const STATUS = { shipped: "Shipped", building: "Building", recruiting: "Recruiting" };

/** Chapter projects wear the chapter's second colour, builds its first;
 *  a repo's tag is its language, printed plain over the linguist band. */
function projectTag(p: Project): string {
  if (p.kind === "chapterProject") {
    return `<span class="pp-tag pp-tag--second">Chapter project${p.chapterName ? ` · ${esc(p.chapterName)}` : ""}</span>`;
  }
  if (p.kind === "build") return `<span class="pp-tag">Build${p.status ? ` · ${STATUS[p.status]}` : ""}</span>`;
  return "";
}

/** Stars and a month. Never a chapter project's date: that is the day the
 *  row was imported, not when the work happened. */
function projectFoot(p: Project): string {
  const parts = [
    p.stars && p.stars > 0 ? `★ ${p.stars.toLocaleString()}` : "",
    p.kind === "chapterProject" ? "" : formatMonth(p.date),
  ].filter(Boolean);
  return parts.length ? `<div class="pp-project__foot">${esc(parts.join(" · "))}</div>` : "";
}

/** The out-arrow travels with the last three letters of the title, so it
 *  never wraps onto a line of its own. Three letters, not the last word:
 *  a repo name is often one long word ("…Generation.pytorch"), and a
 *  whole word held on one line cannot break inside the card, so the card
 *  clipped it mid-word and the arrow with it. The letters before the
 *  span still break wherever the title's overflow-wrap lets them. */
function withOut(name: string): string {
  const text = name.trim();
  const cut = text.lastIndexOf(" ") + 1;
  const last = Array.from(text.slice(cut));
  const held = Math.min(3, last.length);
  const head = text.slice(0, cut) + last.slice(0, last.length - held).join("");
  return `${esc(head)}<span class="pp-nowrap">${esc(last.slice(last.length - held).join(""))}<span class="pp-out">${OUT_ICON}</span></span>`;
}

function projectTitle(p: Project, linked: boolean, arrow = false): string {
  const url = safeHttp(p.url);
  const name = p.kind === "repo" ? p.title.replace(/[-_]+/g, " ").trim() : p.title;
  if (linked && url) return `<a href="${attr(url)}"${ext}>${withOut(name)}</a>`;
  return arrow && url ? withOut(name) : esc(name);
}

const READ = { build: "Open the build", chapterProject: "Read the project", repo: "View the repo" };

/** Rows of three before "Show all". */
const CARD_CAP = 6;

function renderProjects(b: Bundle): string {
  const all = b.projects ?? [];
  if (!all.length) return "";
  // The first project with a real cover is the feature; the other covered
  // ones go two-up under it; the rest are cards, repos by stars.
  const covered = all.filter((p) => safeImg(p.imageUrl));
  const feature = covered[0] ?? null;
  const pair = covered.slice(1);
  const rest = all.filter((p) => !covered.includes(p));
  const cards = [
    ...rest.filter((p) => p.kind !== "repo"),
    ...rest.filter((p) => p.kind === "repo")
      .sort((x, y) => (y.stars ?? 0) - (x.stars ?? 0) || y.date.localeCompare(x.date)),
  ];

  const desc = (p: Project) => p.description ? `<p class="pp-project__desc">${esc(plainText(p.description))}</p>` : "";

  let html = "";
  if (feature) {
    const url = safeHttp(feature.url);
    html += `
    <article class="pp-feature rv" data-card>
      <div class="pp-feature__img pp-frame" data-frame>${pic(safeImg(feature.imageUrl)!, "", "frame", { fit: true })}</div>
      <div class="pp-feature__body">
        ${projectTag(feature)}
        <h3 class="pp-feature__title">${projectTitle(feature, false)}</h3>
        ${desc(feature)}
        ${projectFoot(feature)}
        ${url ? `<a class="pp-read" href="${attr(url)}"${ext}>${READ[feature.kind]}</a>` : ""}
      </div>
    </article>`;
  }
  if (pair.length) {
    html += `<div class="pp-pair rv-group">${pair.map((p, i) => `
      <article class="pp-pcard${pair.length % 2 && i === pair.length - 1 ? " pp-pcard--wide" : ""}" data-card>
        <div class="pp-pcard__img pp-frame" data-frame>${pic(safeImg(p.imageUrl)!, "", "frame", { fit: true })}</div>
        <div class="pp-pcard__body">
          ${projectTag(p)}
          <h3 class="pp-pcard__title">${projectTitle(p, true)}</h3>
          ${desc(p)}
          ${projectFoot(p)}
        </div>
      </article>`).join("")}</div>`;
  }
  const card = (p: Project) => {
    const url = safeHttp(p.url);
    const band = p.kind === "repo" ? languageColor(p.language) : null;
    const inner = `
        ${p.kind === "repo" ? `<span class="pp-card__band"${band ? ` style="--lang:${band}"` : ""}></span>` : ""}
        ${p.kind === "repo" ? (p.language ? `<span class="pp-card__lang">${esc(p.language)}</span>` : "") : projectTag(p)}
        <h3 class="pp-card__title">${projectTitle(p, false, true)}</h3>
        ${desc(p)}
        ${projectFoot(p)}`;
    // A card with somewhere to go is one link, the whole card, so a
    // thumb on a phone does not have to find the title.
    return url
      ? `<a class="pp-card${p.kind === "repo" ? " pp-card--repo" : ""}" href="${attr(url)}"${ext}>${inner}</a>`
      : `<article class="pp-card${p.kind === "repo" ? " pp-card--repo" : ""}">${inner}</article>`;
  };
  if (cards.length) {
    html += `<div class="pp-cards rv-group">${cards.slice(0, CARD_CAP).map(card).join("")}</div>${restOf(
      cards.length > CARD_CAP ? `<div class="pp-cards">${cards.slice(CARD_CAP).map(card).join("")}</div>` : "",
      `Show all ${plural(all.length, "project")}`,
    )}`;
  }
  html += renderLanguages(b);
  return section("projects", "Projects", landing("projects", all.length), html);
}

/** Their most-used languages on GitHub, each underlined in its linguist
 *  colour, the same colour as the band on that language's repo cards. */
function renderLanguages(b: Bundle): string {
  const langs = (b.github?.topLanguages ?? []).filter(Boolean).slice(0, 6);
  if (!langs.length) return "";
  return `
    <div class="pp-langs rv">
      <span class="pp-langs__label">Most-used on GitHub</span>${langs.map((l) => {
        const c = languageColor(l);
        return `<span class="pp-lang"${c ? ` style="--lang:${c}"` : ""}>${esc(l)}</span>`;
      }).join("")}
    </div>`;
}

/** GitHub synced but the projects switch is off: the languages alone. */
function renderCode(b: Bundle): string {
  if ((b.projects ?? []).length) return "";
  const langs = renderLanguages(b);
  return langs ? section("code", "Code", "", langs) : "";
}

/* ── LinkedIn posts ─────────────────────────────────────────────── */

function renderPosts(b: Bundle): string {
  const posts = (b.posts ?? []).filter((p) => p.text?.trim() || safeImg(p.imageUrl));
  if (!posts.length) return "";
  const card = (p: Post) => {
    const img = safeImg(p.imageUrl);
    const url = safeHttp(p.url);
    const foot = [
      p.reactions > 0 ? `<span><b>${p.reactions.toLocaleString()}</b> ${p.reactions === 1 ? "reaction" : "reactions"}</span>` : "",
      p.postedAt ? `<span>${formatMonth(p.postedAt)}</span>` : "",
    ].filter(Boolean).join("");
    const inner = `${img ? `<div class="pp-post__img" data-frame>${pic(img, "", "frame")}</div>` : ""}
        ${p.text?.trim() ? `<p class="pp-post__text">${esc(p.text.trim())}</p>` : ""}
        ${foot ? `<div class="pp-post__foot">${foot}</div>` : ""}`;
    const cls = `pp-post${img ? "" : " is-noimg"}`;
    return url
      ? `<a class="${cls}" href="${attr(url)}"${ext} data-card>${inner}</a>`
      : `<article class="${cls}" data-card>${inner}</article>`;
  };
  return section("posts", "On LinkedIn", String(posts.length),
    `<div class="pp-posts${posts.length < 3 ? ` pp-posts--${posts.length}` : ""} rv-group">${posts.map(card).join("")}</div>`);
}

/* ── the résumé ─────────────────────────────────────────────────── */

function renderAbout(b: Bundle): string {
  const r = b.resume;
  const summary = r?.overview?.summary ? plainText(r.overview.summary) : "";
  const kw = r?.keywords ?? [];
  if (!summary && !kw.length) return "";
  const paras = summary.split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return section("about", "About", "", `
    ${paras ? `<div class="pp-about__body">${paras}</div>` : ""}
    ${kw.length ? `<p class="pp-about__kw">${esc(kw.join(" · "))}</p>` : ""}`);
}

/** A company or school mark: the logo on white when the bundle has one,
 *  else the name's initial. A logo that fails to load leaves the initial. */
function logoTile(name: string, url: string | null | undefined): string {
  const src = safeImg(url);
  return `<div class="pp-logo${src ? "" : " pp-logo--blank"}" aria-hidden="true"><span class="pp-logo__initial">${esc(initial(name))}</span>${
    src ? pic(src, "pp-logo__img", "drop") : ""}</div>`;
}

/** Highlights past `max` stay behind a button, as before. */
function bulletList(items: string[], max: number): string {
  if (!items.length) return "";
  const li = items.map((t, i) => `<li${i >= max ? " hidden" : ""}>${esc(plainText(t))}</li>`).join("");
  const extra = items.length - max;
  const label = max === 0 ? plural(extra, "highlight") : `${extra} more`;
  return `<ul class="pp-bullets">${li}</ul>${extra > 0 ? btn(label, " data-more", " pp-bullets__more") : ""}`;
}

/** "MSOE AI-Club (MAIC)" and "MSOE AI-Club" are one employer: a trailing
 *  parenthetical is an acronym or a qualifier, not a different company. */
function companyKey(company: string): string {
  return company.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function renderExperience(b: Bundle): string {
  const xs = b.resume?.experience ?? [];
  if (!xs.length) return "";
  // One block per company, in order of its first (newest) role, so a
  // logo is shown once and the roles read as a career there.
  const groups: { names: string[]; logo: string | null; roles: Experience[] }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  xs.forEach((x, i) => {
    const company = plainText(x.company);
    const key = companyKey(company) || `\u0000${i}`;
    let g = byKey.get(key);
    if (!g) { g = { names: [], logo: null, roles: [] }; byKey.set(key, g); groups.push(g); }
    if (company) g.names.push(company);
    g.logo ??= safeImg(x.logoUrl);
    g.roles.push(x);
  });
  const role = (x: Experience) => {
    const period = plainText(x.period);
    const now = x.current && !/present|now|current/i.test(period) ? " – now" : "";
    const desc = x.description ? plainText(x.description) : "";
    const place = plainText(x.location);
    return `
          <li class="pp-role">
            <div class="pp-role__top">
              <span class="pp-role__title">${esc(plainText(x.role))}</span>
              <span class="pp-role__when">${esc(period)}${now}${place ? `<span class="pp-role__where">${esc(place)}</span>` : ""}</span>
            </div>
            ${desc ? `<p class="pp-role__desc">${esc(desc)}</p>` : ""}
            ${bulletList(x.bullets ?? [], desc ? 0 : 2)}
          </li>`;
  };
  const items = groups.map((g) => {
    // The plainest spelling the résumé used: "MSOE AI-Club" over
    // "MSOE AI-Club (MAIC)".
    const name = [...g.names].sort((x, y) => x.length - y.length)[0] ?? "";
    return `
      <div class="pp-co">
        ${logoTile(name || g.roles[0].role, g.logo)}
        <div class="pp-co__body">
          ${name ? `<h3 class="pp-co__name">${esc(name)}</h3>` : ""}
          <ol class="pp-roles">${g.roles.map(role).join("")}</ol>
        </div>
      </div>`;
  }).join("");
  return section("experience", "Experience", String(xs.length), `<div class="pp-list rv-group">${items}</div>`);
}

function renderEducation(b: Bundle): string {
  const xs = b.resume?.education ?? [];
  if (!xs.length) return "";
  const items = xs.map((x) => {
    const school = plainText(x.school);
    const title = [x.degree, x.field].map((s) => plainText(s)).filter(Boolean).join(", ") || school;
    const sub = [title === school ? "" : school, plainText(x.period)].filter(Boolean).join(" · ");
    const hl = (x.highlights ?? []).map((h) => plainText(h)).filter(Boolean);
    return `
      <div class="pp-edu">
        ${logoTile(school, x.logoUrl)}
        <div class="pp-edu__body">
          <h3 class="pp-edu__title">${esc(title)}</h3>
          ${sub ? `<div class="pp-edu__sub">${esc(sub)}</div>` : ""}
          ${hl.length ? `<p class="pp-edu__hl">${esc(hl[0])}</p>${hl.length > 1 ? bulletList(hl.slice(1), 0) : ""}` : ""}
        </div>
      </div>`;
  }).join("");
  return section("education", "Education", String(xs.length), `<div class="pp-list rv-group">${items}</div>`);
}

/* ── events: where the points came from ─────────────────────────── */

/** The rows Events prints: check-ins as cards, and the carried-forward
 *  balance, which is real points even though no event is behind it.
 *  Lessons are Learning's and badge lines are Badges'. */
function eventRows(b: Bundle) {
  const entries = b.record?.entries ?? [];
  return {
    checkins: entries.filter((e) => e.kind === "checkin"),
    carried: entries.filter((e) => e.kind === "starting" && (e.points ?? 0) > 0),
  };
}

/** Cards shown before "Show all". */
const EVENT_CAP = 8;

function renderEvents(b: Bundle): string {
  const { checkins, carried } = eventRows(b);
  if (!checkins.length && !carried.length) return "";
  const thisYear = new Date().getFullYear();
  const multi = b.chapterCount > 1;

  const card = (e: Entry) => {
    const photo = safeImg(e.eventImageUrl);
    const [y, m, d] = ymd(e.date);
    // The date tile is painted under the photo too, so a photo that fails
    // to load leaves a dated card rather than an empty frame.
    const tile = `<div class="pp-ev__tile"><b>${d}</b><span>${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ""}</span></div>`;
    const sub = [e.phase ? esc(e.phase) : "", e.chapterName ? esc(e.chapterName) : ""].filter(Boolean).join(" · ");
    const pts = e.points && e.points > 0 ? `<span class="pp-ev__pts">+${e.points.toLocaleString()}</span>` : "";
    return `
      <article class="pp-ev${photo ? " pp-ev--photo" : ""}">
        <div class="pp-ev__media" aria-hidden="true">${tile}${photo ? pic(photo, "pp-ev__img", "drop") : ""}</div>
        <div class="pp-ev__body">
          <span class="pp-ev__date${photo ? "" : " pp-sr"}">${formatLong(e.date)}</span>
          <h3 class="pp-ev__title">${esc(e.title)}</h3>
          ${sub || pts ? `<span class="pp-ev__sub">${sub}${sub && pts ? `<span aria-hidden="true"> · </span>` : ""}${pts}</span>` : ""}
        </div>
      </article>`;
  };
  // The balance the record started from, kept visible because the
  // points total includes it: a total the cards cannot add up to would
  // read as a mistake.
  const carriedRow = (e: Entry) => `
      <div class="pp-carried">
        <span class="pp-carried__what"><span class="pp-carried__title">Carried forward</span><span class="pp-carried__sub">${[
          "Points from before events were tracked", multi && e.chapterName ? esc(e.chapterName) : "",
        ].filter(Boolean).join(" · ")}</span></span>
        <span class="pp-carried__pts">+${(e.points ?? 0).toLocaleString()}</span>
      </div>`;

  const t = b.record?.totals;
  const count = [
    t && t.events >= 1 && checkins.length ? `${landing("events", t.events)} ${t.events === 1 ? "event" : "events"}` : "",
    t && t.points >= 1 ? `${landing("points", t.points)} ${t.points === 1 ? "point" : "points"}` : "",
  ].filter(Boolean).join(`<span class="pp-section__sep" aria-hidden="true">·</span>`);

  // Events with a photo lead, newest first, then the dated tiles. A photo
  // card is two columns wide, so in date order it would fall to a new row
  // behind three tiles and leave a hole in the row above; first, it opens
  // the grid the way the feature opens Projects. Each card carries its
  // own date, so nothing reads out of order.
  const ordered = [
    ...checkins.filter((e) => safeImg(e.eventImageUrl)),
    ...checkins.filter((e) => !safeImg(e.eventImageUrl)),
  ];
  const grid = ordered.length
    ? `<div class="pp-events rv-group">${ordered.slice(0, EVENT_CAP).map(card).join("")}</div>${restOf(
      ordered.length > EVENT_CAP ? `<div class="pp-events">${ordered.slice(EVENT_CAP).map(card).join("")}</div>` : "",
      `Show all ${plural(ordered.length, "event")}`,
    )}`
    : "";
  return section("events", checkins.length ? "Events" : "Points", count,
    grid + (carried.length ? `<div class="pp-carried-list rv">${carried.map(carriedRow).join("")}</div>` : ""));
}

/* ── badges ─────────────────────────────────────────────────────── */

/** A badge's own artwork at full size: the uploaded image, the drawn mark
 *  for a built-in icon name, an emoji the officer typed, or the name's
 *  initial when the badge has none of those. */
function badgeArt(bd: Badge): string {
  const key = bd.icon?.trim() ?? "";
  const first = `<span class="pp-badge__initial">${esc(initial(bd.name))}</span>`;
  const img = safeImg(key) ?? (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(key) ? key : null);
  if (img) return `<div class="pp-badge__art">${first}${pic(img, "pp-badge__img", "drop")}</div>`;
  const glyph = key ? badgeGlyph(key) : null;
  if (glyph) return `<div class="pp-badge__art pp-badge__art--glyph">${glyph}</div>`;
  if (/\p{Extended_Pictographic}/u.test(key)) return `<div class="pp-badge__art pp-badge__art--emoji">${esc(key)}</div>`;
  return `<div class="pp-badge__art pp-badge__art--blank">${first}</div>`;
}

/** All of them up to here; past it, Show all. */
const BADGE_CAP = 24;

function renderBadges(b: Bundle): string {
  const badges = b.badges ?? [];
  if (!badges.length) return "";
  const item = (bd: Badge) => {
    const desc = (bd.description ?? "").trim();
    const when = [`Awarded ${formatLong(bd.awardedAt)}`, b.chapterCount > 1 ? bd.chapterName : null].filter(Boolean).join(" · ");
    return `
      <div class="pp-badge" title="${attr(when)}">
        ${badgeArt(bd)}
        <span class="pp-badge__name">${esc(bd.name)}</span>
        ${desc ? `<span class="pp-badge__desc">${esc(desc)}</span>` : ""}
      </div>`;
  };
  return section(
    "badges", "Badges", landing("badges", badges.length),
    `<div class="pp-badges rv-group">${badges.slice(0, BADGE_CAP).map(item).join("")}</div>${restOf(
      badges.length > BADGE_CAP ? `<div class="pp-badges">${badges.slice(BADGE_CAP).map(item).join("")}</div>` : "",
      `Show all ${plural(badges.length, "badge")}`,
    )}`,
  );
}

/* ── learning ───────────────────────────────────────────────────── */

function renderLearning(b: Bundle): string {
  const bands = b.learning?.bands ?? [];
  if (!bands.length) return "";
  const done = bands.reduce((s, x) => s + x.done, 0);
  const band = (x: typeof bands[number]) => {
    // One segment per lesson up to twelve, a bar past that. The fill
    // runs left to right once, when the band comes into view.
    const meter = x.count <= 12
      ? `<div class="pp-band__meter" aria-hidden="true">${Array.from({ length: x.count }, (_, i) => `<i${i < x.done ? ` class="done" style="--k:${i}"` : ""}></i>`).join("")}</div>`
      : `<div class="pp-band__bar" aria-hidden="true"><i style="--w:${((x.done / x.count) * 100).toFixed(1)}%"></i></div>`;
    const lessons = x.lessons.map((l) => `
        <div class="pp-lesson"><span class="pp-lesson__date">${MONTHS[ymd(l.completedAt)[1] - 1]} ${ymd(l.completedAt)[2]}</span><span class="pp-lesson__title">${esc(l.title)}</span></div>`).join("");
    return `
      <div class="pp-band rv">
        <div class="pp-band__head"><span class="pp-band__title">${esc(x.title)}</span><span class="pp-band__count">${x.done} of ${x.count}</span></div>
        ${meter}${lessons}
      </div>`;
  };
  return section("learn", "Learning", plural(done, "lesson"), `<div class="pp-bands">${bands.map(band).join("")}</div>`);
}

/** The one ALL call-out: the mark and two doors, no sentence. */
function footerBand(): string {
  return `
  <aside class="pp-footer rv">
    <img src="./portfolio/all-logo.png" alt="ALL Applied AI Network" width="30" height="30">
    <a href="https://all-ai-network.org/impact.html#chapters"${ext}>Join a chapter</a>
    <a href="https://sponsors.all-ai-network.org"${ext}>Sponsor the network</a>
  </aside>`;
}

/** The work first (what they made, what they said about it), then the
 *  career, then the record the chapter keeps, then the schools. */
function renderPage(b: Bundle): string {
  return renderHeader(b) + renderProjects(b) + renderPosts(b) + renderAbout(b) + renderExperience(b) +
    renderEvents(b) + renderBadges(b) + renderEducation(b) + renderLearning(b) + renderCode(b) + footerBand();
}

/* ── shells ──────────────────────────────────────────────────────── */

function showShell(inner: string, withFooter = true) {
  const el = $("#pp-shell")!;
  el.className = "pp-shell";
  el.innerHTML = inner + (withFooter ? footerBand() : "");
  el.hidden = false;
  $("#pp")!.hidden = true;
  for (const r of $$(".rv", el)) r.classList.add("in");
}
const privateShell = () => showShell(
  `<p class="pp-shell__msg">This page is private or hasn't been published yet.</p>
   <a class="pp-shell__link" href="https://all-ai-network.org/">ALL Applied AI Network</a>`);
const errorShell = () => {
  showShell(`<p class="pp-shell__msg">This page couldn't load.</p>${btn("Reload", " data-reload")}`);
  $("[data-reload]")?.addEventListener("click", () => location.reload());
};

/* ── pictures: failures and fit ─────────────────────────────────── */

/** One capturing listener for every picture on the page (error events do
 *  not bubble), attached before the markup so no failure is missed. */
function onImageError(e: Event) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.fail) return;
  if (img.dataset.fail === "frame") {
    const card = img.closest<HTMLElement>("[data-card]");
    img.closest("[data-frame]")?.remove();
    card?.classList.add("is-noimg");
  } else {
    img.closest(".pp-logo")?.classList.add("pp-logo--blank");
    img.remove();
  }
}

/**
 * A project cover is either a picture (crop it to the frame) or a mark on
 * a flat ground — a logo on near-white, a diagram on black — where a crop
 * cuts the mark off: the first draft lost the top and bottom of the
 * NourishNet logo. So look at the image's edge. If it is one flat colour,
 * contain the image and paint the frame that colour, and the frame reads
 * as the image's own ground. Anything else keeps the crop.
 *
 * The look needs pixels, so a second, CORS-mode copy is decoded for it
 * (our storage answers with Access-Control-Allow-Origin: *). If that is
 * ever refused, the canvas is tainted and the cover simply stays cropped.
 *
 * Resolves once every probe has answered, which only a capture waits for.
 */
function fitCovers(root: ParentNode): Promise<void> {
  return Promise.all($$<HTMLImageElement>("img[data-fit]", root).map((img) => new Promise<void>((done) => {
    const frame = img.parentElement;
    if (!frame) return done();
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.referrerPolicy = "no-referrer";
    probe.onload = () => {
      const ground = flatEdge(probe);
      if (ground) {
        frame.style.backgroundColor = ground;
        frame.classList.add("is-contain");
      }
      done();
    };
    probe.onerror = () => done();
    probe.src = img.getAttribute("src") ?? "";
  }))).then(() => {});
}

/** Every picture on the page loaded and decoded (or failed), for a ?seek=
 *  capture, which must show each photo rather than the frame it sits in.
 *  Capped, so one slow image cannot hold the page hidden. */
function picturesReady(root: ParentNode): Promise<unknown> {
  const all = $$<HTMLImageElement>("img", root).map((im) => im.decode().catch(() => {}));
  return Promise.race([Promise.all(all), sleep(4000)]);
}

function flatEdge(im: HTMLImageElement): string | null {
  const N = 24;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  let d: Uint8ClampedArray;
  try {
    g.drawImage(im, 0, 0, N, N);
    d = g.getImageData(0, 0, N, N).data;
  } catch {
    return null;
  }
  const edge: number[][] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x && y && x < N - 1 && y < N - 1) continue;
      const i = (y * N + x) * 4;
      edge.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
    }
  }
  // A transparent ground (a logo cut out of its background): paint the
  // frame white under a dark mark and the raised surface under a light one.
  if (edge.filter((p) => p[3] < 32).length > edge.length * 0.6) {
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++;
    }
    return n && sum / n < 140 ? "#ffffff" : "#1a1a1f";
  }
  const mean = [0, 1, 2].map((k) => edge.reduce((s, p) => s + p[k], 0) / edge.length);
  const near = edge.filter((p) => p[3] > 200 && [0, 1, 2].every((k) => Math.abs(p[k] - mean[k]) <= 14)).length;
  return near >= edge.length * 0.92
    ? `rgb(${mean.map((v) => Math.round(v)).join(", ")})`
    : null;
}

/* ── the arrival: one seekable rAF timeline ─────────────────────── */

/** CSS cubic-bezier(x1,y1,x2,y2) as a function of progress, so the JS
 *  timeline uses the same house curves as the CSS transitions. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;
  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (s < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}
/** Entrances. */
const ENTER = bezier(0.16, 1, 0.3, 1);
/** Moves. */
const MOVE = bezier(0.2, 0.8, 0.2, 1);

/** Show every section at once, settled, with no transition running —
 *  the state a ?seek= past the end freezes, and the one a capture needs. */
function settleAll(root: ParentNode) {
  document.documentElement.classList.add("pp-still");
  for (const el of $$(".rv, .rv-group, .pp-section__head", root)) el.classList.add("in");
}

/**
 * The arrival, in beats that never overlap in one place:
 *
 *   0–480     the cover fades up, settling from a 3% overscale
 *   120–580   the portrait opens out of its centre, over the cover's edge
 *   260–1000  the chapter's ring draws around it, clockwise from the top
 *   300–740   the name rises out of its own baseline, a word at a time
 *   540–840   the headline and the chapter line
 *   600–…     the link chips, 40 ms apart
 *   720–…     the numbers' strip, and the numbers 40 ms apart
 *
 * `reveal` runs as the numbers land, so the sections standing in the
 * first screen come in under a header that is already there, never
 * beside one that is still arriving.
 *
 * ?seek=ms renders exactly one frame of this and stops; a seek at or
 * past the end is the finished page, every section shown.
 */
function mountArrival(seek: number | null, reveal: () => void, settle: () => void) {
  const cover = $("#pp-cover");
  const coverImg = $(".pp-cover__img");
  const photo = $("#pp-photo");
  const ring = $<SVGCircleElement>(".pp-photo__ring circle");
  const words = $$(".pp-w > span");
  const late = $$(".pp-late");
  const chips = $$("#pp-chips > *");
  const strip = $("#pp-doors");
  const doors = $$("#pp-doors > *");
  const DOOR0 = 720;
  const END = Math.max(1000, DOOR0 + Math.max(0, doors.length - 1) * 40 + 380, 600 + Math.max(0, chips.length - 1) * 40 + 320);
  const T = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  let revealed = false;

  const frame = (t: number) => {
    let p = ENTER(T(t, 0, 480));
    if (cover) cover.style.opacity = p < 1 ? String(p) : "";
    if (coverImg) coverImg.style.transform = p < 1 ? `scale(${(1.03 - 0.03 * p).toFixed(4)})` : "";
    if (photo) {
      p = ENTER(T(t, 120, 580));
      photo.style.clipPath = p < 1 ? `circle(${(50 * p).toFixed(2)}% at 50% 50%)` : "";
      photo.style.transform = p < 1 ? `scale(${(0.9 + 0.1 * p).toFixed(4)})` : "";
    }
    ring?.style.setProperty("stroke-dashoffset", String(RING * (1 - MOVE(T(t, 260, 1000)))));
    words.forEach((w, i) => {
      p = ENTER(T(t, 300 + i * 40, 300 + i * 40 + 440));
      w.style.transform = p < 1 ? `translateY(${(105 * (1 - p)).toFixed(2)}%)` : "";
    });
    p = ENTER(T(t, 540, 840));
    for (const el of late) {
      el.style.opacity = String(p);
      el.style.transform = p < 1 ? `translateY(${(8 * (1 - p)).toFixed(2)}px)` : "";
    }
    chips.forEach((c, i) => {
      p = ENTER(T(t, 600 + i * 40, 600 + i * 40 + 320));
      c.style.opacity = String(p);
      c.style.transform = p < 1 ? `translateY(${(6 * (1 - p)).toFixed(2)}px)` : "";
    });
    // The strip is one bordered box, so it comes in with its first
    // number rather than standing empty while the numbers wait.
    if (strip) strip.style.opacity = String(ENTER(T(t, DOOR0, DOOR0 + 380)));
    doors.forEach((d, i) => {
      p = ENTER(T(t, DOOR0 + i * 40, DOOR0 + i * 40 + 380));
      d.style.opacity = String(p);
      d.style.transform = p < 1 ? `translateY(${(12 * (1 - p)).toFixed(2)}px)` : "";
    });
    if (t >= DOOR0 + 120 && !revealed) { revealed = true; reveal(); }
  };
  const clear = () => {
    for (const el of [cover, coverImg, photo, ...words, ...late, ...chips, strip, ...doors]) {
      if (!el) continue;
      el.style.opacity = ""; el.style.transform = ""; el.style.clipPath = "";
    }
    ring?.style.removeProperty("stroke-dashoffset");
  };

  document.documentElement.classList.add("pp-arrive");
  if (seek !== null) {
    if (seek >= END) { frame(END); clear(); settle(); return; }
    frame(Math.max(0, seek));
    return;
  }
  frame(0);
  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    if (t >= END) { frame(END); clear(); if (!revealed) reveal(); return; }
    frame(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── doors: the number travels to the rows it counts ────────────── */

let flight: { cancel: () => void } | null = null;

/**
 * Click a number, and the page moves to the section it counts while the
 * number itself flies there and becomes that section's count: 12 events
 * in the header lands as the 12 in "Events · 12 events". One rAF loop
 * drives the scroll and the flight together for ~0.5 s and then stops.
 * A wheel or a touch during it hands the page straight back.
 */
function flyDoor(door: HTMLElement) {
  flight?.cancel();
  const key = door.dataset.door ?? "";
  const to = door.dataset.to ?? "";
  const sectionEl = document.getElementById(`pp-${to}`);
  const heading = document.getElementById(`pp-${to}-h`);
  if (!sectionEl || !heading) return;
  const target = sectionEl.querySelector<HTMLElement>(`[data-land="${key}"]`);
  const num = door.querySelector<HTMLElement>(".pp-door__n");

  // The section is about to be read: show it now rather than on reveal.
  // Its rise (.rv, 14px) is cut short and only the fade kept: the scroll
  // and the number are both aimed from the measurements below, and a
  // section still on its way up would be measured 14px low, so the
  // number would land under its count and then the count would jump.
  // Coming from below the fold, the rise was never going to be seen.
  if (!reduced && getComputedStyle(sectionEl).transform !== "none") {
    sectionEl.style.transition = "opacity 0.5s var(--enter)";
    const settle = (e: TransitionEvent) => {
      if (e.target !== sectionEl) return;
      sectionEl.style.removeProperty("transition");
      sectionEl.removeEventListener("transitionend", settle);
    };
    sectionEl.addEventListener("transitionend", settle);
  }
  sectionEl.classList.add("in");
  for (const el of $$(".rv, .rv-group", sectionEl)) el.classList.add("in");
  $(".pp-section__head", sectionEl)?.classList.add("in");
  void sectionEl.offsetWidth;

  const startY = window.scrollY;
  const offset = 76;
  const maxY = document.documentElement.scrollHeight - innerHeight;
  const endY = Math.max(0, Math.min(maxY, startY + sectionEl.getBoundingClientRect().top - offset));

  const land = () => {
    heading.focus({ preventScroll: true });
    if (target) {
      target.classList.remove("is-landed");
      void target.offsetWidth;
      target.classList.add("is-landed");
    }
  };

  if (reduced || Math.abs(endY - startY) < 2) {
    window.scrollTo(0, endY);
    land();
    return;
  }

  // The ghost: a copy of the door's number, fixed to the viewport,
  // travelling from where it is to where the count will be once the
  // scroll has finished.
  let ghost: HTMLElement | null = null;
  let from: DOMRect | null = null;
  let toRect: { left: number; top: number; fs: number } | null = null;
  if (num && target) {
    from = num.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    toRect = { left: tr.left, top: tr.top - (endY - startY), fs: parseFloat(getComputedStyle(target).fontSize) };
    ghost = document.createElement("span");
    ghost.className = "pp-ghost";
    ghost.textContent = num.textContent;
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.fontSize = getComputedStyle(num).fontSize;
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    document.body.appendChild(ghost);
    target.classList.add("is-awaiting");
    num.classList.add("is-away");
  }
  const fs0 = num ? parseFloat(getComputedStyle(num).fontSize) : 0;
  const D = Math.round(Math.min(640, Math.max(380, Math.abs(endY - startY) * 0.4)));
  const start = performance.now();
  let raf = 0;
  let done = false;

  const finish = (landed: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    ghost?.remove();
    target?.classList.remove("is-awaiting");
    num?.classList.remove("is-away");
    removeEventListener("wheel", interrupt);
    removeEventListener("touchstart", interrupt);
    removeEventListener("keydown", interrupt);
    flight = null;
    if (landed) land();
  };
  const interrupt = () => finish(false);
  addEventListener("wheel", interrupt, { passive: true });
  addEventListener("touchstart", interrupt, { passive: true });
  addEventListener("keydown", interrupt);
  flight = { cancel: () => finish(false) };

  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / D);
    const e = MOVE(k);
    window.scrollTo(0, startY + (endY - startY) * e);
    if (ghost && from && toRect) {
      // The number arcs slightly (it leaves a little faster than it
      // falls) so it reads as travelling, not as sliding on a rail.
      const ex = ENTER(k);
      const x = from.left + (toRect.left - from.left) * ex;
      const y = from.top + (toRect.top - from.top) * e;
      const fs = fs0 + (toRect.fs - fs0) * e;
      ghost.style.transform = `translate(${(x - from.left).toFixed(1)}px, ${(y - from.top).toFixed(1)}px)`;
      ghost.style.fontSize = `${fs.toFixed(2)}px`;
    }
    if (k >= 1) { finish(true); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/* ── every visit: reveal, topbar, buttons ───────────────────────── */

let revealer: IntersectionObserver | null = null;
function observeReveals(root: ParentNode) {
  if (!revealer) {
    revealer = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        revealer!.unobserve(e.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
  }
  for (const el of $$(".rv, .rv-group, .pp-section__head", root)) revealer.observe(el);
}

function mountTopbar(b: Bundle) {
  const bar = $("#pp-topbar")!;
  const photo = safeImg(b.imageUrl);
  bar.innerHTML = `
    <span class="pp-topbar__who">
      <span class="pp-topbar__av" aria-hidden="true"><span>${esc(initials(b.name))}</span>${photo ? pic(photo, "", "drop") : ""}</span>
      <span class="pp-topbar__name">${esc(b.name)}</span>
    </span>${btn("Copy link", " data-copy")}`;
  bar.hidden = false;
  new IntersectionObserver(([e]) => {
    bar.classList.toggle("is-on", !e.isIntersecting && e.boundingClientRect.bottom < 0);
  }, { threshold: 0 }).observe($("#pp-photo") ?? $("#pp-head")!);
}

function mountButtons(bundle: Bundle) {
  const url = pageUrl(bundle);
  for (const b of $$<HTMLButtonElement>("[data-copy]")) {
    b.addEventListener("click", async () => {
      // A phone hands the link to its own share sheet; the label stays.
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        navigator.share({ title: document.title, url }).catch(() => {});
        return;
      }
      try { await navigator.clipboard.writeText(url); } catch { return; }
      const label = $(".pp-chip__label", b) ?? $("span", b)!;
      const was = label.textContent ?? "";
      // Hold the width, so "Copied" does not pull the chips beside it.
      b.style.minWidth = `${b.offsetWidth}px`;
      const swap = (text: string) => {
        if (reduced) { label.textContent = text; return; }
        b.classList.add("is-swap");
        setTimeout(() => { label.textContent = text; b.classList.remove("is-swap"); }, 120);
      };
      swap("Copied");
      setTimeout(() => swap(was), 1600);
    });
  }
  for (const b of $$("[data-more]")) {
    b.addEventListener("click", () => {
      for (const li of $$("li[hidden]", b.previousElementSibling!)) li.hidden = false;
      b.remove();
    });
  }
  for (const b of $$("[data-show-all]")) {
    b.addEventListener("click", () => {
      const rest = $(".pp-rest", b.closest(".pp-section")!)!;
      rest.hidden = false;
      // Next frame, so the cards transition from their hidden state.
      requestAnimationFrame(() => rest.classList.add("in"));
      b.parentElement!.remove();
    });
  }
  for (const d of $$<HTMLButtonElement>("[data-door]")) {
    d.addEventListener("click", () => flyDoor(d));
  }
}

/** Shrink the name until it fits on two lines; never nowrap, never <br>. */
function fitName() {
  const el = $("#pp-name");
  if (!el) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.offsetHeight > size * 1.08 * 2 + 4 && size > 18) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

/* ── boot ────────────────────────────────────────────────────────── */

async function load(): Promise<{ status: number; bundle: Bundle | null } | null> {
  // Fixtures exist for local verification only: never on the live hosts.
  const local = import.meta.env.DEV || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const fixture = local ? params.get("fixture") : null;
  fixtureMode = !!fixture;
  const slug = fixture ? null
    : (isDashboardPreview(params) ? params.get("slug") : null) ?? hostnameSlug(HUB_DOMAIN);
  if (!fixture && !slug) return { status: 404, bundle: null };
  const url = fixture
    ? `./fixtures/portfolio/${encodeURIComponent(fixture)}.json`
    : `${DASHBOARD_ORIGIN}/api/public/member/${encodeURIComponent(slug!)}`;
  try {
    const res = await fetch(url, { cache: "default", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { status: res.status, bundle: null };
    return { status: 200, bundle: (await res.json()) as Bundle };
  } catch {
    return null;
  }
}

async function init() {
  const main = $("#pp")!;
  document.addEventListener("error", onImageError, true);

  // Flat ground while fetching; a skeleton would flash under a header
  // that arrives whole. Only a slow fetch says anything at all.
  const slow = setTimeout(() => {
    const el = $("#pp-shell")!;
    el.className = "pp-loading"; el.textContent = "Loading…"; el.hidden = false;
  }, 1200);
  const result = await load();
  clearTimeout(slow);
  $("#pp-shell")!.hidden = true;

  if (!result) return errorShell();
  if (!result.bundle) return result.status === 404 || result.status === 403 || result.status === 410
    ? privateShell() : errorShell();
  const b = result.bundle;

  const c = chapterColors(b.chapter?.primaryColor, b.chapter?.accentColor);
  // No readable second colour: its slots wear the primary.
  const second = c.second ?? { color: c.primary.accent, rgb: c.primary.accentRgb, text: c.primaryTint };
  const root = document.documentElement.style;
  root.setProperty("--pp-accent", c.primary.accent);
  root.setProperty("--pp-accent-rgb", c.primary.accentRgb);
  root.setProperty("--pp-accent-text", c.primary.accentText);
  root.setProperty("--pp-accent-tint-text", c.primaryTint);
  root.setProperty("--pp-ink-text", c.primary.inkText);
  root.setProperty("--pp-second", second.color);
  root.setProperty("--pp-second-rgb", second.rgb);
  root.setProperty("--pp-second-text", second.text);
  document.title = `${b.name} — ${b.chapter?.name ?? "Portfolio"}`;
  $<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    "content", b.headline ?? (b.chapter ? `Member of ${b.chapter.name}` : "Member of the ALL Applied AI Network"));

  main.innerHTML = renderPage(b);
  // Laid out but unseen: measure-then-move happens before first paint so
  // the name never resizes in view.
  main.style.visibility = "hidden";
  main.hidden = false;
  await Promise.race([document.fonts.ready, sleep(800)]);
  fitName();
  const fitted = fitCovers(main);
  // A capture shows nothing until its pictures are decoded and each cover
  // has its fit: the frame it freezes is the page with every photo in it.
  if (EAGER) await Promise.race([Promise.all([fitted, picturesReady(main)]), sleep(4000)]);

  const seekRaw = params.get("seek");
  const seek = seekRaw !== null && seekRaw !== "" ? Number(seekRaw) : null;
  const rest = reduced || isDashboardPreview(params);
  if (rest) {
    if (seek !== null) settleAll(main);
    else observeReveals(main);
  } else {
    mountArrival(Number.isFinite(seek) ? seek : null, () => observeReveals(main), () => settleAll(main));
  }
  main.style.visibility = "";

  mountTopbar(b);
  mountButtons(b);
}

init();
