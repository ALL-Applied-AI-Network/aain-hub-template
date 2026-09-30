/* Member profile — https://{slug}.all-ai-network.org

   One keyless fetch of the member bundle, then the whole page is rendered
   once from string templates. It reads like the person panel officers
   open on the dashboard, because it is the same person: who they are and
   where to find them, three or four numbers that are doors to the rows
   they count, then the record those numbers came from — the timeline of
   events and points, the badges, the projects — and the résumé under it.

   Rules the page keeps:
   - Only what /api/public/member/{slug} sends. A section with no data is
     absent, never empty, and no number is ever printed as zero.
   - One accent, the chapter's colour (deriveAccent makes it readable).
   - Never: an accent disc or bullet before text, a "Now · member of …"
     line, an ID strip, eyebrows in mono capitals, a colophon, a hover
     lift, a logo inside a seal.
   - Motion settles. The arrival is one seekable timeline (?seek=ms
     freezes it at that frame); after it, nothing runs until a visitor
     does something, and then only for as long as that takes. */

document.documentElement.classList.add("js-rv");

import { escapeHtml as esc, escapeAttr as attr } from "./lib/html";
import { hostnameSlug, isDashboardPreview } from "./lib/slug";
import { BUILT_IN_ICONS, renderBadgeIcon } from "./badge-icon";
import { deriveAccent } from "./accent";
import { plainText } from "./plain-text";
import { GITHUB_MARK } from "./lib/platform-icons";

declare const __HUB_CONFIG__: { hub_domain?: string };

const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";
const HUB_DOMAIN = (__HUB_CONFIG__.hub_domain ?? "all-ai-network.org").toLowerCase();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── the bundle (mirrors network-api/src/lib/portfolio/compose.ts) ── */

type Entry = {
  id: string;
  kind: "checkin" | "badge" | "lesson" | "starting";
  date: string;
  title: string;
  chapterName: string | null;
  hubUrl: string | null;
  points: number | null;
  phase: string | null;
};
type Project = {
  id: string;
  kind: "build" | "chapterProject" | "repo";
  title: string;
  description: string | null;
  url: string | null;
  chapterName: string | null;
  status: "recruiting" | "building" | "shipped" | null;
  language: string | null;
  stars: number | null;
  date: string;
};
type Experience = {
  role: string; company: string; period: string; location: string | null;
  description: string | null; bullets: string[]; current: boolean;
};
type Education = {
  school: string; degree: string; field: string | null; period: string; highlights: string[];
};
type Badge = {
  id: string;
  name: string;
  icon: string | null;
  awardedAt: string;
  chapterName: string | null;
  /** Not in today's bundle. Printed when a later composer sends it. */
  description?: string | null;
};
type Bundle = {
  slug: string | null;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  chapter: {
    name: string; hubUrl: string | null; logoUrl: string | null;
    primaryColor: string | null; acronym: string | null; verifyStudentId: string | null;
  } | null;
  chapterCount: number;
  since: string;
  /** Read by nothing on this page any more: the present-tense line it
   *  fed repeated the first row of the record directly under it. */
  now?: unknown;
  record?: {
    entries: Entry[];
    totals: { points: number; events: number };
    /** Points carried in from before events were tracked. */
    startingBalance?: number;
  };
  badges?: Badge[];
  learning?: { bands: { id: string; title: string; done: number; count: number; lessons: { id: string; title: string; completedAt: string }[] }[] };
  projects?: Project[];
  resume?: {
    tagline: string | null; keywords: string[];
    overview: { summary: string; location: string | null } | null;
    experience: Experience[]; education: Education[];
  };
  github?: { username: string; topLanguages: string[] };
  updatedAt: string;
};

/* ── helpers ─────────────────────────────────────────────────────── */

/** Year/month/day from the ISO date part only, so the day matches the
 *  /p/ sheet and the preview regardless of the viewer's zone. */
function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}
function formatDay(iso: string): string {
  const [, m, d] = ymd(iso);
  return `${MONTHS[m - 1]} ${d}`;
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
function safeHttp(raw: string | null | undefined): string | null {
  try {
    const u = new URL((raw ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── templates ───────────────────────────────────────────────────── */

const ext = ' target="_blank" rel="noopener"';
const btn = (label: string, extra = "", cls = "") =>
  `<button type="button" class="pp-btn${cls}"${extra}><span>${label}</span></button>`;

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>`;

/** Rows past a section's cap: hidden until Show all, then revealed. */
const restOf = (html: string, label: string) => html
  ? `<div class="pp-rest" hidden>${html}</div><div class="pp-more">${btn(label, " data-show-all")}</div>` : "";

/**
 * A section: its name, the count (a number the doors can land on), and a
 * hairline that draws once as the section comes into view.
 *
 * `count` is markup, already escaped, because the Record's count is two
 * numbers a door can each land on.
 */
const section = (key: string, title: string, count: string, body: string) => `
  <section class="pp-section pp-${key} rv" id="pp-${key}" aria-labelledby="pp-${key}-h">
    <div class="pp-section__head">
      <h2 class="pp-section__title" id="pp-${key}-h" tabindex="-1">${title}${count ? `<span class="pp-section__count">${count}</span>` : ""}</h2><span class="pp-section__rule"></span>
    </div>${body}
  </section>`;

/** The number a door lands on, inside a section's count. */
const landing = (key: string, n: number) => `<b data-land="${key}">${n.toLocaleString()}</b>`;

/* The ring draws once around the portrait on arrival, in the chapter's
   colour, and stays. 2πr with r = 48.5 in a 100-unit box. */
const RING = 304.7;

function renderPortrait(b: Bundle): string {
  const mono = `<span class="pp-photo__mono" aria-hidden="true">${esc(initials(b.name))}</span>`;
  const photo = safeHttp(b.imageUrl);
  // A portrait that fails to load becomes the monogram, never a broken
  // image in a ring.
  const img = photo
    ? `<img class="pp-photo__img" src="${attr(photo)}" alt="" width="96" height="96" referrerpolicy="no-referrer" onerror="this.remove()">`
    : "";
  return `
    <div class="pp-photo" id="pp-photo">
      ${mono}${img}
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
  const meta = [
    chapterName ? `<span>${chapterName}${more ? ` ${more}` : ""}</span>` : "",
    `<span>Member since ${formatMonth(b.since)}</span>`,
  ].filter(Boolean).join(`<span class="pp-meta__sep" aria-hidden="true">·</span>`);

  // Where to find them: this page's own address (a click copies it),
  // their GitHub, and the chapter's own record of them.
  const host = b.slug ? `${b.slug}.${HUB_DOMAIN}` : location.host;
  const verify = ch?.verifyStudentId
    ? `${DASHBOARD_ORIGIN}/verify/${encodeURIComponent(ch.verifyStudentId)}` : null;
  const chips = [
    `<button type="button" class="pp-chip" data-copy aria-label="Copy the link to this page">${LINK_ICON}<span class="pp-chip__label">${esc(host)}</span></button>`,
    b.github
      ? `<a class="pp-chip" href="https://github.com/${attr(b.github.username)}"${ext}>${GITHUB_MARK}<span class="pp-chip__label">${esc(b.github.username)}</span></a>`
      : "",
    verify ? `<a class="pp-chip" href="${attr(verify)}"${ext}><span class="pp-chip__label">Verify record</span>${OUT_ICON}</a>` : "",
  ].filter(Boolean).join("");

  return `
  <header class="pp-head" id="pp-head">
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
 * points open the Record, badges the Badges, projects the Projects. A
 * number that would be zero is not a door to anything, so it is not here.
 */
function renderDoors(b: Bundle): string {
  const doors: { key: string; n: number; label: string; to: string }[] = [];
  const t = b.record?.totals;
  const hasRecord = recordEntries(b).length > 0;
  if (t && t.events >= 1 && hasRecord) doors.push({ key: "events", n: t.events, label: t.events === 1 ? "event" : "events", to: "record" });
  if (t && t.points >= 1 && hasRecord) doors.push({ key: "points", n: t.points, label: t.points === 1 ? "point" : "points", to: "record" });
  const nb = (b.badges ?? []).length;
  if (nb) doors.push({ key: "badges", n: nb, label: nb === 1 ? "badge" : "badges", to: "badges" });
  const np = (b.projects ?? []).length;
  if (np) doors.push({ key: "projects", n: np, label: np === 1 ? "project" : "projects", to: "projects" });
  if (!doors.length) return "";
  const SECTION = { record: "Record", badges: "Badges", projects: "Projects" } as Record<string, string>;
  return `<div class="pp-doors" id="pp-doors" style="--n:${doors.length}">${doors
    .map(
      (d) => `<button type="button" class="pp-door" data-door="${d.key}" data-to="${d.to}" aria-label="${attr(`${d.n.toLocaleString()} ${d.label}, go to ${SECTION[d.to]}`)}"><b class="pp-door__n">${d.n.toLocaleString()}</b><span class="pp-door__l">${d.label}</span></button>`,
    )
    .join("")}</div>`;
}

/* ── the record: where the points came from ─────────────────────── */

/** The rows of the record this page prints. Badge lines are left to the
 *  Badges section when it is present, so the same award is not read
 *  twice one screen apart. */
function recordEntries(b: Bundle): Entry[] {
  const hasBadgeTiles = (b.badges ?? []).length > 0;
  return (b.record?.entries ?? []).filter((e) => !(hasBadgeTiles && e.kind === "badge"));
}

/** Rows shown before "Show all". */
const RECORD_ROWS = 10;

function renderRecord(b: Bundle): string {
  const entries = recordEntries(b);
  if (!entries.length) return "";
  const multi = b.chapterCount > 1;
  const dated = entries.filter((e) => e.kind !== "starting");
  const carried = entries.filter((e) => e.kind === "starting");

  const row = (e: Entry) => {
    const title = e.kind === "starting" ? "Carried forward" : esc(e.title);
    const what = e.kind === "starting"
      ? "Points from before events were tracked"
      : e.kind === "lesson"
        ? "Lesson completed"
        : e.kind === "badge"
          ? "Badge awarded"
          : "Checked in";
    const sub = [what, e.phase ? esc(e.phase) : "", multi && e.chapterName ? esc(e.chapterName) : ""]
      .filter(Boolean).join(" · ");
    return `
      <div class="pp-row${e.kind === "starting" ? " pp-row--carried" : ""}">
        <span class="pp-row__date">${e.kind === "starting" ? "" : formatDay(e.date)}</span>
        <span class="pp-row__what"><span class="pp-row__title">${title}</span><span class="pp-row__sub">${sub}</span></span>
        <span class="pp-row__pts">${e.points && e.points > 0 ? `+${e.points.toLocaleString()}` : ""}</span>
      </div>`;
  };

  // Year groups, newest first as sent; the carried-forward line closes
  // the record, since it is older than everything above it.
  const items: string[] = [];
  let year = 0;
  const thisYear = new Date().getFullYear();
  for (const e of dated) {
    const y = ymd(e.date)[0];
    if (y !== year) {
      year = y;
      // The current year needs no label until an older one follows it.
      if (items.length || y !== thisYear) items.push(`<div class="pp-year">${y}</div>`);
    }
    items.push(row(e));
  }
  for (const e of carried) items.push(row(e));

  // Cap by rows, not by year labels: a label at the cut goes with the
  // rows under it.
  let shown = "", hidden = "", rows = 0;
  for (const it of items) {
    if (rows < RECORD_ROWS) shown += it;
    else hidden += it;
    if (it.includes('class="pp-row')) rows++;
  }
  const t = b.record?.totals;
  const count = [
    t && t.events >= 1 ? `${landing("events", t.events)} ${t.events === 1 ? "event" : "events"}` : "",
    t && t.points >= 1 ? `${landing("points", t.points)} ${t.points === 1 ? "point" : "points"}` : "",
  ].filter(Boolean).join(`<span class="pp-section__sep" aria-hidden="true">·</span>`);
  return section(
    "record", "Record", count,
    `<div class="pp-timeline rv-group">${shown}</div>${restOf(
      hidden ? `<div class="pp-timeline">${hidden}</div>` : "",
      `Show all ${plural(rows, "entry", "entries")}`,
    )}`,
  );
}

/* ── badges ─────────────────────────────────────────────────────── */

function renderBadges(b: Bundle): string {
  const badges = b.badges ?? [];
  if (!badges.length) return "";
  const items = badges.map((bd) => {
    const key = bd.icon?.trim() ?? "";
    const icon = /^(https?:\/\/|data:image\/)/.test(key) || key in BUILT_IN_ICONS
      ? renderBadgeIcon(key) : /\p{Extended_Pictographic}/u.test(key) ? esc(key) : esc(bd.name[0] ?? "");
    const meta = [formatMonth(bd.awardedAt), b.chapterCount > 1 ? bd.chapterName : null].filter(Boolean).join(" · ");
    const desc = (bd.description ?? "").trim();
    return `
      <div class="pp-badge">
        <div class="pp-badge__tile" aria-hidden="true">${icon}</div>
        <div class="pp-badge__body">
          <div class="pp-badge__name">${esc(bd.name)}</div>
          ${desc ? `<p class="pp-badge__desc">${esc(desc)}</p>` : ""}
          <div class="pp-badge__meta" title="${attr(formatLong(bd.awardedAt))}">${esc(meta)}</div>
        </div>
      </div>`;
  }).join("");
  return section(
    "badges", "Badges", landing("badges", badges.length),
    `<div class="pp-badges__grid${badges.length === 1 ? " pp-badges__grid--one" : ""} rv-group">${items}</div>`,
  );
}

/* ── projects ───────────────────────────────────────────────────── */

function renderProjects(b: Bundle): string {
  const ps = [...(b.projects ?? [])];
  const n = ps.length;
  if (!n) return "";
  // With three or more, the first shipped build (else the newest) spans
  // the grid so the section has a focal object.
  let featured: Project | null = null;
  if (n >= 3) {
    featured = ps.find((p) => p.kind === "build" && p.status === "shipped") ?? ps[0];
    ps.splice(ps.indexOf(featured), 1);
    ps.unshift(featured);
  }
  const STATUS = { shipped: "Shipped", building: "Building", recruiting: "Recruiting" };
  const card = (p: Project) => {
    const kind = p.kind === "build"
      ? `Build${p.status ? ` · ${STATUS[p.status]}` : ""}`
      : p.kind === "chapterProject"
        ? `Chapter project${p.chapterName ? ` · ${esc(p.chapterName)}` : ""}`
        : `GitHub${p.language ? ` · ${esc(p.language)}` : ""}`;
    const url = safeHttp(p.url);
    const title = url
      ? `<a href="${attr(url)}"${ext}>${esc(p.title)}<span class="pp-project__out">${OUT_ICON}</span></a>`
      : esc(p.title);
    const foot = [p.stars ? `★ ${p.stars}` : null, formatMonth(p.date)].filter(Boolean).join(" · ");
    return `
      <article class="pp-project${p === featured ? " pp-project--featured" : ""}">
        <div class="pp-project__kind">${kind}</div>
        <h3 class="pp-project__title">${title}</h3>
        ${p.description ? `<p class="pp-project__desc">${esc(plainText(p.description))}</p>` : ""}
        <div class="pp-project__foot">${esc(foot)}</div>
      </article>`;
  };
  const gh = b.github?.topLanguages.length
    ? `<p class="pp-github">Top languages on GitHub: ${esc(b.github.topLanguages.slice(0, 4).join(", "))}</p>`
    : "";
  return section(
    "projects", "Projects", landing("projects", n),
    `<div class="pp-projects__grid${n === 1 ? " pp-projects__grid--one" : ""} rv-group">${ps.map(card).join("")}</div>${gh}`,
  );
}

/* ── the résumé ─────────────────────────────────────────────────── */

function renderAbout(b: Bundle): string {
  const r = b.resume;
  const summary = r?.overview?.summary ? plainText(r.overview.summary) : "";
  const kw = r?.keywords ?? [];
  if (!summary && !kw.length) return "";
  const paras = summary.split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return section("about", "About", "", `
    ${r?.overview?.location ? `<div class="pp-about__loc">${esc(r.overview.location)}</div>` : ""}
    ${paras ? `<div class="pp-about__body">${paras}</div>` : ""}
    ${kw.length ? `<p class="pp-about__kw">${esc(kw.join(" · "))}</p>` : ""}`);
}

function bulletList(items: string[], max: number): string {
  if (!items.length) return "";
  const li = items.map((t, i) => `<li${i >= max ? " hidden" : ""}>${esc(plainText(t))}</li>`).join("");
  const extra = items.length - max;
  return `<ul class="pp-item__bullets">${li}</ul>${extra > 0 ? btn(`${extra} more`, " data-more", " pp-item__more") : ""}`;
}

function renderExperience(b: Bundle): string {
  const xs = b.resume?.experience ?? [];
  if (!xs.length) return "";
  const items = xs.map((x) => {
    const period = plainText(x.period);
    const now = x.current && !/present|now|current/i.test(period) ? " – now" : "";
    return `
      <div class="pp-item">
        <div class="pp-item__period">${esc(period)}${now}</div>
        <div class="pp-item__main">
          <div class="pp-item__role">${esc(plainText(x.role))}</div>
          <div class="pp-item__sub">${esc([x.company, x.location].filter(Boolean).map((s) => plainText(s)).join(" · "))}</div>
          ${x.description ? `<p class="pp-item__desc">${esc(plainText(x.description))}</p>` : ""}
          ${bulletList(x.bullets ?? [], 2)}
        </div>
      </div>`;
  }).join("");
  return section("experience", "Experience", String(xs.length), `<div class="pp-items rv-group">${items}</div>`);
}

function renderEducation(b: Bundle): string {
  const xs = b.resume?.education ?? [];
  if (!xs.length) return "";
  const items = xs.map((x) => `
      <div class="pp-item">
        <div class="pp-item__period">${esc(plainText(x.period))}</div>
        <div class="pp-item__main">
          <div class="pp-item__role">${esc(plainText(x.school))}</div>
          <div class="pp-item__sub">${esc([x.degree, x.field].filter(Boolean).map((s) => plainText(s)).join(" · "))}</div>
          ${bulletList((x.highlights ?? []).slice(0, 3), 3)}
        </div>
      </div>`).join("");
  return section("education", "Education", String(xs.length), `<div class="pp-items rv-group">${items}</div>`);
}

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
        <div class="pp-lesson"><span class="pp-lesson__date">${formatDay(l.completedAt)}</span><span class="pp-lesson__title">${esc(l.title)}</span></div>`).join("");
    return `
      <div class="pp-band rv">
        <div class="pp-band__head"><span class="pp-band__title">${esc(x.title)}</span><span class="pp-band__count">${x.done} of ${x.count}</span></div>
        ${meter}${lessons}
      </div>`;
  };
  return section("learn", "Learning", plural(done, "lesson"), `<div class="pp-learn__body">${bands.map(band).join("")}</div>`);
}

/** The one ALL call-out: the mark and two doors, no sentence. */
function footerBand(): string {
  return `
  <aside class="pp-footer rv">
    <img src="./portfolio/all-logo.png" alt="ALL Applied AI Network" width="24" height="24">
    <div class="pp-footer__links">
      <a href="https://all-ai-network.org/impact.html#chapters"${ext}>Join a chapter</a>
      <a href="https://sponsors.all-ai-network.org"${ext}>Sponsor the network</a>
    </div>
  </aside>`;
}

function renderPage(b: Bundle): string {
  return renderHeader(b) + renderRecord(b) + renderBadges(b) + renderProjects(b) +
    renderAbout(b) + renderExperience(b) + renderEducation(b) + renderLearning(b) + footerBand();
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

/**
 * The arrival, in four beats that never overlap in one place:
 *
 *   0–460     the portrait opens out of its centre
 *   140–880   the chapter's ring draws around it, clockwise from the top
 *   180–620   the name rises out of its own baseline, a word at a time
 *   420–720   the headline and the chapter line
 *   500–…     the link chips, 40 ms apart
 *   620–…     the numbers, 40 ms apart
 *
 * `reveal` runs as the numbers land, so the sections standing in the
 * first screen come in under a header that is already there, never
 * beside one that is still arriving.
 *
 * ?seek=ms renders exactly one frame of this and stops.
 */
function mountArrival(seek: number | null, reveal: () => void) {
  const photo = $("#pp-photo");
  const ring = $<SVGCircleElement>(".pp-photo__ring circle");
  const words = $$(".pp-w > span");
  const late = $$(".pp-late");
  const chips = $$("#pp-chips > *");
  const doors = $$("#pp-doors > *");
  const DOOR0 = 620;
  const END = Math.max(880, DOOR0 + Math.max(0, doors.length - 1) * 40 + 380, 500 + Math.max(0, chips.length - 1) * 40 + 320);
  const T = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  let revealed = false;

  const frame = (t: number) => {
    if (photo) {
      const p = ENTER(T(t, 0, 460));
      photo.style.clipPath = p < 1 ? `circle(${(50 * p).toFixed(2)}% at 50% 50%)` : "";
      photo.style.transform = p < 1 ? `scale(${(0.9 + 0.1 * p).toFixed(4)})` : "";
    }
    ring?.style.setProperty("stroke-dashoffset", String(RING * (1 - MOVE(T(t, 140, 880)))));
    words.forEach((w, i) => {
      const p = ENTER(T(t, 180 + i * 40, 180 + i * 40 + 440));
      w.style.transform = p < 1 ? `translateY(${(105 * (1 - p)).toFixed(2)}%)` : "";
    });
    let p = ENTER(T(t, 420, 720));
    for (const el of late) {
      el.style.opacity = String(p);
      el.style.transform = p < 1 ? `translateY(${(8 * (1 - p)).toFixed(2)}px)` : "";
    }
    chips.forEach((c, i) => {
      p = ENTER(T(t, 500 + i * 40, 500 + i * 40 + 320));
      c.style.opacity = String(p);
      c.style.transform = p < 1 ? `translateY(${(6 * (1 - p)).toFixed(2)}px)` : "";
    });
    doors.forEach((d, i) => {
      p = ENTER(T(t, DOOR0 + i * 40, DOOR0 + i * 40 + 380));
      d.style.opacity = String(p);
      d.style.transform = p < 1 ? `translateY(${(12 * (1 - p)).toFixed(2)}px)` : "";
    });
    if (t >= DOOR0 + 120 && !revealed) { revealed = true; reveal(); }
  };
  const clear = () => {
    for (const el of [photo, ...words, ...late, ...chips, ...doors]) {
      if (!el) continue;
      el.style.opacity = ""; el.style.transform = ""; el.style.clipPath = "";
    }
    ring?.style.removeProperty("stroke-dashoffset");
  };

  document.documentElement.classList.add("pp-arrive");
  if (seek !== null) { frame(Math.max(0, Math.min(seek, END))); return; }
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
 * in the header lands as the 12 in "Record · 12 events". One rAF loop
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
  sectionEl.classList.add("in");
  for (const el of $$(".rv, .rv-group", sectionEl)) el.classList.add("in");
  $(".pp-section__head", sectionEl)?.classList.add("in");

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
  const photo = safeHttp(b.imageUrl);
  bar.innerHTML = `
    <span class="pp-topbar__who">
      <span class="pp-topbar__av" aria-hidden="true"><span>${esc(initials(b.name))}</span>${photo ? `<img src="${attr(photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>
      <span class="pp-topbar__name">${esc(b.name)}</span>
    </span>${btn("Copy link", " data-copy")}`;
  bar.hidden = false;
  new IntersectionObserver(([e]) => {
    bar.classList.toggle("is-on", !e.isIntersecting && e.boundingClientRect.bottom < 0);
  }, { threshold: 0 }).observe($("#pp-photo") ?? $("#pp-head")!);
}

function mountButtons() {
  for (const b of $$<HTMLButtonElement>("[data-copy]")) {
    b.addEventListener("click", async () => {
      // A phone hands the link to its own share sheet; the label stays.
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        navigator.share({ title: document.title, url: location.href }).catch(() => {});
        return;
      }
      try { await navigator.clipboard.writeText(location.href); } catch { return; }
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
      // Next frame, so the rows transition from their hidden state.
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
  const params = new URLSearchParams(location.search);
  // Fixtures exist for local verification only: never on the live hosts.
  const local = import.meta.env.DEV || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const fixture = local ? params.get("fixture") : null;
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
  const params = new URLSearchParams(location.search);
  const main = $("#pp")!;

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

  const a = deriveAccent(b.chapter?.primaryColor);
  const root = document.documentElement.style;
  root.setProperty("--pp-accent", a.accent);
  root.setProperty("--pp-accent-rgb", a.accentRgb);
  root.setProperty("--pp-accent-text", a.accentText);
  root.setProperty("--pp-ink-text", a.inkText);
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

  const seekRaw = params.get("seek");
  const seek = seekRaw !== null && seekRaw !== "" ? Number(seekRaw) : null;
  const rest = reduced || isDashboardPreview(params);
  if (rest) {
    observeReveals(main);
  } else {
    mountArrival(Number.isFinite(seek) ? seek : null, () => observeReveals(main));
  }
  main.style.visibility = "";

  mountTopbar(b);
  mountButtons();
}

init();
