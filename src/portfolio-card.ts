/* The member's card: the top of https://{slug}.all-ai-network.org.

   The same card the dashboard draws in its "What visitors see" frame,
   from the same public JSON (/api/public/member/{slug}). Two halves:

     cardFromJson  a pure function from the JSON to the card's model.
                   Every rule about what the card may say lives here.
     renderCard    that model as markup (string templates, like the rest
                   of portfolio.ts). Styles: portfolio.css, prefix mc-.

   Top to bottom: a 3px edge in the primary chapter's colour (none without
   a chapter); the portrait (the photo, else initials on a tone picked
   from the name), the name, the headline; one line of who they are with
   (each chapter's acronym mark and name, linking to its site), the GitHub
   handle, since when, and where; the page's address top right; then the
   shelves, in this fixed order:

     Built       placements first when the JSON carries `competitions`
                 (it only does when the member switched them on), then
                 projects in the shape of GitHub's pinned repos: photo or
                 repo glyph, name, kind, one line, language, stars, Shipped
     Earned      the four newest badges by name, each in a medallion
     Checked in  the three newest events by name, each with its photo or
                 a date leaf in the host chapter's colour

   The rules:
   - Only what the JSON sends. A shelf with nothing in it is absent, and
     no number is ever printed as zero.
   - Never on the card: a rank, "Verified", stat tiles, a card number, a
     "Now" line, the network's wordmark, an uploaded chapter logo.
   - JSON from before `chapters` existed still renders: the one `chapter`
     it carries stands in, and "and N more" says how many it doesn't name.
   - A picture that fails to load leaves what is painted under it: the
     initials, the repo glyph, the date leaf, the badge's initial. */

import { escapeHtml as esc, escapeAttr as attr } from "./lib/html";
import { GITHUB_MARK } from "./lib/brand-marks";
import { deriveAccent } from "./accent";
import { badgeGlyph } from "./portfolio-badge-icons";
import { normalizeHex } from "./portfolio-colors";
import { languageColor } from "./portfolio-lang";
import { plainText } from "./plain-text";

/* ── the JSON the card reads (a subset of portfolio.ts's Bundle) ──── */

export type CardEntry = {
  id: string;
  kind: string;
  date: string;
  title: string;
  chapterId: string | null;
  chapterName: string | null;
  points: number | null;
  eventImageUrl?: string | null;
  eventId?: string | null;
};
export type CardProject = {
  id: string;
  kind: "build" | "chapterProject" | "repo";
  title: string;
  description: string | null;
  url: string | null;
  chapterName: string | null;
  status: "recruiting" | "building" | "shipped" | null;
  language: string | null;
  stars: number | null;
  imageUrl: string | null;
  date: string;
  repoUrl?: string | null;
};
export type CardSource = {
  slug: string | null;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  chapter: {
    id: string;
    name: string;
    hubUrl: string | null;
    primaryColor: string | null;
    acronym: string | null;
  } | null;
  chapterCount?: number;
  /** Every chapter, primary first. Absent in JSON older than the card. */
  chapters?: Array<{
    id: string;
    name: string;
    acronym: string | null;
    themePrimary: string | null;
    hubUrl: string | null;
    since?: string;
  }>;
  /** Present only when the member switched competition results on. */
  competitions?: Array<{
    eventId: string;
    eventTitle: string;
    eventDate: string;
    chapterName: string;
    teamName: string;
    projectTitle: string | null;
    place: string;
    certificateUrl: string | null;
  }>;
  since: string;
  record?: {
    entries: CardEntry[];
    totals: { points: number; events: number; badges: number; brought?: number };
  };
  badges?: Array<{ id: string; name: string; icon: string | null; awardedAt: string; chapterName: string | null }>;
  projects?: CardProject[];
  github?: { username: string };
  resume?: { tagline: string | null; overview: { location: string | null } | null };
};

/* ── the model ───────────────────────────────────────────────────── */

export type CardChapter = { id: string; name: string; acronym: string; color: string; href: string | null };

/** A placement: the Built shelf opens with them, and the Competitions
 *  section under the card lists every one. */
export type CardPlacement = {
  kind: "placement";
  place: string;
  metal: Metal;
  eventTitle: string;
  team: string;
  projectTitle: string | null;
  meta: string;
  href: string | null;
};

export type CardBuilt =
  | CardPlacement
  | {
      kind: "project";
      name: string;
      label: string;
      description: string | null;
      imageUrl: string | null;
      language: string | null;
      stars: number;
      shipped: boolean;
      /** An outside link, the Projects section on this page, or "" for
       *  nowhere (then the tile is not a link). */
      href: string;
    };

export type CardBadge = {
  name: string;
  /** What draws in the medallion. */
  art: { image: string } | { glyph: string } | { emoji: string } | { initial: string };
  when: string | null;
  chapterName: string | null;
  color: string;
};

export type CardCheckin = {
  title: string;
  /** "Nov 12", and the leaf's day and month. */
  when: string | null;
  day: string;
  month: string;
  hostName: string;
  /** The host chapter's colour, or null for a leaf in the card's neutral. */
  hostColor: string | null;
  imageUrl: string | null;
};

export type CardShelf = {
  key: "built" | "earned" | "checkins";
  title: "Built" | "Earned" | "Checked in";
  /** The label column's lines; every number in them is at least 1. */
  lines: { n: number; label: string }[];
  /** "All N ›": where the rest are, on this page. */
  all: { n: number; href: string; land: string } | null;
};

export type CardModel = {
  name: string;
  initials: string;
  tone: string;
  imageUrl: string | null;
  headline: string | null;
  /** The primary chapter's colour along the top edge; null without one. */
  edge: string | null;
  chapters: CardChapter[];
  /** Chapters older JSON counts but does not name. */
  moreChapters: number;
  github: string | null;
  /** "Since Sep 2026" in a chapter, "Joined Nov 2026" in none. */
  since: string | null;
  location: string | null;
  address: string | null;
  built: CardBuilt[];
  badges: CardBadge[];
  checkins: CardCheckin[];
  /** Points with no check-in behind them (a balance carried in): shown
   *  under Earned, since no event chip can account for them. */
  carried: number | null;
  shelves: CardShelf[];
};

export type CardOptions = {
  /** The page's own address, printed top right; null prints none. */
  host: string | null;
  /** The page's picture rule: an image URL from the JSON, or null. */
  img: (raw: string | null | undefined) => string | null;
  /** Which sections the page below the card has, so "All N ›" never
   *  points at one that isn't there. */
  sections: { projects: boolean; competitions: boolean; badges: boolean; events: boolean };
};

/** How many of each shelf the card shows before "All N ›". */
export const SHOWN = { built: 3, badges: 4, checkins: 3 } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The portrait's ground when there is no photo: a muted tone picked from
 *  the name, the same palette and hash the dashboard uses. */
const TONES = ["#4f6fbf", "#7a5bc4", "#2f8a86", "#b0578a", "#6b7a3a", "#b36b2e", "#3f7fa8", "#8a5a3c"];

export function toneOf(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** "AR" for Ana Ruiz, "PR" for a one-word name like Prince. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  return (Array.from(parts[0])[0] + Array.from(parts[parts.length - 1])[0]).toUpperCase();
}

/** First letters of up to five words: a chapter's mark when it has no
 *  acronym of its own. */
export function acronymOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 5);
}

/** The ISO date part, so the card and the sections under it agree on the
 *  day whatever zone the visitor is in. */
function parts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const x = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!x) return null;
  const m = Number(x[2]);
  return m >= 1 && m <= 12 ? { y: Number(x[1]), m, d: Number(x[3]) } : null;
}
export function monthYear(iso: string | null | undefined): string | null {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : null;
}
export function monthDay(iso: string | null | undefined): string | null {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : null;
}
/** "Fall 2026". */
export function termOf(iso: string): string {
  const p = parts(iso);
  if (!p) return "";
  return `${p.m <= 5 ? "Spring" : p.m <= 8 ? "Summer" : "Fall"} ${p.y}`;
}

export type Metal = "gold" | "silver" | "bronze" | "steel";

/** The medal's metal from the place's words: the winner gold, the first
 *  runner-up silver, the second bronze, anything else steel. */
export function placeMetal(place: string): Metal {
  const p = place.toLowerCase();
  if (/2nd runner|second runner|3rd|third/.test(p)) return "bronze";
  if (/1st runner|first runner|2nd|second/.test(p)) return "silver";
  if (/winner|1st|first|champion|grand/.test(p)) return "gold";
  return "steel";
}

/** A repository address as one comparable string: github.com/owner/name. */
export function repoKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  return s || null;
}

function safeHttp(raw: string | null | undefined): string | null {
  try {
    const u = new URL((raw ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A chapter colour as the card paints it: the colour itself, unless it
 *  would vanish on the card's dark ground, then the network blue. */
export function cardColor(raw: string | null | undefined): string {
  return deriveAccent(normalizeHex(raw)).accent;
}

/** Chapter projects first (a chapter published them), then the member's
 *  own builds, then bare repos; newest first inside each. A repo that is
 *  one of the projects (same address) folds into it, so nothing shows
 *  twice: the project keeps its photo and gains the repo's language and
 *  stars. */
function projectTiles(projects: CardProject[], img: CardOptions["img"], fallback: string): CardBuilt[] {
  const repos = projects.filter((p) => p.kind === "repo");
  const used = new Set<string>();
  const rank = { chapterProject: 0, build: 1, repo: 2 } as const;
  const own = projects
    .filter((p) => p.kind !== "repo")
    .sort((a, b) => rank[a.kind] - rank[b.kind] || (b.date ?? "").localeCompare(a.date ?? ""));
  const out: CardBuilt[] = [];
  for (const p of own) {
    const keys = [repoKey(p.url), repoKey(p.repoUrl)].filter((k): k is string => !!k);
    const repo = repos.find((r) => !used.has(r.id) && keys.includes(repoKey(r.url) ?? ""));
    if (repo) used.add(repo.id);
    const chapter = p.kind === "chapterProject";
    out.push({
      kind: "project",
      name: p.title,
      label: chapter ? `${p.chapterName ?? "Chapter"} project` : repo || p.repoUrl ? "Project · on GitHub" : "Project",
      description: plainText(p.description) || null,
      imageUrl: img(p.imageUrl),
      language: p.language ?? repo?.language ?? null,
      stars: Math.max(0, p.stars ?? repo?.stars ?? 0),
      shipped: p.status === "shipped",
      href: safeHttp(p.url) ?? safeHttp(p.repoUrl) ?? safeHttp(repo?.url) ?? fallback,
    });
  }
  for (const r of [...repos].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    if (used.has(r.id)) continue;
    out.push({
      kind: "project",
      name: r.title,
      label: "Project · on GitHub",
      description: plainText(r.description) || null,
      imageUrl: null,
      language: r.language,
      stars: Math.max(0, r.stars ?? 0),
      shipped: false,
      href: safeHttp(r.url) ?? fallback,
    });
  }
  return out;
}

/** The art inside a badge's medallion: an uploaded picture, the glyph the
 *  officer picked, an emoji they typed, a trophy when the badge has no
 *  icon at all, or else the name's initial. */
function badgeArt(icon: string | null, name: string, img: CardOptions["img"]): CardBadge["art"] {
  const key = icon?.trim() ?? "";
  const initial = (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? "?").toUpperCase();
  if (!key) return { glyph: badgeGlyph("trophy") ?? "" };
  const image = img(key) ?? (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(key) ? key : null);
  if (image) return { image };
  const glyph = badgeGlyph(key);
  if (glyph) return { glyph };
  if (/\p{Extended_Pictographic}/u.test(key)) return { emoji: key };
  return { initial };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Every placement the JSON carries, in its order. It carries them only
 *  when the member switched competition results on; one with no place or
 *  no event is skipped, here and in the Competitions section alike. */
export function placementsOf(list: CardSource["competitions"]): CardPlacement[] {
  const out: CardPlacement[] = [];
  for (const c of list ?? []) {
    if (!c?.place?.trim() || !c.eventTitle?.trim()) continue;
    const teamName = c.teamName?.trim() ?? "";
    out.push({
      kind: "placement",
      place: c.place.trim(),
      metal: placeMetal(c.place),
      eventTitle: c.eventTitle.trim(),
      team: teamName ? (/^team\b/i.test(teamName) ? teamName : `Team ${teamName}`) : "",
      projectTitle: c.projectTitle?.trim() || null,
      meta: [c.chapterName, termOf(c.eventDate)].filter(Boolean).join(" · "),
      href: safeHttp(c.certificateUrl),
    });
  }
  return out;
}

export function cardFromJson(b: CardSource, o: CardOptions): CardModel {
  /* Who they are with: every chapter, primary first. */
  type Raw = { id: string; name: string; acronym: string | null; color: string | null; hubUrl: string | null };
  let raw: Raw[] = [];
  let moreChapters = 0;
  if (Array.isArray(b.chapters)) {
    raw = b.chapters.map((c) => ({ ...c, color: c.themePrimary }));
  } else if (b.chapter) {
    raw = [{ ...b.chapter, color: b.chapter.primaryColor }];
    moreChapters = Math.max(0, (b.chapterCount ?? 1) - 1);
  }
  const chapters: CardChapter[] = raw.map((c) => ({
    id: c.id,
    name: c.name,
    acronym: (c.acronym?.trim() || acronymOf(c.name)).slice(0, 5),
    color: cardColor(c.color),
    href: safeHttp(c.hubUrl),
  }));
  // A chapter that never picked a colour paints its date leaves in the
  // card's neutral, not in a blue it didn't choose.
  const leafById = new Map(raw.map((c) => [c.id, normalizeHex(c.color) ? cardColor(c.color) : null]));
  const colorByName = new Map(chapters.map((c) => [c.name, c.color]));

  /* Built: the placements, then the projects. */
  const projectsHref = o.sections.projects ? "#pp-projects" : "";
  const placements = placementsOf(b.competitions);
  const tiles = projectTiles(b.projects ?? [], o.img, projectsHref);
  const built: CardBuilt[] = [...placements, ...tiles];
  const placementsShown = Math.min(placements.length, SHOWN.built);
  const tilesShown = Math.min(tiles.length, SHOWN.built - placementsShown);
  // "All N ›" goes to the section that holds the ones the card leaves
  // out, and N is the number that section counts, so the number clicked
  // is the number landed on. Projects counts every project the JSON sends
  // (a repo the card folds into its project is a card of its own there);
  // Competitions counts every placement.
  let builtAll: CardShelf["all"] = null;
  if (tiles.length > tilesShown && o.sections.projects) {
    builtAll = { n: (b.projects ?? []).length, href: "#pp-projects", land: "projects" };
  } else if (placements.length > placementsShown && o.sections.competitions) {
    builtAll = { n: placements.length, href: "#pp-competitions", land: "competitions" };
  }

  /* Earned. */
  const badgeRows = [...(b.badges ?? [])].sort((x, y) => (y.awardedAt ?? "").localeCompare(x.awardedAt ?? ""));
  const badges: CardBadge[] = badgeRows.slice(0, SHOWN.badges).map((x) => ({
    name: x.name,
    art: badgeArt(x.icon, x.name, o.img),
    when: monthDay(x.awardedAt),
    chapterName: x.chapterName,
    color: cardColor(x.chapterName ? colorByName.get(x.chapterName) : null),
  }));
  const totals = b.record?.totals;
  const badgeCount = Math.max(totals?.badges ?? 0, badgeRows.length);

  /* Checked in: one chip per event (a multi-phase event is one check-in
     row per phase, and one chip). */
  const seen = new Set<string>();
  const checkins: CardCheckin[] = [];
  for (const e of b.record?.entries ?? []) {
    if (e.kind !== "checkin") continue;
    const key = e.eventId ?? `${e.title}|${(e.date ?? "").slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (checkins.length >= SHOWN.checkins) continue;
    const p = parts(e.date);
    checkins.push({
      title: e.title,
      when: monthDay(e.date),
      day: p ? String(p.d) : "",
      month: p ? MONTHS[p.m - 1] : "",
      hostName: e.chapterName ?? "",
      hostColor: (e.chapterId && leafById.get(e.chapterId)) || null,
      imageUrl: o.img(e.eventImageUrl),
    });
  }
  const eventCount = Math.max(totals?.events ?? 0, seen.size);
  const points = Math.max(0, totals?.points ?? 0);
  const brought = Math.max(0, totals?.brought ?? 0);
  const carried = eventCount === 0 && points > 0 ? points : null;

  /* The shelves, in their fixed order; a shelf with nothing is absent. */
  const shelves: CardShelf[] = [];
  if (built.length) shelves.push({ key: "built", title: "Built", lines: [], all: builtAll });
  if (badges.length || carried) {
    const lines: CardShelf["lines"] = [];
    if (badgeCount > 0) lines.push({ n: badgeCount, label: plural(badgeCount, "badge", "badges") });
    if (carried) lines.push({ n: carried, label: plural(carried, "point", "points") });
    shelves.push({
      key: "earned",
      title: "Earned",
      lines,
      all: badgeCount > badges.length && o.sections.badges ? { n: badgeCount, href: "#pp-badges", land: "badges" } : null,
    });
  }
  if (checkins.length) {
    const lines: CardShelf["lines"] = [];
    if (eventCount > 0) lines.push({ n: eventCount, label: plural(eventCount, "event", "events") });
    if (points > 0) lines.push({ n: points, label: plural(points, "point", "points") });
    if (brought > 0) lines.push({ n: brought, label: plural(brought, "friend brought", "friends brought") });
    shelves.push({
      key: "checkins",
      title: "Checked in",
      lines,
      all: eventCount > checkins.length && o.sections.events ? { n: eventCount, href: "#pp-events", land: "events" } : null,
    });
  }

  const headline = b.headline?.trim() || b.resume?.tagline?.trim() || null;
  const location = plainText(b.resume?.overview?.location) || null;
  const sinceMonth = monthYear(b.since);
  return {
    name: b.name,
    initials: initialsOf(b.name),
    tone: toneOf(b.name),
    imageUrl: o.img(b.imageUrl),
    headline,
    edge: chapters.length ? chapters[0].color : null,
    chapters,
    moreChapters,
    github: b.github?.username?.trim() || null,
    since: sinceMonth ? `${chapters.length ? "Since" : "Joined"} ${sinceMonth}` : null,
    location,
    address: o.host,
    built: built.slice(0, SHOWN.built),
    badges,
    checkins,
    carried: badges.length ? null : carried,
    shelves,
  };
}

/* ── markup ──────────────────────────────────────────────────────── */

/** The page's picture: <img> with the page's failure rule ("drop" leaves
 *  whatever is painted under it). */
export type Pic = (src: string, cls: string) => string;

const ext = ' target="_blank" rel="noopener"';

const REPO_GLYPH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;
const STAR = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const CHEVRON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;

/** The medallion's milled edge: thirty ticks between the rim and the face. */
const TICKS = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * Math.PI * 2;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `<line x1="${r(18 + 14.5 * Math.cos(a))}" y1="${r(18 + 14.5 * Math.sin(a))}" x2="${r(18 + 16.3 * Math.cos(a))}" y2="${r(18 + 16.3 * Math.sin(a))}"/>`;
}).join("");
const MEDALLION = `<svg class="mc-med__ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><circle class="mc-med__rim" cx="18" cy="18" r="17.3"/><g class="mc-med__ticks">${TICKS}</g><circle class="mc-med__face" cx="18" cy="18" r="13.3"/></svg>`;

const METALS: Record<Metal, string> = { gold: "#e3bd5a", silver: "#c9ced8", bronze: "#cd8d5c", steel: "#9aa3b5" };

/** `a` mixed into `b` at `t` (0 = b, 1 = a), as hex: the medal's solid
 *  fills, worked out here rather than left to color-mix(). */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return "#" + x.map((v, i) => Math.round(y[i] + (v - y[i]) * t).toString(16).padStart(2, "0")).join("");
}

function placementMedal(metal: Metal): string {
  const m = METALS[metal];
  return `<svg class="mc-medal" width="32" height="36" viewBox="0 0 36 40" aria-hidden="true" focusable="false"><path d="M9 1h7l4 12h-7z" fill="${mixHex(m, "#1c1d24", 0.4)}"/><path d="M27 1h-7l-4 12h7z" fill="${mixHex(m, "#1c1d24", 0.62)}"/><circle cx="18" cy="25" r="13.5" fill="${mixHex(m, "#15161b", 0.3)}" stroke="${m}" stroke-width="1.3"/><circle cx="18" cy="25" r="9.6" fill="none" stroke="${mixHex(m, "#15161b", 0.55)}" stroke-width=".8"/><polygon points="18,19.2 19.75,22.8 23.6,23.3 20.8,26 21.5,29.8 18,28 14.5,29.8 15.2,26 12.4,23.3 16.25,22.8" fill="${m}"/></svg>`;
}

function medallion(bd: CardBadge, pic: Pic): string {
  const a = bd.art;
  const inner =
    "image" in a
      ? `<span class="mc-med__g mc-med__g--txt">${esc((/[\p{L}\p{N}]/u.exec(bd.name)?.[0] ?? "").toUpperCase())}</span>${pic(a.image, "mc-med__img")}`
      : "glyph" in a
        ? `<span class="mc-med__g">${a.glyph}</span>`
        : "emoji" in a
          ? `<span class="mc-med__g mc-med__g--emoji">${esc(a.emoji)}</span>`
          : `<span class="mc-med__g mc-med__g--txt">${esc(a.initial)}</span>`;
  return `<span class="mc-med" style="--m:${attr(bd.color)}" aria-hidden="true">${MEDALLION}${inner}</span>`;
}

/** A placement tile: on the card's Built shelf (`extra` carries the
 *  arrival hooks) and in the Competitions section. */
export function placementTile(t: CardPlacement, extra = ""): string {
  const team = [t.team, t.projectTitle].filter(Boolean).join(" · ");
  const body = `
          <span class="mc-award__top">${placementMedal(t.metal)}<span class="mc-award__place" title="${attr(`${t.place}, ${t.eventTitle}`)}">${esc(t.place)}<small>${esc(t.eventTitle)}</small></span></span>
          ${team ? `<span class="mc-award__team" title="${attr(team)}">${esc(team)}</span>` : ""}
          ${t.meta ? `<span class="mc-award__meta">${esc(t.meta)}</span>` : ""}`;
  const cls = `mc-tile mc-award mc-award--${t.metal}`;
  return t.href
    ? `<a class="${cls}"${extra} href="${attr(t.href)}"${ext}>${body}</a>`
    : `<div class="${cls}"${extra}>${body}</div>`;
}

function builtTile(t: CardBuilt, j: number, pic: Pic): string {
  const style = ` style="--j:${j}"`;
  if (t.kind === "placement") return placementTile(t, ` data-chip${style}`);
  const meta = [
    t.language
      ? `<span class="mc-lang" style="--l:${attr(languageColor(t.language) ?? "#8e8e93")}"><i aria-hidden="true"></i>${esc(t.language)}</span>`
      : "",
    t.stars > 0 ? `<span class="mc-stars">${STAR}${t.stars.toLocaleString("en-US")}<span class="pp-sr"> ${plural(t.stars, "star", "stars")}</span></span>` : "",
    t.shipped ? `<span class="mc-shipped">Shipped</span>` : "",
  ].filter(Boolean).join("");
  const body = `
          <span class="mc-proj__top">
            <span class="mc-proj__media" aria-hidden="true"><span class="mc-proj__repo">${REPO_GLYPH}</span>${t.imageUrl ? pic(t.imageUrl, "mc-proj__thumb") : ""}</span>
            <span class="mc-proj__name"><span title="${attr(t.name)}">${esc(t.name)}</span><span class="mc-proj__kind">${esc(t.label)}</span></span>
          </span>
          ${t.description ? `<span class="mc-proj__desc">${esc(t.description)}</span>` : ""}
          ${meta ? `<span class="mc-proj__meta">${meta}</span>` : ""}`;
  if (!t.href) return `<div class="mc-tile mc-proj" data-chip${style}>${body}</div>`;
  const outside = /^https?:\/\//i.test(t.href);
  return `<a class="mc-tile mc-proj" data-chip${style} href="${attr(t.href)}"${outside ? ext : " data-jump"}>${body}</a>`;
}

function badgeChip(bd: CardBadge, j: number, pic: Pic): string {
  const sub = [bd.when, bd.chapterName].filter(Boolean).join(" · ");
  return `<span class="mc-chip mc-bd" data-chip style="--j:${j}" title="${attr(bd.name)}">${medallion(bd, pic)}<span class="mc-chip__t"><b>${esc(bd.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></span>`;
}

function checkinChip(c: CardCheckin, j: number, pic: Pic): string {
  const sub = [c.when, c.hostName].filter(Boolean).join(" · ");
  const leaf = `<span class="mc-ev__leaf${c.hostColor ? "" : " is-plain"}"><b>${esc(c.day)}</b><span>${esc(c.month)}</span></span>`;
  return `<span class="mc-chip mc-ev" data-chip style="--j:${j}${c.hostColor ? `;--c:${attr(c.hostColor)}` : ""}" title="${attr(c.title)}"><span class="mc-ev__media" aria-hidden="true">${leaf}${c.imageUrl ? pic(c.imageUrl, "mc-ev__img") : ""}</span><span class="mc-chip__t"><b>${esc(c.title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></span>`;
}

function shelfLabel(s: CardShelf): string {
  const lines = s.lines.filter((l) => l.n > 0);
  return `<h2 class="mc-shelf__k"><span class="mc-shelf__t">${s.title}</span>${
    lines.length
      ? `<small class="mc-shelf__lines">${lines.map((l) => `<span><b>${l.n.toLocaleString("en-US")}</b> ${esc(l.label)}</span>`).join("")}</small>`
      : ""
  }${
    s.all
      ? `<a class="mc-all" href="${s.all.href}" data-jump data-land-key="${s.all.land}">All ${s.all.n.toLocaleString("en-US")}${CHEVRON}</a>`
      : ""
  }</h2>`;
}

/** The card as markup. The portrait carries id="pp-photo" (the topbar
 *  appears once it has scrolled away) and the name id="pp-name". */
export function renderCard(d: CardModel, pic: Pic): string {
  const mark = (c: CardChapter) =>
    `<span class="mc-mark${c.acronym.length > 3 ? " is-long" : ""}" style="--mk-c:${attr(c.color)}" aria-hidden="true">${esc(c.acronym)}</span>`;
  const aff = [
    ...d.chapters.map((c) =>
      c.href
        ? `<a class="mc-aff__i mc-aff__link" href="${attr(c.href)}"${ext}>${mark(c)}<span>${esc(c.name)}</span></a>`
        : `<span class="mc-aff__i">${mark(c)}<span>${esc(c.name)}</span></span>`,
    ),
    d.moreChapters > 0 ? `<span class="mc-aff__i mc-quiet">and ${d.moreChapters} more ${plural(d.moreChapters, "chapter", "chapters")}</span>` : "",
    d.github
      ? `<a class="mc-aff__i mc-aff__link" href="https://github.com/${attr(encodeURIComponent(d.github))}"${ext}><span class="mc-gh">${GITHUB_MARK}</span><span>${esc(d.github)}</span></a>`
      : "",
    d.since ? `<span class="mc-aff__i mc-quiet">${esc(d.since)}</span>` : "",
    d.location ? `<span class="mc-aff__i mc-quiet">${esc(d.location)}</span>` : "",
  ].filter(Boolean);

  const address = d.address
    ? `<button type="button" class="mc-url" data-copy title="Copy link" aria-label="Copy the link to this page, ${attr(d.address)}"><span class="pp-chip__label">${esc(d.address)}</span></button>`
    : "";

  const shelves = d.shelves.map((s, i) => {
    let row = "";
    if (s.key === "built") {
      row = `<div class="mc-row mc-built" data-n="${Math.min(SHOWN.built, d.built.length)}">${d.built.map((t, j) => builtTile(t, j, pic)).join("")}</div>`;
    } else if (s.key === "earned") {
      const one = d.badges.length === 1 || (!d.badges.length && d.carried);
      const carried = !d.badges.length && d.carried
        ? `<span class="mc-chip mc-carried" data-chip style="--j:0"><span class="mc-carried__n">${d.carried.toLocaleString("en-US")}</span><span class="mc-chip__t"><b>${plural(d.carried, "Point", "Points")}</b><small>Carried forward</small></span></span>`
        : "";
      row = `<div class="mc-row mc-bds${one ? " mc-bds--one" : ""}">${d.badges.map((bd, j) => badgeChip(bd, j, pic)).join("")}${carried}</div>`;
    } else {
      row = `<div class="mc-row mc-evs">${d.checkins.map((c, j) => checkinChip(c, j, pic)).join("")}</div>`;
    }
    return `
      <section class="mc-shelf mc-shelf--${s.key}" style="--i:${i}" aria-label="${s.title}">
        ${shelfLabel(s)}
        ${row}
      </section>`;
  }).join("");

  return `
  <div class="mc-box" id="pp-head">
    <article class="mc${d.edge ? "" : " mc--none"}"${d.edge ? ` style="--c:${attr(d.edge)}"` : ""} aria-labelledby="pp-name">
      <header class="mc-head">
        <span class="mc-portrait" id="pp-photo" style="--tone:${attr(d.tone)}" aria-hidden="true"><span class="mc-portrait__i">${esc(d.initials)}</span>${d.imageUrl ? pic(d.imageUrl, "mc-portrait__img") : ""}</span>
        <div class="mc-who">
          <h1 class="mc-name" id="pp-name">${esc(d.name)}</h1>
          ${d.headline ? `<p class="mc-headline">${esc(d.headline)}</p>` : ""}
          ${aff.length ? `<p class="mc-aff">${aff.join("")}</p>` : ""}
        </div>
        ${address}
      </header>${shelves ? `
      <div class="mc-shelves">${shelves}
      </div>` : ""}
    </article>
  </div>`;
}
