/* Learn — the curriculum destination, and the floor under every chapter.

   Two surfaces live in this file because they are one dataset:

   1. `renderStartHereBand()` fills Home's "Start here" band with the
      first six lessons of the path. This band is the reason a chapter
      with no events, no officers and no projects still reads as a club:
      8 of the 12 live chapters have nothing else, and this is a real
      curriculum a visitor can start today.
   2. The `learn` view fills the Learn destination: the seven curriculum
      chapters as bands above the content repo's tree canvas, plus the
      chapter's own authored lessons when it has any.

   Because both read the same two endpoints, the fetch is started once,
   eagerly, in parallel with the bundle — see startCurriculumFetch().

   MEASURED LIVE, 2026-09-18 (all `access-control-allow-origin: *`,
   `cache-control: public, max-age=60, s-maxage=300`):
     /api/public/learning-tree          28,708 B raw /  5,271 B gzipped
       → 34 base nodes, 34/34 with a thumbnail, difficulty and minutes
     /api/public/curriculum             35,083 B raw / 10,957 B gzipped
       → 7 ordered chapters covering all 34 nodes, plus a flat lessons[]
     /api/public/learning-tree/msoe-ai-club
                                       314,760 B raw / 83,707 B gzipped
       → 96 nodes, 62 of them chapter-authored
     /api/public/learning-tree/roar and /ntua-ai-club
       → 34 nodes, 0 chapter-authored (the base tree, themed)
     /api/public/learning-tree/{unknown slug} → 404

   So the two network-wide calls together are ~16 KB gzipped — cheaper
   than one event cover — and are eager. The per-chapter tree is 84 KB
   gzipped on the one chapter that has authored lessons, so it is lazy
   and only the destination asks for it.
*/

import { isCaptureStill } from "../lib/capture";
import { plural } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { renderInlineMarkdown } from "../lib/markdown";
import { fetchJSON, safeHttpUrl } from "../lib/net";
import { registerView, type ViewCtx } from "../lib/view";

/* ──────────────────────────────────────────────────────────────────
   The live shapes

   Deliberately NOT lib/bundle.ts's TreeNode/TreeData: those describe an
   older payload (layer, description, content_path) that this endpoint
   no longer returns. These are the fields the responses actually carry.
   ────────────────────────────────────────────────────────────────── */

/** One of the seven ordered chapters of the network curriculum. */
export interface CurriculumChapter {
  id: string;
  title: string;
  description: string;
  /** "Beginner" | "Intermediate" | "Advanced" | "Tool guides" — free
   *  text from the content repo, rendered verbatim. */
  level: string;
  /** Learning-tree node ids, in teaching order. */
  nodes: string[];
}

export interface CurriculumData {
  chapters: CurriculumChapter[];
}

/** A node of the learning tree. `source` is "base" for the 34 network
 *  lessons and "chapter" for ones an eboard wrote. */
export interface TreeLesson {
  id: string;
  title: string;
  summary: string | null;
  thumbnail: string | null;
  /** "beginner" | "intermediate" | "advanced" — null on every
   *  chapter-authored node (verified: 0 of MSOE's 62 set it). */
  difficulty: string | null;
  /** Null on every chapter-authored node, likewise. */
  estimated_minutes: number | null;
  source: string;
  /** The base node a chapter node hangs off. */
  parent_ref: string | null;
  sort_order: number;
}

export interface TreeResponse {
  chapter: { slug: string; name: string; theme_primary: string } | null;
  nodes: TreeLesson[];
}

/** Everything both surfaces need, resolved once. */
export interface CurriculumFloor {
  /** The seven chapters in teaching order, or null if that call failed. */
  chapters: CurriculumChapter[] | null;
  /** Base-tree lessons by id, for thumbnails and durations. Empty if
   *  that call failed. */
  byId: Map<string, TreeLesson>;
  /** The path in teaching order — the curriculum's node lists flattened
   *  and resolved against the tree. Falls back to STARTER_PATH. */
  path: TreeLesson[];
}

/* The dashboard is the only origin this site reads data from. main.ts
   holds the same constant privately; when it exports one, delete this. */
const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/** How many lessons the Home band shows. Six is what fits above the
 *  partner band on a 375 px phone without becoming a list to scroll. */
const HOME_LESSONS = 6;

/** How many lesson rows a curriculum band shows before the head's count
 *  carries the rest. Only two of the seven chapters exceed this. */
const BAND_LESSONS = 5;

/* ──────────────────────────────────────────────────────────────────
   The build-time floor

   The brief specifies `sort_order` as the ordering for the Home band.
   It is not usable: all 34 base nodes return sort_order 0, so "the
   first six" would be array order, which is reverse-alphabetical —
   "Virtual environments" third, before "What is programming". The
   curriculum endpoint is the only source of a teaching order, so it is
   fetched alongside the tree rather than only on the destination.

   These six are that order's first six, frozen at build time, and they
   are the answer to both ways the network can fail us: no curriculum
   means no order, and no tree means no thumbnails. Either way a
   visitor still gets six real lessons with real durations.
   ────────────────────────────────────────────────────────────────── */
const STARTER_PATH: TreeLesson[] = [
  {
    id: "foundations/what-is-ai",
    title: "What Is AI? The Real Story",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 20,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
  {
    id: "foundations/setting-up-cursor",
    title: "Set Up Your Coding Workspace",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 30,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
  {
    id: "foundations/navigating-an-ide",
    title: "Navigating an IDE: Finding Your Way Around Cursor",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 25,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
  {
    id: "foundations/first-conversation-with-ai",
    title: "Review Your First AI-Generated Program",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 25,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
  {
    id: "foundations/what-is-programming",
    title: "What Is Programming? Code, Languages, and How Computers Think",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 20,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
  {
    id: "foundations/files-folders-terminal",
    title: "Files, Folders, and the Terminal",
    summary: null,
    thumbnail: null,
    difficulty: "beginner",
    estimated_minutes: 30,
    source: "base",
    parent_ref: null,
    sort_order: 0,
  },
];

/* ──────────────────────────────────────────────────────────────────
   Fetching
   ────────────────────────────────────────────────────────────────── */

let floorPromise: Promise<CurriculumFloor> | null = null;

async function loadFloor(): Promise<CurriculumFloor> {
  const [tree, curriculum] = await Promise.all([
    fetchJSON<TreeResponse>(`${DASHBOARD_ORIGIN}/api/public/learning-tree`),
    fetchJSON<CurriculumData>(`${DASHBOARD_ORIGIN}/api/public/curriculum`),
  ]);

  const byId = new Map<string, TreeLesson>();
  for (const n of tree?.nodes ?? []) byId.set(n.id, n);

  const chapters = curriculum?.chapters?.length ? curriculum.chapters : null;

  // The path: the curriculum's order, resolved to real nodes. A node id
  // the tree doesn't know is skipped rather than rendered hollow — today
  // the two lists match exactly, 34 for 34, but they are two deploys.
  let path: TreeLesson[] = [];
  if (chapters) {
    for (const c of chapters) {
      for (const id of c.nodes) {
        const node = byId.get(id);
        if (node) path.push(node);
      }
    }
  }
  if (path.length < HOME_LESSONS) {
    // Either call failed, or they disagree badly enough that the order
    // is not trustworthy. Fall back to the frozen six, upgraded with
    // whatever the tree did give us (thumbnails, live summaries).
    path = STARTER_PATH.map((s) => byId.get(s.id) ?? s);
  }

  return { chapters, byId, path };
}

/**
 * Start the two network-wide curriculum calls. Call this once at boot,
 * in parallel with fetchBundle — NOT lazily. The Home band it feeds is
 * the only content on 8 of the 12 chapters, so a chapter site that
 * waits for a tab click to fetch it is a chapter site that renders
 * empty. At ~16 KB gzipped for both calls that is a price worth paying
 * on every load.
 *
 * Safe to call more than once: the first call owns the request and
 * every later caller gets the same promise.
 */
export function startCurriculumFetch(): Promise<CurriculumFloor> {
  if (!floorPromise) floorPromise = loadFloor();
  return floorPromise;
}

/** Drop the memoised result so the next call refetches. Used only by
 *  the floor retry — a chapter whose whole page is this band gets one
 *  more attempt before it falls back to the frozen six. */
function resetCurriculumFetch(): void {
  floorPromise = null;
}

/* ──────────────────────────────────────────────────────────────────
   Rendering primitives
   ────────────────────────────────────────────────────────────────── */

/** "beginner" → "Beginner". The endpoint stores difficulty lowercase;
 *  the level on a curriculum chapter is already title case and is
 *  rendered verbatim, because it can also read "Tool guides". */
function difficultyLabel(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * A lesson summary, ready for a row.
 *
 * Summaries are authored, and one of MSOE's 62 uses `**bold**` — which
 * is why this goes through the shared inline renderer rather than a
 * plain escape that would print the asterisks. That renderer is also
 * the escaping boundary (audit 2026-08-18, finding 4), so nothing here
 * escapes by hand.
 *
 * Link syntax is flattened to its label first: the row is itself an
 * anchor, and an `<a>` inside an `<a>` is invalid markup the browser
 * repairs by closing the row early. None of the 130 live summaries has
 * a link; this is so the first one that does degrades to plain text
 * instead of breaking the row.
 */
function lessonSummary(raw: string | null): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  return renderInlineMarkdown(
    text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1"),
  );
}

/** Thumbnails are absolute URLs the dashboard hands us, and a chapter's
 *  own lessons point at whatever host the eboard uploaded to (MSOE's are
 *  on msoe-ai-club.github.io). Scheme-validate before it reaches an src. */
function thumbSrc(node: TreeLesson): string | null {
  return node.thumbnail ? safeHttpUrl(node.thumbnail) : null;
}

/** In capture mode the thumbs load eagerly: `loading="lazy"` leaves a
 *  below-the-fold row blank when the screenshot is taken, and a capture
 *  of empty boxes is not a capture of the page. */
function thumbHtml(src: string): string {
  const load = isCaptureStill() ? "eager" : "lazy";
  return `<img class="rec__thumb" src="${escapeAttr(src)}" alt="" loading="${load}" decoding="async" />`;
}

/**
 * One lesson row.
 *
 * It is an anchor to the lesson inside the full tree page, so it works
 * with no JavaScript, works on a phone where the canvas is hidden, and
 * survives a cmd-click into a new tab. When the canvas is on screen the
 * click handler intercepts it and moves the canvas instead — see
 * wireDeepLinks().
 *
 * `href` is empty when the tree page is unreachable (no content_url).
 * Rather than render a dead control we render a plain div: the row
 * still carries the lesson, it just does not pretend to go anywhere.
 */
function lessonRow(node: TreeLesson, topic: string, href: string, bandLevel = ""): string {
  const chips: string[] = [];
  // Chapter-authored lessons carry neither field — verified, 0 of
  // MSOE's 62 — so their rows carry no chips rather than a "null min".
  //
  // Inside a band the difficulty chip only earns its place when it
  // disagrees with the band's own level: four "Beginner" chips under a
  // heading that already says Beginner is the drumbeat, while the three
  // beginner lessons inside "Build an AI application · Intermediate"
  // are telling you something.
  if (node.difficulty && node.difficulty.toLowerCase() !== bandLevel.toLowerCase()) {
    chips.push(`<span class="chip">${escapeHtml(difficultyLabel(node.difficulty))}</span>`);
  }
  if (node.estimated_minutes && node.estimated_minutes > 0) {
    chips.push(`<span class="chip chip--num">${node.estimated_minutes} min</span>`);
  }

  const summary = lessonSummary(node.summary);
  const src = thumbSrc(node);
  // No thumbnail means no image element — never a grey box standing in
  // for one. The lead column collapses to nothing instead, which is why
  // the width is a custom property set per row rather than a class:
  // .rec--node's 64px would otherwise leave a hole where a picture is
  // not coming. Live, all 34 base lessons have one; this is the path
  // taken when the tree call failed and the frozen six are showing.
  const lead = src ? thumbHtml(src) : "<span></span>";
  const bare = src ? "" : ` style="--rec-lead:0px"`;
  const inner = `
    <div class="rec__main">
      ${lead}
      <div class="rec__body">
        <div class="rec__title">${escapeHtml(node.title)}</div>
        ${summary ? `<div class="rec__sub">${summary}</div>` : ""}
        ${chips.length ? `<div class="rec__meta">${chips.join("")}</div>` : ""}
      </div>
      <span class="rec__go" aria-hidden="true">→</span>
    </div>`;

  if (!href) return `<div class="rec rec--node"${bare}>${inner}</div>`;
  return `<a class="rec rec--node"${bare} href="${escapeAttr(href)}" target="_blank" rel="noopener"
    data-learn-topic="${escapeAttr(topic)}" data-learn-node="${escapeAttr(node.id)}">${inner}</a>`;
}

/* ──────────────────────────────────────────────────────────────────
   Home — the "Start here" band
   ────────────────────────────────────────────────────────────────── */

export interface StartHereOptions {
  /**
   * True when this band is the whole page: the chapter has no events
   * and no officers. Then a failed fetch retries once, and if that
   * fails too the six frozen lessons render without thumbnails — the
   * band is never allowed to be the reason the page is blank.
   *
   * False on a chapter with other content: a failed fetch removes the
   * band silently, because nothing below it depends on it.
   */
  isFloor: boolean;
}

/**
 * Fill Home's "Start here" band — head and rows both, so a failed
 * fetch cannot leave an orphan heading behind.
 *
 * Returns false when the network gave us nothing, which is the caller's
 * signal to remove the band's section entirely — a chapter with events
 * and officers loses this band rather than showing a thinner copy of
 * it. A floor chapter never gets that answer.
 *
 * Sets `data-learn-ready="1"` on the target once the rows are in the
 * DOM: `?still=1` disables animation but cannot make a network call
 * instant, so a screenshot recipe waits on this attribute the same way
 * it waits on a non-empty #hero-title.
 */
export async function renderStartHereBand(
  target: HTMLElement | null,
  opts: StartHereOptions,
): Promise<boolean> {
  if (!target) return false;

  let floor = await startCurriculumFetch();
  // An empty byId means the tree call itself failed — the one failure
  // the frozen six exist for, because it costs the rows their
  // thumbnails and summaries.
  if (!floor.byId.size) {
    if (!opts.isFloor) return false;
    // One retry, and only here. A chapter with events and officers can
    // lose this band without the page suffering; a chapter without them
    // cannot, so it is worth a second request before the frozen six.
    resetCurriculumFetch();
    floor = await startCurriculumFetch();
  }

  const lessons = floor.path.slice(0, HOME_LESSONS);
  if (!lessons.length) return false;

  target.innerHTML = `
    <div class="band-head">
      <h2 class="band-head__title">Start here</h2>
      <a class="band-head__link" href="#learn">Open the learning tree →</a>
    </div>
    <div class="learn-rows">
      ${lessons
        .map((n) => {
          const topic = topicOf(floor, n.id);
          return lessonRow(n, topic, fullMapHref(topic, n.id));
        })
        .join("")}
    </div>`;
  target.dataset.learnReady = "1";
  return true;
}

/** Which curriculum chapter teaches this lesson — the topic a click on
 *  it should open the canvas at. "" when the curriculum call failed. */
function topicOf(floor: CurriculumFloor, nodeId: string): string {
  for (const c of floor.chapters ?? []) {
    if (c.nodes.includes(nodeId)) return c.id;
  }
  return "";
}

/* ──────────────────────────────────────────────────────────────────
   The tree page's URL

   Both links out and the canvas itself are built from URLs that already
   exist in the DOM, never from config: loadLearningTree() has already
   pointed #tree-link at {content_url}/tree.html?chapter={slug}, and
   activateLearningTree() sets the iframe's src from the same pair. That
   keeps one owner for content_url and means a fork that changes it does
   not have to change this file too.
   ────────────────────────────────────────────────────────────────── */

/** The full tree page for this chapter, or "" when the content site is
 *  not configured — in which case no link is rendered at all, rather
 *  than one that goes nowhere. */
function fullMapHref(topic = "", node = ""): string {
  const link = document.getElementById("tree-link") as HTMLAnchorElement | null;
  const raw = link?.getAttribute("href") ?? "";
  if (!raw || raw === "#") return "";
  const safe = safeHttpUrl(raw);
  if (!safe) return "";
  const url = new URL(safe);
  if (topic) url.searchParams.set("topic", topic);
  if (node) url.searchParams.set("node", node);
  return url.href;
}

/**
 * Point the embedded canvas at a chapter of the curriculum.
 *
 * Reads the iframe's current src rather than rebuilding it, so whatever
 * activateLearningTree() put there — content_url, ?embed=1, the chapter
 * slug — is preserved exactly. An empty src means activateLearningTree()
 * has not run or there is no content_url; either way there is nothing to
 * steer and the index stands on its own.
 *
 * Only writes when the URL actually changes. Assigning the same src
 * would reload the canvas, and the canvas takes seconds to paint.
 */
function syncTreeFrame(topic: string, node: string): void {
  const frame = document.getElementById("learn-tree-frame") as HTMLIFrameElement | null;
  if (!frame || !frame.src) return;
  let url: URL;
  try {
    url = new URL(frame.src);
  } catch {
    return;
  }
  if (topic) url.searchParams.set("topic", topic);
  else url.searchParams.delete("topic");
  if (node) url.searchParams.set("node", node);
  else url.searchParams.delete("node");
  if (url.href === frame.src) return;
  frame.src = url.href;
}

/* ──────────────────────────────────────────────────────────────────
   The Learn destination
   ────────────────────────────────────────────────────────────────── */

/**
 * The topic named by the URL, from `#learn/{chapterId}`.
 *
 * Reading this costs nothing and makes a shared link work the moment
 * the router learns to parse a sub-route — today getValidPageFromHash()
 * compares the whole hash against the page keys, so `#learn/python` on
 * a cold load lands on Home. See the note on wireDeepLinks() for why
 * this view never writes a sub-route with location.hash.
 */
function topicFromHash(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const [key, rest] = hash.split("/");
  return key === "learn" && rest ? decodeURIComponent(rest) : "";
}

/** A curriculum chapter as a band: its head, then up to five of its
 *  lessons. The head is the click target for the whole chapter. */
function curriculumBand(c: CurriculumChapter, floor: CurriculumFloor): string {
  const lessons = c.nodes
    .map((id) => floor.byId.get(id))
    .filter((n): n is TreeLesson => Boolean(n));
  if (!lessons.length) return "";

  const href = fullMapHref(c.id);
  const headInner = `
    <span class="learn-band__name">${escapeHtml(c.title)}</span>
    <span class="chip">${escapeHtml(c.level)}</span>
    <span class="learn-band__n">${plural(lessons.length, "lesson")}</span>`;
  const head = href
    ? `<a class="learn-band__head" href="${escapeAttr(href)}" target="_blank" rel="noopener"
         data-learn-topic="${escapeAttr(c.id)}">${headInner}</a>`
    : `<div class="learn-band__head">${headInner}</div>`;

  return `
    <div class="learn-band" data-learn-band="${escapeAttr(c.id)}">
      ${head}
      ${lessons
        .slice(0, BAND_LESSONS)
        .map((n) => lessonRow(n, c.id, fullMapHref(c.id, n.id), c.level))
        .join("")}
    </div>`;
}

/** Order a chapter's own lessons the way the path above them reads:
 *  by where their parent lesson sits in the curriculum, then by the
 *  eboard's own sort_order within that parent, then by title. Both are
 *  fields the payload states — nothing here is inferred. */
function orderAuthored(nodes: TreeLesson[], floor: CurriculumFloor): TreeLesson[] {
  const pathIndex = new Map<string, number>();
  floor.path.forEach((n, i) => pathIndex.set(n.id, i));
  return [...nodes].sort((a, b) => {
    const pa = pathIndex.get(a.parent_ref ?? "") ?? Number.MAX_SAFE_INTEGER;
    const pb = pathIndex.get(b.parent_ref ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Click handling for every band head and lesson row.
 *
 * Each is a real anchor into the full tree page, so a phone (where the
 * canvas is not shown), a cmd-click and a JS failure all still reach
 * the lesson. When the canvas is on screen we intercept a plain click
 * and steer it instead, which is the faster answer and keeps the
 * visitor on the chapter's own site.
 *
 * The URL is kept truthful with replaceState rather than by assigning
 * location.hash. A hash assignment fires hashchange, and the router's
 * getValidPageFromHash() matches the whole hash against the page keys —
 * so `#learn/python` would resolve to no page and bounce the visitor to
 * Home. replaceState changes the address bar without firing it, so the
 * URL is shareable now and becomes a working deep link the moment the
 * router splits a sub-route off. See the request in the report.
 */
function wireDeepLinks(root: HTMLElement): void {
  root.addEventListener("click", (ev) => {
    const e = ev as MouseEvent;
    // Leave every "open in a new tab" gesture alone.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const hit = target?.closest<HTMLElement>("[data-learn-topic]");
    if (!hit) return;

    const frame = document.getElementById("learn-tree-frame") as HTMLIFrameElement | null;
    // No canvas to steer (no content_url, or the fallback took over, or
    // the phone layout hides it) — let the anchor do its job.
    if (!frame || !frame.src || frame.hidden || !frame.offsetParent) return;

    e.preventDefault();
    const topic = hit.dataset.learnTopic ?? "";
    const node = hit.dataset.learnNode ?? "";
    setActiveTopic(root, topic);
    syncTreeFrame(topic, node);
  });
}

/** Mark which band the canvas is showing, and keep the address bar
 *  honest about it. */
function setActiveTopic(root: HTMLElement, topic: string): void {
  root.querySelectorAll<HTMLElement>("[data-learn-band]").forEach((b) => {
    b.classList.toggle("learn-band--active", b.dataset.learnBand === topic);
  });
  const link = document.getElementById("learn-full-map") as HTMLAnchorElement | null;
  if (link) {
    const href = fullMapHref(topic);
    if (href) link.href = href;
  }
  try {
    const url = new URL(window.location.href);
    url.hash = topic ? `learn/${encodeURIComponent(topic)}` : "learn";
    window.history.replaceState(null, "", url.href);
  } catch {
    // A browser that refuses the state change loses only the address
    // bar; the canvas and the index are already correct.
  }
}

/** Make room for the index above the canvas and the map link below it.
 *  index.html ships the section with only the canvas in it, so the
 *  destination builds its own containers rather than depending on
 *  markup this file does not own. */
function ensureContainers(section: HTMLElement): HTMLElement | null {
  const inner = section.querySelector<HTMLElement>(".section__inner");
  const wrap = section.querySelector<HTMLElement>(".learn-tree-wrap");
  if (!inner) return null;

  const existing = document.getElementById("learn-index");
  const index = existing ?? document.createElement("div");
  if (!existing) {
    index.id = "learn-index";
    index.className = "learn-index";
    inner.insertBefore(index, wrap ?? inner.firstChild);
  }

  const href = fullMapHref();
  if (wrap && href && !document.getElementById("learn-full-map")) {
    const p = document.createElement("p");
    p.className = "section__footer";
    const a = document.createElement("a");
    a.className = "link link--arrow";
    a.id = "learn-full-map";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = href;
    a.textContent = "Open the full map ↗";
    p.appendChild(a);
    wrap.insertAdjacentElement("afterend", p);
  }

  return index;
}

/**
 * The chapter's own lessons, fetched lazily and appended when they
 * arrive. 84 KB gzipped on MSOE and identical to the base tree on the
 * other eleven chapters, so this never blocks the index and never runs
 * at boot.
 */
async function appendAuthored(
  index: HTMLElement,
  floor: CurriculumFloor,
  slug: string,
): Promise<void> {
  if (!slug) return;
  const tree = await fetchJSON<TreeResponse>(
    `${DASHBOARD_ORIGIN}/api/public/learning-tree/${encodeURIComponent(slug)}`,
  );
  const authored = (tree?.nodes ?? []).filter((n) => n.source !== "base");
  if (!authored.length) return; // 11 of 12 chapters: no zone, no empty state.

  const name = tree?.chapter?.name?.trim() || "this chapter";
  // Zone heads and bands are siblings inside .learn-index so that its
  // own `display: flex; gap: 0.6rem` spaces the whole destination. The
  // one inline value is the air above a second zone head, which the
  // stylesheet has no rule for because this is the only place two zones
  // ever meet.
  index.insertAdjacentHTML(
    "beforeend",
    `<div class="group__head" style="margin-top:1.75rem">
      <span class="group__title">From ${escapeHtml(name)}</span>
      <span class="group__n">${plural(authored.length, "lesson")} they wrote</span>
    </div>
    <div class="learn-rows">
      ${orderAuthored(authored, floor)
        .map((n) => {
          // An authored lesson hangs off a base one, so it opens the
          // canvas at whichever chapter of the path teaches its parent.
          const topic = topicOf(floor, n.parent_ref ?? "");
          return lessonRow(n, topic, fullMapHref(topic, n.id));
        })
        .join("")}
    </div>`,
  );
}

registerView("learn", (ctx: ViewCtx) => {
  void mountLearn(ctx);
});

async function mountLearn(ctx: ViewCtx): Promise<void> {
  const section = ctx.el("sec-learn");
  if (!section) return;
  const index = ensureContainers(section);
  if (!index) return;

  const floor = await startCurriculumFetch();
  if (!floor.chapters?.length) {
    // No order means no index. The canvas below is the whole
    // destination, which is what shipped before this view existed —
    // a worse page, not a broken one.
    index.remove();
    return;
  }

  index.innerHTML = `
    <div class="group__head">
      <span class="group__title">The path</span>
      <span class="group__n">${plural(floor.path.length, "lesson")}</span>
    </div>
    ${floor.chapters.map((c) => curriculumBand(c, floor)).join("")}`;
  index.dataset.learnReady = "1";

  wireDeepLinks(index);

  // A topic named by the URL wins. This runs after showPage() has
  // returned — every path into here has awaited at least one promise —
  // so activateLearningTree() has already set the canvas's src and this
  // steers it rather than being overwritten by it.
  const wanted = topicFromHash();
  if (wanted && floor.chapters.some((c) => c.id === wanted)) {
    setActiveTopic(index, wanted);
    syncTreeFrame(wanted, "");
  }

  await appendAuthored(index, floor, ctx.slug);
}
