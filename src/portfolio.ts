/* Member portfolio — https://{slug}.all-ai-network.org

   One keyless fetch of the member bundle, then the whole page is rendered
   once from string templates in PAGE order. Every fixed string here is in
   the brief's COPY list; everything else is the member's data verbatim.
   Sections render only when their data exists, and a number is never
   printed as zero. */

document.documentElement.classList.add("js-rv");

import { escapeHtml as esc, escapeAttr as attr } from "./lib/html";
import { hostnameSlug, isDashboardPreview } from "./lib/slug";
import { BUILT_IN_ICONS, renderBadgeIcon } from "./badge-icon";
import { contrastRatio, deriveAccent } from "./accent";
import { langColor } from "./lang-colors";
import { plainText } from "./plain-text";

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
  /** A present-tense fact (a band in progress, a public build, a recent
   *  check-in) or null. The composer files the check-in line under kind
   *  "member" too, so renderHero tells the retired "member of …" filler
   *  apart by its sentence, not its kind. */
  now: { kind: "learning" | "building" | "checkin" | "member"; text: string } | null;
  record?: {
    entries: Entry[];
    totals: { points: number; events: number };
    /** Points carried in from before events were tracked. */
    startingBalance?: number;
  };
  badges?: { id: string; name: string; icon: string | null; awardedAt: string; chapterName: string | null }[];
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
function formatDay(iso: string, year = false): string {
  const [y, m, d] = ymd(iso);
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ""}`;
}
function formatMonth(iso: string): string {
  const [y, m] = ymd(iso);
  return `${MONTHS[m - 1]} ${y}`;
}
function formatStampMonth(iso: string): string {
  const [y, m] = ymd(iso);
  return `${MONTHS[m - 1].toUpperCase()} ${String(y).slice(2)}`;
}
function formatLong(iso: string): string {
  const [y, m, d] = ymd(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
/** First letters of up to five words, punctuation dropped first so
 *  "(AI) Club" contributes "A" rather than "(": "MSOE AI Club" → "MAC".
 *  Drawn in type at the seal's centre — never the uploaded logo image,
 *  which at 40 px reads as a smudge. */
function acronymOf(name: string): string {
  return name.split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")[0] ?? "")
    .join("").toUpperCase().slice(0, 5);
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── templates ───────────────────────────────────────────────────── */

const ext = ' target="_blank" rel="noopener"';
const btn = (label: string, extra = "", cls = "") => `<button type="button" class="pp-btn${cls}"${extra}><span>${label}</span></button>`;
/** Rows past a section's cap: hidden until Show all, then revealed as a group. */
const restOf = (html: string, label: string) => html
  ? `<div class="pp-rest rv-group" hidden>${html}</div><div class="pp-more">${btn(label, " data-show-all")}</div>` : "";
const linkBtn = (label: string, href: string) => `<a class="pp-btn" href="${attr(href)}"${ext}><span>${label}</span></a>`;
/** Section head: the word in sentence case, the count as a small tertiary
 *  number after it, then the hairline. No eyebrow system. */
const section = (cls: string, title: string, count: string | number | null, body: string, rv = true, hold = false) => `
  <section class="pp-section ${cls}${rv ? " rv" : ""}">
    <div class="pp-section__head"${hold ? " data-hold" : ""}>
      <h2 class="pp-section__title">${title}${count ? `<span class="pp-section__count">${count}</span>` : ""}</h2><span class="pp-section__rule"></span>
    </div>${body}
  </section>`;

/** Five thin concentric rings knocked out of the band; the outer one
 *  draws on clockwise from 12 o'clock (rotated so the dash starts at the
 *  top; the arrival sets the offset). */
function sealSvg(): string {
  let rings = `<circle class="pp-seal__ring" cx="50" cy="50" r="48" stroke-dasharray="302" transform="rotate(-90 50 50)"/>`;
  for (let i = 1; i < 5; i++) rings += `<circle cx="50" cy="50" r="${48 - i * 3}"/>`;
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width=".9" aria-hidden="true">${rings}</svg>`;
}

function renderCard(b: Bundle): string {
  const ch = b.chapter;
  // The identity block: a solid band in the chapter's colour carrying the
  // seal, the chapter's name and the issue month. No chapter, no band.
  const band = ch
    ? `<div class="pp-card__band">
      <div class="pp-card__seal">${sealSvg()}<i>${esc(ch.acronym ?? acronymOf(ch.name))}</i></div>
      <span class="pp-card__chapter">${esc(ch.name)}</span>
      <span class="pp-card__since">since ${formatMonth(b.since)}</span>
    </div>`
    : "";
  const headline = b.headline ?? b.resume?.tagline ?? null;
  // SINCE lives in the band; with no band it has nowhere else to print,
  // so it joins the fields row (the OG card does the same). Zero is never
  // printed, so a row with nothing true in it does not exist.
  const fields: [string, string | number | null][] = [
    ["SINCE", ch ? null : formatMonth(b.since)],
    ["EVENTS", b.record?.totals.events || null],
    ["POINTS", b.record?.totals.points || null],
  ];
  const fieldHtml = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="pp-card__field"><b>${esc(String(v))}</b><span>${k}</span></div>`)
    .join("");
  return `
  <div class="pp-card${b.imageUrl ? " pp-card--portrait" : ""}" id="pp-card">
    ${band}
    <div class="pp-card__body">
      ${b.imageUrl ? `<img class="pp-card__photo" src="${attr(b.imageUrl)}" alt="" width="88" height="88" referrerpolicy="no-referrer">` : ""}
      <div class="pp-card__id">
        <h1 class="pp-card__name" id="pp-name">${esc(b.name)}</h1>
        ${headline ? `<p class="pp-card__headline">${esc(headline)}</p>` : ""}
      </div>
      ${fieldHtml ? `<div class="pp-card__fields">${fieldHtml}</div>` : ""}
    </div>
  </div>`;
}

function renderHero(b: Bundle): string {
  const ch = b.chapter;
  const verify = ch?.verifyStudentId
    ? `${DASHBOARD_ORIGIN}/verify/${encodeURIComponent(ch.verifyStudentId)}` : null;
  // Only a real present-tense fact is printed. The composer still files
  // its recent-check-in line under kind "member" (compose.ts nowLine),
  // so the kind cannot tell a fact from the retired "member of …"
  // filler; only the sentence can, and a cached bundle may still carry it.
  // The composer sends null when there is no present-tense fact; the
  // "member of" guard only catches a bundle cached before that change.
  const now = b.now?.text && !b.now.text.startsWith("Now · member of") ? b.now.text : null;
  return `
  <header class="pp-hero">
    ${renderCard(b)}
    ${now ? `<p class="pp-now" id="pp-now">${esc(now)}</p>` : ""}
    <div class="pp-actions" id="pp-actions">
      ${btn("Copy link", ' data-copy')}
      ${ch?.hubUrl ? linkBtn("Chapter site →", ch.hubUrl) : ""}
      ${verify ? linkBtn("Verify record →", verify) : ""}
    </div>
  </header>`;
}

function renderStamps(b: Bundle): string {
  const entries = (b.record?.entries ?? []).filter((e) => e.kind === "checkin");
  const carried = b.record?.startingBalance ?? 0;
  const n = entries.length + (carried > 0 ? 1 : 0);
  if (!n) return "";
  const rot = (id: string) => ((fnv1a(id) % 25) - 12) * 0.5;
  const stamp = (e: Entry, i: number) => `
      <div class="pp-stamp${i >= 6 ? " rv" : ""}" style="--r:${rot(e.id)}deg">
        <div class="pp-stamp__ink" aria-hidden="true">
          <span class="pp-stamp__day">${ymd(e.date)[2]}</span>
          <span class="pp-stamp__mon">${formatStampMonth(e.date)}</span>
          ${e.phase ? `<span class="pp-stamp__phase">${esc(e.phase.slice(0, 10))}</span>` : ""}
        </div>
        <div class="pp-stamp__cap">
          <div class="pp-stamp__title">${esc(e.title)}</div>
          ${e.points ? `<div class="pp-stamp__meta">+${e.points}</div>` : ""}
        </div>
      </div>`;
  // Points from before events were tracked have no date to stamp, so the
  // oldest stamp in the cascade carries the points instead. It counts
  // toward POINTS (totals already include it) and never toward EVENTS.
  const carriedStamp = (i: number) => `
      <div class="pp-stamp pp-stamp--carried${i >= 6 ? " rv" : ""}" style="--r:${rot("carried")}deg">
        <div class="pp-stamp__ink" aria-hidden="true">
          <span class="pp-stamp__day">+${carried}</span>
          <span class="pp-stamp__mon">Carried</span>
        </div>
        <div class="pp-stamp__cap">
          <div class="pp-stamp__title">Carried forward</div>
          <div class="pp-stamp__meta">${esc(["Points from before events were tracked", b.chapter?.name].filter(Boolean).join(" · "))}</div>
        </div>
      </div>`;
  const all = entries.map((e, i) => stamp(e, i));
  if (carried > 0) all.push(carriedStamp(entries.length));
  const shown = all.slice(0, 24).join("");
  const rest = restOf(all.slice(24).join(""), `Show all ${n} stamps`);
  return section(
    `pp-stamps${n === 1 ? " pp-stamps--one" : ""}`,
    "Stamps", n,
    `<div class="pp-stamps__grid" id="pp-stamps">${shown}${rest}</div>`,
    false, true,
  );
}

function renderBadges(b: Bundle): string {
  const badges = b.badges ?? [];
  if (!badges.length) return "";
  const items = badges.map((bd) => {
    const key = bd.icon?.trim() ?? "";
    const icon = /^(https?:\/\/|data:image\/)/.test(key) || key in BUILT_IN_ICONS
      ? renderBadgeIcon(key) : esc(bd.name[0] ?? "");
    const meta = [formatLong(bd.awardedAt), b.chapterCount > 1 ? bd.chapterName : null].filter(Boolean).join(" · ");
    return `
      <div class="pp-badge">
        <div class="pp-badge__tile" aria-hidden="true">${icon}</div>
        <div><div class="pp-badge__name">${esc(bd.name)}</div><div class="pp-badge__meta">${esc(meta)}</div></div>
      </div>`;
  }).join("");
  return section(
    `pp-badges${badges.length === 1 ? " pp-badges--one" : ""}`,
    "Badges", badges.length,
    `<div class="pp-badges__grid rv-group">${items}</div>`,
  );
}

function renderAbout(b: Bundle): string {
  const r = b.resume;
  const summary = r?.overview?.summary ? plainText(r.overview.summary) : "";
  const kw = r?.keywords ?? [];
  if (!summary && !kw.length) return "";
  const paras = summary.split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return section("pp-about", "About", null, `
    ${r?.overview?.location ? `<div class="pp-about__loc">${esc(r.overview.location)}</div>` : ""}
    ${paras ? `<div class="pp-about__body">${paras}</div>` : ""}
    ${kw.length ? `<div class="pp-about__kw">${esc(kw.join(" · "))}</div>` : ""}`);
}

function bulletList(items: string[], max: number): string {
  if (!items.length) return "";
  const li = items.map((t, i) => `<li${i >= max ? " hidden" : ""}>${esc(plainText(t))}</li>`).join("");
  const extra = items.length - max;
  return `<ul class="pp-titem__bullets">${li}</ul>${extra > 0 ? btn(`+${extra} more`, " data-more", " pp-titem__more") : ""}`;
}

function renderExperience(b: Bundle): string {
  const xs = b.resume?.experience ?? [];
  if (!xs.length) return "";
  const items = xs.map((x) => {
    const period = plainText(x.period);
    const now = x.current && !/present|now|current/i.test(period) ? " – now" : "";
    return `
      <div class="pp-titem${x.current ? " pp-titem--now" : ""} rv">
        <div class="pp-titem__role">${esc(plainText(x.role))}</div>
        <div class="pp-titem__sub">${esc([x.company, x.location].filter(Boolean).map((s) => plainText(s)).join(" · "))}</div>
        <div class="pp-titem__period">${esc(period)}${now}</div>
        ${x.description ? `<p class="pp-titem__desc">${esc(plainText(x.description))}</p>` : ""}
        ${bulletList(x.bullets ?? [], 4)}
      </div>`;
  }).join("");
  return section("pp-experience", "Experience", xs.length, `<div class="pp-timeline">${items}</div>`);
}

function renderEducation(b: Bundle): string {
  const xs = b.resume?.education ?? [];
  if (!xs.length) return "";
  const items = xs.map((x) => `
      <div class="pp-titem rv">
        <div class="pp-titem__role">${esc(plainText(x.school))}</div>
        <div class="pp-titem__sub">${esc([x.degree, x.field].filter(Boolean).map((s) => plainText(s)).join(" · "))}</div>
        <div class="pp-titem__period">${esc(plainText(x.period))}</div>
        ${bulletList((x.highlights ?? []).slice(0, 3), 3)}
      </div>`).join("");
  return section("pp-education", "Education", xs.length, `<div class="pp-timeline">${items}</div>`);
}

function renderProjects(b: Bundle): string {
  const ps = [...(b.projects ?? [])];
  const n = ps.length;
  if (!n) return "";
  // With three or more, the first shipped build (else the newest) spans
  // the grid so the second screen has a focal object.
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
        : p.language
          ? `GitHub · <i style="--dot:${langColor(p.language)}"></i>${esc(p.language)}`
          : "GitHub";
    const title = p.url
      ? `<a href="${attr(p.url)}"${ext}>${esc(p.title)}<span class="m"> ↗</span></a>`
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
  const gh = b.github
    ? `<div class="pp-github"><a href="https://github.com/${attr(b.github.username)}"${ext}>github.com/${esc(b.github.username)}</a>${
        b.github.topLanguages.length ? ` · ${esc(b.github.topLanguages.join(" · "))}` : ""}</div>`
    : "";
  return section(
    `pp-projects${n === 1 ? " pp-projects--one" : ""}`,
    "Projects", n,
    `<div class="pp-projects__grid rv-group">${ps.map(card).join("")}</div>${gh}`,
  );
}

function renderLearning(b: Bundle): string {
  const bands = b.learning?.bands ?? [];
  if (!bands.length) return "";
  const done = bands.reduce((s, x) => s + x.done, 0);
  const band = (x: typeof bands[number]) => {
    const meter = x.count <= 12
      ? `<div class="pp-band__meter" aria-hidden="true">${Array.from({ length: x.count }, (_, i) => `<i${i < x.done ? ' class="done"' : ""}></i>`).join("")}</div>`
      : `<div class="pp-band__bar" aria-hidden="true"><i style="--w:${((x.done / x.count) * 100).toFixed(1)}%"></i></div>`;
    const lessons = x.lessons.map((l) => `
        <div class="pp-lesson rv"><span class="pp-lesson__title">${esc(l.title)}</span><span class="pp-lesson__date">${formatDay(l.completedAt, true)}</span></div>`).join("");
    return `
      <div class="pp-band">
        <div class="pp-band__head"><span class="pp-band__title">${esc(x.title)}</span><span class="pp-band__count">${x.done} of ${x.count}</span></div>
        ${meter}${lessons}
      </div>`;
  };
  return section("pp-learn", "Learning", plural(done, "lesson"), `
    <div class="pp-learn__body" id="pp-learn"><div class="pp-learn__track" id="pp-track"></div>${bands.map(band).join("")}</div>`);
}

function renderLedger(b: Bundle): string {
  const entries = b.record?.entries ?? [];
  if (!entries.length) return "";
  const multi = b.chapterCount > 1;
  const row = (e: Entry) => {
    const what = e.kind === "badge" ? `Badge · ${esc(e.title)}`
      : e.kind === "lesson" ? `Completed · ${esc(e.title)}`
        : e.kind === "starting" ? "Starting balance"
          : `${esc(e.title)}${e.phase ? `<span class="pp-row__chip">${esc(e.phase)}</span>` : ""}`;
    const chapName = e.chapterName ?? (e.kind === "lesson" ? "Learn" : "");
    const chap = e.hubUrl && e.chapterName ? `<a href="${attr(e.hubUrl)}"${ext}>${esc(chapName)}</a>` : esc(chapName);
    return `
      <div class="pp-row">
        <span class="pp-row__date">${formatDay(e.date)}</span>
        <span class="pp-row__what">${what}${multi && chapName ? `<span class="pp-row__sub">${esc(chapName)}</span>` : ""}</span>
        <span class="pp-row__chap">${chap}</span>
        <span class="pp-row__pts">${e.points ? `+${e.points}` : ""}</span>
      </div>`;
  };
  // Year groups, newest first as sent; the starting balance sits in its
  // own group after the years.
  const groups: { head: string; rows: string[] }[] = [];
  for (const e of entries) {
    const head = e.kind === "starting" ? "" : String(ymd(e.date)[0]);
    const g = groups[groups.length - 1];
    if (!g || g.head !== head) groups.push({ head, rows: [] });
    groups[groups.length - 1].rows.push(row(e));
  }
  // Rows, not groups, are capped: a record can run to hundreds. A group
  // that straddles the cap continues in the hidden half without a
  // second year head.
  const LIMIT = 40;
  const group = (head: string, rows: string[], cont = false) =>
    `<div class="pp-ledger__group rv">${cont ? "" : `<div class="pp-ledger__year">${head}</div>`}${rows.join("")}</div>`;
  let shown = "", hidden = "", count = 0;
  for (const g of groups) {
    const room = Math.max(0, LIMIT - count);
    const vis = g.rows.slice(0, room);
    const more = g.rows.slice(room);
    if (vis.length) shown += group(g.head, vis);
    if (more.length) hidden += group(g.head, more, vis.length > 0);
    count += g.rows.length;
  }
  return section(
    `pp-ledger${multi ? " pp-ledger--multi" : ""}`,
    "Record", null,
    `<div id="pp-ledger">${shown}${restOf(hidden, `Show all ${entries.length} entries`)}</div>`,
  );
}

/** The one ALL call-out: the mark and two doors, no sentence. */
function footerBand(): string {
  return `
  <aside class="pp-footer rv">
    <img src="./portfolio/all-logo.png" alt="ALL" width="24" height="24">
    <div class="pp-footer__links">
      <a href="https://all-ai-network.org/impact.html#chapters"${ext}>Join a chapter →</a>
      <a href="https://sponsors.all-ai-network.org"${ext}>Sponsor the network →</a>
    </div>
  </aside>`;
}

function renderColophon(b: Bundle): string {
  return `<p class="pp-colophon">Updated ${formatDay(b.updatedAt, true)}</p>`;
}

function renderPage(b: Bundle): string {
  return renderHero(b) + renderStamps(b) + renderBadges(b) + renderAbout(b) +
    renderExperience(b) + renderProjects(b) + renderEducation(b) + renderLearning(b) +
    renderLedger(b) + footerBand() + renderColophon(b);
}

/* ── shells ──────────────────────────────────────────────────────── */

function showShell(inner: string, withFooter = true) {
  const el = $("#pp-shell")!;
  el.className = "pp-shell";
  el.innerHTML = inner + (withFooter ? footerBand() : "");
  el.hidden = false;
  $("#pp")!.hidden = true;
}
const privateShell = () => showShell(
  `<p class="pp-shell__msg">This page is private or hasn't been published yet.</p>
   <a class="pp-shell__link" href="https://all-ai-network.org/">ALL Applied AI Network →</a>`);
const errorShell = () => {
  showShell(`<p class="pp-shell__msg">This page couldn't load.</p>${btn("Reload", " data-reload")}`);
  $("[data-reload]")?.addEventListener("click", () => location.reload());
};

/* ── the arrival: one seekable rAF timeline ─────────────────────── */

/** CSS cubic-bezier(x1,y1,x2,y2) as a function of progress, so the JS
 *  timeline uses the same house eases as the CSS transitions. */
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
const E1 = bezier(0.2, 0.7, 0.2, 1);
const E2 = bezier(0.2, 1.4, 0.4, 1);
const E3 = bezier(0.2, 0.9, 0.3, 1.25);
const RING = 302; // 2π·48, the outer seal ring's length

/** `reveal` runs once the now-line and actions have landed: the sections
 *  standing in the first viewport must not show before the card does, or
 *  the eye lands on résumé text while the card is still invisible. */
function mountArrival(seek: number | null, reveal: () => void) {
  const card = $("#pp-card")!;
  let revealed = false;
  const seal = $(".pp-card__seal");
  const ring = $<SVGCircleElement>(".pp-seal__ring");
  const late = [$("#pp-now"), $("#pp-actions")].filter(Boolean) as HTMLElement[];
  const stampsHead = $(".pp-stamps .pp-section__head");
  // Only stamps standing inside the first screen are pressed by the
  // timeline; the rest are at rest and reveal on scroll.
  const stamps = $$(".pp-stamp").slice(0, 6)
    .filter((s) => s.getBoundingClientRect().top < innerHeight)
    .map((s) => ({
      ink: $(".pp-stamp__ink", s)!, cap: $(".pp-stamp__cap", s)!,
      r: parseFloat(s.style.getPropertyValue("--r")) || 0,
    }));
  // Card 0–520, then the seal draws on in the band (520–800), then the
  // now-line and actions. A member with no chapter has no band, so the
  // seal beat has no actor and the late elements take its slot instead
  // of leaving 280 ms of dead air on a card that looks finished.
  const LATE = seal ? 800 : 520;
  const STAMP0 = LATE + 400;
  const END = STAMP0 + stamps.length * 140 + 220;
  const T = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

  const frame = (t: number) => {
    let p = E1(T(t, 0, 520));
    card.style.opacity = String(p);
    card.style.transform = p < 1 ? `translateY(${24 * (1 - p)}px) scale(${0.97 + 0.03 * p})` : "";
    if (seal) {
      p = E2(T(t, 520, 740));
      seal.style.opacity = String(T(t, 520, 740));
      seal.style.transform = p < 1 ? `rotate(${-8 * (1 - p)}deg) scale(${0.88 + 0.12 * p})` : "";
      ring?.style.setProperty("stroke-dashoffset", String(RING * (1 - E1(T(t, 520, 800)))));
    }
    p = E1(T(t, LATE, LATE + 280));
    for (const el of late) {
      el.style.opacity = String(p);
      el.style.transform = p < 1 ? `translateY(${10 * (1 - p)}px)` : "";
    }
    if (t >= LATE + 280 && !revealed) { revealed = true; reveal(); }
    if (stampsHead && t >= STAMP0) { stampsHead.removeAttribute("data-hold"); stampsHead.classList.add("in"); }
    stamps.forEach((s, i) => {
      const t0 = STAMP0 + i * 140;
      const raw = T(t, t0, t0 + 220);
      p = E3(raw);
      s.ink.style.opacity = String(raw);
      s.ink.style.transform = raw < 1
        ? `scale(${1.3 - 0.3 * p}) rotate(${s.r - 6 * (1 - p)}deg)` : "";
      s.cap.style.opacity = String(E1(T(t, t0 + 100, t0 + 300)));
    });
  };
  const clear = () => {
    for (const el of [card, seal, ...late, ...stamps.map((s) => s.ink), ...stamps.map((s) => s.cap)]) {
      if (el) { el.style.opacity = ""; el.style.transform = ""; }
    }
    ring?.style.removeProperty("stroke-dashoffset");
  };

  document.documentElement.classList.add("pp-arrive");
  if (seek !== null) { frame(Math.max(0, Math.min(seek, END))); return; }
  frame(0);
  const start = performance.now();
  const tick = (now: number) => {
    const t = now - start;
    if (t >= END) { frame(END); clear(); return; }
    frame(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── every visit: reveal, topbar, spine, buttons ────────────────── */

let revealer: IntersectionObserver | null = null;
function observeReveals(root: ParentNode) {
  if (!revealer) {
    revealer = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting || (e.target as HTMLElement).hasAttribute("data-hold")) continue;
        e.target.classList.add("in");
        revealer!.unobserve(e.target);
      }
    }, { threshold: 0.12 });
  }
  for (const el of $$(".rv, .rv-group, .pp-section__head", root)) revealer.observe(el);
}

function mountTopbar(name: string) {
  const bar = $("#pp-topbar")!;
  bar.innerHTML = `<span class="pp-topbar__name">${esc(name)}</span>${btn("Copy link", " data-copy")}`;
  bar.hidden = false;
  new IntersectionObserver(([e]) => {
    bar.classList.toggle("is-on", !e.isIntersecting && e.boundingClientRect.bottom < 0);
  }, { threshold: 0 }).observe($("#pp-card")!);
}

/** The accent fill climbs the learning spine as it is read, lighting each
 *  lesson dot once; it never un-lights (mountTimeline convention). */
function mountSpine() {
  const body = $("#pp-learn");
  const track = $("#pp-track");
  if (!body || !track || reduced) return;
  const lessons = $$(".pp-lesson", body);
  let fill = 0, running = false;
  const tick = () => {
    if (!running) return;
    const r = body.getBoundingClientRect();
    const target = Math.max(0, Math.min(1, (0.72 * innerHeight - r.top) / r.height));
    fill += (target - fill) * 0.12;
    track.style.setProperty("--fill", `${(fill * 100).toFixed(2)}%`);
    for (const l of lessons) {
      if (!l.classList.contains("is-lit") && fill * r.height >= l.offsetTop + 11) l.classList.add("is-lit");
    }
    requestAnimationFrame(tick);
  };
  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was) requestAnimationFrame(tick);
  }).observe(body);
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
      const span = $("span", b)!;
      const swap = (text: string) => {
        if (reduced) { span.textContent = text; return; }
        b.classList.add("is-swap");
        setTimeout(() => { span.textContent = text; b.classList.remove("is-swap"); }, 120);
      };
      swap("Copied");
      setTimeout(() => swap("Copy link"), 1600);
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
      for (const el of $$(".rv", rest)) el.classList.add("in");
      // Next frame, so the group transitions from its hidden state.
      requestAnimationFrame(() => rest.classList.add("in"));
      b.parentElement!.remove();
    });
  }
}

/** Shrink the name until it fits on two lines; never nowrap, never <br>. */
function fitName() {
  const el = $("#pp-name");
  if (!el) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.offsetHeight > size * 1.02 * 2 + 2 && size > 18) {
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

  // Flat ground while fetching; a spinner or skeleton would flash under a
  // card that arrives whole. Only a slow fetch says anything at all.
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
  // The band's "since" line is 11 px mono, so ink on solid accent must
  // clear 4.5:1 (white on the default blue is 3.26); deriveAccent's own
  // inkText is the large-numeral 3:1 rule and is not used on this page.
  root.setProperty("--pp-ink-text", a.inkText);
  document.title = `${b.name} — ${b.chapter?.name ?? "Portfolio"}`;
  $<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    "content", b.headline ?? (b.chapter ? `Member of ${b.chapter.name}` : "Member of the ALL Applied AI Network"));

  main.innerHTML = renderPage(b);
  // Laid out but unseen: measure-then-move happens before first paint so
  // the name never resizes in view and a wrapped now-line never shifts
  // the actions.
  main.style.visibility = "hidden";
  main.hidden = false;
  await Promise.race([document.fonts.ready, sleep(800)]);
  fitName();
  const now = $("#pp-now");
  if (now) now.style.minHeight = `${now.offsetHeight}px`;

  const seekRaw = params.get("seek");
  const seek = seekRaw !== null && seekRaw !== "" ? Number(seekRaw) : null;
  const rest = reduced || isDashboardPreview(params);
  if (rest) {
    $(".pp-stamps .pp-section__head")?.removeAttribute("data-hold");
    observeReveals(main);
  } else {
    mountArrival(Number.isFinite(seek) ? seek : null, () => observeReveals(main));
  }
  main.style.visibility = "";

  mountTopbar(b.name);
  mountSpine();
  mountButtons();
}

init();
