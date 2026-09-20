/* Learn — the curriculum destination, and the floor under every chapter.

   Two surfaces read this file's one dataset:

   1. Home's "The learning tree" Explore block — the lesson count, the
      first lesson and its thumbnail. It is the reason a chapter with
      no events, no officers and no projects still reads as a club: 8
      of the 12 live chapters have nothing else, and this is a real
      curriculum a visitor can start today. main.ts renders it; this
      file only resolves the floor it reads (startCurriculumFetch).
   2. The `learn` view is the tree itself, full width, and nothing
      else. The native index that used to sit above the canvas — "The
      path", the seven curriculum bands, up to five lesson rows each —
      is gone (Ben, 2026-09-18: "Learn page should just be learning
      tree"). What the view still owns is the canvas's floor: the same
      path as rows, shown in the two states where the canvas is not
      the answer — a phone, where the embedded tree paints nothing,
      and a canvas that did not load. See the note above the
      destination for both measurements.

   Because both read the same two endpoints, the fetch is started once,
   eagerly, in parallel with the bundle — see startCurriculumFetch().

   MEASURED LIVE, 2026-09-18 (all `access-control-allow-origin: *`,
   `cache-control: public, max-age=60, s-maxage=300`):
     /api/public/learning-tree          28,708 B raw /  5,271 B gzipped
       → 34 base nodes, 34/34 with a thumbnail, difficulty and minutes
     /api/public/curriculum             35,083 B raw / 10,957 B gzipped
       → 7 ordered chapters covering all 34 nodes, plus a flat lessons[]
     /api/public/learning-tree/{slug}   → the chapter's merged tree

   So the two network-wide calls together are ~16 KB gzipped — cheaper
   than one event cover — and are eager. The per-chapter tree is no
   longer fetched by this file at all: the canvas asks the content site
   for it with &chapter={slug}, which is one request instead of two for
   the same 84 KB.
*/

import { isCaptureStill } from "../lib/capture";
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
 * with no JavaScript, works on a phone, and survives a cmd-click into a
 * new tab. Nothing intercepts the click any more: the canvas and the
 * rows are never on screen together, because the rows only exist where
 * the canvas could not render.
 *
 * `href` is empty when the tree page is unreachable (no content_url).
 * Rather than render a dead control we render a plain div: the row
 * still carries the lesson, it just does not pretend to go anywhere.
 */
function lessonRow(node: TreeLesson, href: string): string {
  const chips: string[] = [];
  // Chapter-authored lessons carry neither field — verified, 0 of
  // MSOE's 62 — so their rows carry no chips rather than a "null min".
  if (node.difficulty) {
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
  return `<a class="rec rec--node"${bare} href="${escapeAttr(href)}" target="_blank" rel="noopener">${inner}</a>`;
}

/* Home's "Start here" band is gone, and renderStartHereBand with it.
   Six lesson rows under a heading were the landing page's floor; the
   floor is now one Explore block — the first lesson's thumbnail, the
   lesson count, and what it starts with — which sits beside three
   other blocks instead of being a band of its own. main.ts builds it
   from the same CurriculumFloor this module resolves.

   The one thing that did not survive the move is the floor's single
   retry (resetCurriculumFetch): the band would refetch once on a
   chapter whose whole page it was. The Explore block degrades instead
   — no count, no thumbnail, the copy and the link intact — and it is
   never the only thing on the page, because the Network block beside
   it needs no network call at all. */

/** Which curriculum chapter teaches this lesson — the topic the tree
 *  page should open at. "" when the curriculum call failed. */
function topicOf(floor: CurriculumFloor, nodeId: string): string {
  for (const c of floor.chapters ?? []) {
    if (c.nodes.includes(nodeId)) return c.id;
  }
  return "";
}

/** The tree page, opened at one lesson. */
function lessonHref(floor: CurriculumFloor, node: TreeLesson): string {
  return fullMapHref(topicOf(floor, node.id), node.id);
}

/* ──────────────────────────────────────────────────────────────────
   The tree page's URL

   Links out are built from a URL that already exists in the DOM, never
   from config: loadLearningTree() has already pointed #tree-link at
   {content_url}/tree.html?chapter={slug}. That keeps one owner for
   content_url and means a fork that changes it does not have to change
   this file too.
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

/* ──────────────────────────────────────────────────────────────────
   The Learn destination — the canvas, or the same path as rows

   index.html ships this section as the canvas well and its lazy
   iframe; main.ts owns the iframe's src and its 8-second load timer.
   This view adds the two things that markup cannot carry: the link
   out to the full map, and the curriculum as rows for the two states
   where the canvas is not the answer.

   MEASURED 2026-09-18, and the reason the rows exist at all: the
   content site's tree.html renders nothing inside a 375px-wide frame.
   It loads — the `load` event fires, so main.ts's timeout never trips
   — and paints an empty canvas, verified over 18 seconds against
   msoe-ai-club. Opened directly at the same width in its own tab it
   draws fine, so this is the embed, not the page. A phone therefore
   gets the rows, and "Open the full map ↗" hands it the canvas in the
   tab where the canvas works.

   The rows and the canvas never share the page. There is no index
   above the canvas any more, which is also why nothing here
   intercepts a click to steer it: a row is an anchor to the tree
   page and that is all it is.
   ────────────────────────────────────────────────────────────────── */

/** Set on the section when the canvas is out, so the rows take the
 *  page at every width. Paired with `.learn--no-canvas` in hub.css. */
const NO_CANVAS = "learn--no-canvas";

/**
 * Build the two children index.html does not ship: the rows'
 * container, and the link to the full map under it.
 *
 * Built here rather than in the markup because both depend on
 * something only this file knows — the rows on a fetch, the link on
 * whether there is a content site to link to at all. Returns the row
 * container, or null when the section has no canvas well to sit
 * beside (a fork that stripped it).
 */
function ensureContainers(section: HTMLElement): HTMLElement | null {
  const wrap = section.querySelector<HTMLElement>(".learn-tree-wrap");
  if (!wrap) return null;

  const existing = document.getElementById("learn-list");
  const list = existing ?? document.createElement("div");
  if (!existing) {
    list.id = "learn-list";
    list.className = "learn-list";
    wrap.insertAdjacentElement("afterend", list);
  }

  // No content site means no map to open, and a link that goes
  // nowhere is worse than no link — the same rule the rows follow.
  const href = fullMapHref();
  if (href && !document.getElementById("learn-full-map")) {
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
    list.insertAdjacentElement("afterend", p);
  }

  return list;
}

/**
 * The whole path as rows, rendered whether or not it is the visible
 * half of the page.
 *
 * Unconditional because the two states that reveal it arrive at
 * different times and neither is worth a second decision: the phone
 * one is a media query this file would have to guess a breakpoint to
 * read, and the failure one lands eight seconds after the tab opens,
 * which is eight seconds of blank if the rows wait for it. The cost
 * on a desktop that never shows them is ~34 anchors of markup and no
 * pixels — their thumbnails are lazy and a display:none container
 * never fetches them.
 *
 * The two calls behind this are already in flight; they start at boot
 * for Home's "Start here" band. floor.path is never empty — a
 * half-failed fetch still leaves the six frozen lessons — so there is
 * always something real to render.
 */
async function fillLearnList(target: HTMLElement): Promise<void> {
  const floor = await startCurriculumFetch();
  if (!floor.path.length) return;
  target.innerHTML = `
    <div class="learn-rows">
      ${floor.path.map((n) => lessonRow(n, lessonHref(floor, n))).join("")}
    </div>`;
  target.dataset.learnReady = "1";
}

/**
 * Notice when the canvas is out, and hand the page to the rows.
 *
 * main.ts hides the iframe in both of its failure paths — no
 * content_url at boot, and a load that has not fired after eight
 * seconds — so `hidden` on the frame is the one signal that covers
 * both, and reading it here leaves both timers where they belong.
 *
 * Installed synchronously: showPage() mounts this view and then calls
 * activateLearningTree(), so it is watching before the timer that
 * trips it starts.
 */
function watchCanvas(section: HTMLElement): void {
  const frame = document.getElementById("learn-tree-frame");
  if (!frame || frame.hidden) {
    // No canvas in the markup, or main.ts already gave up on it.
    section.classList.add(NO_CANVAS);
    return;
  }
  const obs = new MutationObserver(() => {
    if (!frame.hidden) return;
    obs.disconnect(); // main.ts never un-hides it again.
    section.classList.add(NO_CANVAS);
  });
  obs.observe(frame, { attributes: true, attributeFilter: ["hidden"] });
}

registerView("learn", (ctx: ViewCtx) => {
  const section = ctx.el("sec-learn");
  if (!section) return;
  watchCanvas(section);
  const list = ensureContainers(section);
  if (list) void fillLearnList(list);
});
