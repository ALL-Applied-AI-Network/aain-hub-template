/* The board — the chapter's standings, and the recognition that hangs
   off them.

   This used to be the Members destination. It is now three render
   functions the landing page composes, because the board is the front
   page: a visitor should see who is doing the work before they see
   anything else this club says about itself. Officers are not on it —
   they are people, not competitors, and they live on About.

   Nothing here mounts itself. `renderBoard`, `renderBadgeWall` and
   `renderMerch` each fill a host element the caller owns and report
   whether they had anything to say, so the composer can drop a band
   rather than print an empty one.

   The counting laws the board is built on:

   - Dense ranking off points, computed here. The API hands back rank 1
     and rank 2 for MSOE's two members who both have 88 points; equal
     scores share a rank and the next distinct score skips past it, so
     that tie reads 1, 1, 3.
   - No medals, at all. The old board put an SVG medal on a rank only
     when that rank was held by one member, which meant the richest
     chapter in the network — whose board opens 88, 88, 83 — got no
     mark on its leaders at all, and the top of the board looked like
     the middle of it. The leaders are marked by a rule and a coloured
     rank instead, which is a treatment a tie cannot break: both
     88-point members are rank 1 and both are marked, and neither is
     claimed as the winner.
   - Never print a zero. events_attended is 0 for most of MSOE's top 20
     (the check-in rows predate the import), and "0 events" next to 88
     points reads as broken data — so the line is dropped, not zeroed.
     Same for a badge nobody has earned and a merch item with no price.
   - No bar, no percentage of the leader, no count-up. The points are
     the claim; a bar behind them is a second, made-up claim about the
     distance between two students.
   - The board is everyone, not a cap. The bundle carries the first
     page and the chapter's own total, and the rest pages in from
     /api/public/chapter/{slug}/leaderboard as the viewer reaches the
     end of it — so a member can find their own name whether they are
     3rd or 431st, which is the whole reason the board is the front
     page. A bundle that predates that total is handled by NOT
     inventing one: see boardTotal() below.
*/

import type {
  BadgeRow,
  Bundle,
  LeaderboardBadge,
  LeaderboardRow,
  MerchRow,
} from "../lib/bundle";
import { plural } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { DASHBOARD_ORIGIN } from "../lib/net";
import { renderBadgeIcon } from "../lib/primitives";

/** Board rows at which the search box earns its place. Below this the
 *  whole board is on one screen and a search box is furniture; at or
 *  above it a member scanning for their own name is scrolling. It sits
 *  inside the board frame and filters from the very first row. */
const SEARCH_AT = 8;

/** Rows per later page. The endpoint caps `limit` at 100. */
const PAGE_SIZE = 100;

/** Rows a phone shows before "Show everyone". There is no inner
 *  scroller at that width — a scroll box in the middle of a page
 *  catches the thumb on iOS and the page stops moving — so the board
 *  is collapsed by CSS and this is the number the CSS cuts at. Keep
 *  the two in step: hub.css `.board__rows > .board__row:nth-child(n+13)`. */
const PHONE_ROWS = 12;

/** Rows below which the status row says nothing. A foot that counts to
 *  six under a board of six is the board reading itself back. */
const STATUS_AT = 10;

/** Search that has to wait for the rest of the board debounces at this;
 *  a keystroke is not a query. */
const SEARCH_DEBOUNCE_MS = 150;

/** Hits at which a search highlights the rows it found. Above this the
 *  filter IS the answer and highlighting most of the board says
 *  nothing. */
const HIGHLIGHT_AT = 3;

/** Rows a board needs before "the leaders" is a meaningful group. On a
 *  two-row board, marking the top row marks half the board. */
const LEAD_AT = 3;

/** The other half of the leader rule. WSU's whole board is seven
 *  members tied on the same score (verified live, 2026-09-18), so rank
 *  1 there is everybody — and a mark every row carries marks nothing.
 *  The leaders are highlighted only when they are a strict minority of
 *  the board, which is the only case where the mark says anything. */
function leadersAreAMinority(atRankOne: number, total: number): boolean {
  return atRankOne < total - atRankOne;
}

/** The column header earns its place once the board is long enough to
 *  be scanned rather than read. Two rows do not need labelling. */
const HEADER_AT = LEAD_AT;

/** Badge marks beside a name: one carries its full name, the rest are
 *  icons, and past this the remainder collapses into a +N. */
const MAX_ROW_BADGES = 4;

/* ── Building blocks ─────────────────────────────────────────────── */

/** A sub-block's head: what this block is, and at most one line. */
function blockHead(title: string, desc?: string): string {
  return `
    <div class="block-head">
      <h3 class="section__subhead">${escapeHtml(title)}</h3>
      ${desc ? `<p class="section__desc">${escapeHtml(desc)}</p>` : ""}
    </div>
  `;
}

/**
 * Badge icons are emoji, an uploaded URL, or one of five built-in
 * names, mixed inside one chapter. The emoji branch lives in
 * renderBadgeIcon itself (src/lib/primitives.ts) so every surface gets
 * it; this stays as a named export because the name says what the call
 * is for and other modules already reach for it.
 */
export function badgeIcon(icon: string): string {
  return renderBadgeIcon((icon ?? "").trim());
}

/**
 * The badge marks beside a name.
 *
 * The first badge is named in full. That is the whole point of the
 * change: three of MSOE's 27 badge icons resolve to the same trophy
 * SVG, so a row of tinted squares said "this member has badges"
 * without ever saying which — the marks read as the board's
 * decoration rather than as that member's record. One name makes them
 * hers. The rest stay as icons, because twenty rows of three full
 * badge names is a text wall.
 */
function renderRowBadges(badges: LeaderboardBadge[] | undefined): string {
  if (!badges?.length) return "";
  const [first, ...rest] = badges.slice(0, MAX_ROW_BADGES);
  const overflow = badges.length - 1 - rest.length;

  const named = `<span class="member-badge member-badge--named" title="${escapeAttr(first.name)}">${badgeIcon(first.icon)}<span class="member-badge__name">${escapeHtml(first.name)}</span></span>`;
  const marks = rest
    .map(
      (b) =>
        `<span class="member-badge" title="${escapeAttr(b.name)}" aria-label="${escapeAttr(b.name)}">${badgeIcon(b.icon)}</span>`,
    )
    .join("");
  const more =
    overflow > 0
      ? `<span class="member-badge member-badge--more" title="${overflow} more" aria-label="${overflow} more">+${overflow}</span>`
      : "";
  return `${named}${marks}${more}`;
}

/* ── Ranking ─────────────────────────────────────────────────────── */

export interface RankedRow {
  row: LeaderboardRow;
  /** Dense rank: equal points share a rank, the next distinct score
   *  skips past it. 88, 88, 83 → 1, 1, 3. */
  rank: number;
  /** True when more than one member holds this rank. Nothing on the
   *  board may claim a sole winner while this is true. */
  tied: boolean;
  /** True for every member on the board's top rank, tie or not. This
   *  is the only distinction the board draws, and it survives a tie
   *  because it names a group rather than a winner. */
  lead: boolean;
}

/**
 * Rank by points, ties sharing a rank. The rank the API sends is a row
 * number, not a ranking: MSOE's two 88-point members come back as 1 and
 * 2, which is a gold-and-silver lie sitting in the data.
 *
 * The sort is defensive — the API already orders by points desc — and
 * is stable, so members on equal points keep the order they arrived in.
 */
export function rankByPoints(rows: LeaderboardRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  const ranks: number[] = [];
  let rank = 0;
  sorted.forEach((r, i) => {
    if (i === 0 || r.points !== sorted[i - 1].points) rank = i + 1;
    ranks.push(rank);
  });
  const held = new Map<number, number>();
  for (const r of ranks) held.set(r, (held.get(r) ?? 0) + 1);

  // Leading a field of two marks half the board, and leading a board
  // where everyone is tied marks all of it. Neither says anything.
  const markLead =
    sorted.length >= LEAD_AT &&
    leadersAreAMinority(held.get(1) ?? 0, sorted.length);

  return sorted.map((row, i) => ({
    row,
    rank: ranks[i],
    tied: (held.get(ranks[i]) ?? 0) > 1,
    lead: markLead && ranks[i] === 1,
  }));
}

/**
 * The rows that are a standing. A member with no points is not one:
 * ML@IIT's board is 20 rows of 0 points against 100 members (verified
 * live, 2026-09-18), and ranked, that is twenty tied firsts each
 * printing a zero next to a real student's name. This is the
 * never-print-zero law applied to a row instead of a number.
 */
export function scoredRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return rows.filter((r) => r.points >= 1);
}

/** True when the chapter has anything to recognise — points on the
 *  board, badges it awards, or merch those points buy. Exported so the
 *  composer can decide whether "how points work" is worth explaining
 *  before it asks for any of the three blocks. */
export function hasRecognition(bundle: Bundle): boolean {
  return (
    scoredRows(bundle.leaderboard ?? []).length > 0 ||
    (bundle.badges ?? []).length > 0 ||
    (bundle.merch ?? []).length > 0
  );
}

/** Case- and accent-insensitive form of a name, for the search box. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/* ── The board ───────────────────────────────────────────────────── */

/**
 * One row.
 *
 * Three columns, and they are the same three on every row: a rank
 * gutter, the member, the points. The rank and the points are both
 * tabular and both right-aligned against a fixed track, so rank 9 and
 * rank 10 sit on the same ones column and 88 lines up under 120 — a
 * ranked list you cannot read down is a list, not a board.
 *
 * The unit ("pts") is in the DOM but visually hidden: the column
 * header says Points, so printing the unit twenty times only makes the
 * numbers ragged, while a screen reader still hears "88 pts".
 */
export function renderBoardRow({ row, rank, lead }: RankedRow): string {
  const events =
    row.events_attended >= 1
      ? `<span class="chip">${escapeHtml(plural(row.events_attended, "event"))}</span>`
      : "";
  const marks = renderRowBadges(row.badges);
  // Ranks 2 and 3 get a brighter numeral and nothing else. It is the
  // quietest possible way to say "the top of the board is here" on a
  // board you can now scroll 595 rows down, and it is rank-based, so a
  // tie on 3 brightens several rows rather than picking one of them.
  const top = !lead && (rank === 2 || rank === 3) ? " board__row--top" : "";
  return `
    <li class="board__row${lead ? " board__row--lead" : ""}${top}" data-lb-row data-name="${escapeAttr(fold(row.name))}">
      <span class="board__rank"><span class="visually-hidden">Rank </span>${rank}</span>
      <span class="board__who">
        <span class="board__name">${escapeHtml(row.name)}</span>
        <div class="board__marks">${marks}${events}</div>
      </span>
      <span class="board__pts">${row.points.toLocaleString()}<span class="visually-hidden"> ${row.points === 1 ? "pt" : "pts"}</span></span>
    </li>
  `;
}

/**
 * Ranks that continue across pages.
 *
 * rankByPoints ranks an array it can see all of. The board appends 100
 * rows at a time, and the row after the 50th has to know what the 50th
 * scored or the 51st restarts at rank 1. This keeps the three values
 * that decide the next rank and nothing else.
 *
 * Correct only while the pages arrive in the server's own order, which
 * is the contract the endpoint offers: points desc, name asc, id asc,
 * the same order the bundle's first page is in.
 */
function rankStream(seed: RankedRow[]) {
  const last = seed[seed.length - 1];
  let position = seed.length;
  let lastPoints = last?.row.points ?? Number.POSITIVE_INFINITY;
  let lastRank = last?.rank ?? 0;
  return (rows: LeaderboardRow[]): RankedRow[] =>
    rows.map((row) => {
      position++;
      const rank = row.points === lastPoints ? lastRank : position;
      lastPoints = row.points;
      lastRank = rank;
      // `tied` and `lead` are the first page's business: a row this far
      // down the board is neither, because the rows are points-descending
      // and rank 1 was decided 50 rows ago.
      return { row, rank, tied: false, lead: false };
    });
}

/**
 * How many members the board holds, or null when nobody has told us.
 *
 * `leaderboard_total` is the chapter's consent-gated board count and is
 * the only honest source for it. A bundle served by an API that
 * predates the field carries a page of rows and no total, and the
 * answer there is not to guess one from `member_count` — that counts
 * everybody, including the members who are not on the board — nor from
 * the rows in hand, which would print "20 on the board" about a board
 * whose size we do not know. With no total the board renders what it
 * was given, says nothing about a total, and pages nowhere.
 */
function boardTotal(bundle: Bundle): number | null {
  const n = bundle.leaderboard_total;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? n : null;
}

/** What `renderBoard` put in the host, so the composer knows whether
 *  the band around it has earned its place. */
export type BoardState = "board" | "note";

export interface BoardOptions {
  /** The chapter to page against. */
  slug: string;
  /** The standing invite, for the button under the empty-board note. */
  joinUrl: string | null;
  /** "MAIC", or "us" — the word that goes after "Join". */
  acronym: string;
  /** True under ?still=1, reduced motion, or no IntersectionObserver.
   *  Nothing then observes the end of the board and the later pages
   *  arrive only when a visitor asks for them, which is what makes a
   *  capture reproducible. */
  settled: boolean;
}

/**
 * Fill `host` with the standings.
 *
 * Returns "board" when real rows rendered and "note" when they did not
 * — one sentence that names the fix, plus the button that IS the fix
 * when the chapter has a standing invite. There is no third answer on
 * Home any more: the people band is the page's centrepiece, and a
 * column that removes itself leaves the eboard sitting beside a hole.
 */
export function renderBoard(
  host: HTMLElement,
  bundle: Bundle,
  opts: BoardOptions,
): BoardState {
  const first = scoredRows(bundle.leaderboard ?? []);

  if (!first.length) {
    // Two sentences, and which one is true depends on whether the
    // chapter has ever run anything. Neither is an apology.
    const note = (bundle.events ?? []).length
      ? "Points start showing up here once members check in at an event."
      : "The board fills in as members check in at events.";
    const join = opts.joinUrl
      ? `<a class="btn btn--primary" href="${escapeAttr(opts.joinUrl)}" rel="noopener">Join ${escapeHtml(opts.acronym)}</a>`
      : "";
    host.innerHTML = `
      <div class="board board--note">
        <p class="board__note">${escapeHtml(note)}</p>
        ${join}
      </div>`;
    return "note";
  }

  const ranked = rankByPoints(first);
  const total = boardTotal(bundle);
  const more = total !== null && total > first.length;

  const search =
    first.length >= SEARCH_AT
      ? `<div class="board__search">
           <input type="search" class="lb-search" placeholder="Find your name" aria-label="Find your name" aria-controls="board-rows" autocomplete="off" spellcheck="false" />
         </div>`
      : "";

  const header =
    first.length >= HEADER_AT
      ? `<div class="board__head" aria-hidden="true">
           <span class="board__h board__h--rank">Rank</span>
           <span class="board__h">Member</span>
           <span class="board__h board__h--pts">Points</span>
         </div>`
      : "";

  host.innerHTML = `
    <div class="board${more ? " board--more" : ""}" data-loaded="${first.length}"${
      total !== null ? ` data-total="${total}"` : ""
    }>
      ${search}
      <div class="board__scroll" tabindex="0" role="region" aria-label="Leaderboard">
        ${header}
        <ol class="board__rows" id="board-rows">${ranked
          .map(renderBoardRow)
          .join("")}<li class="board__sentinel" aria-hidden="true"></li></ol>
        <p class="board__empty" data-lb-empty hidden></p>
      </div>
      <p class="board__status" role="status" aria-live="polite"></p>
    </div>`;

  wireBoard(host, { ...opts, loaded: ranked, total });
  return "board";
}

/**
 * Everything the board does after it is on the page: the status line,
 * the later pages, the phone's collapse, and the search.
 *
 * One function because all four share the same three numbers (loaded,
 * total, expanded) and splitting them meant passing that state around
 * or reading it back out of the DOM.
 */
function wireBoard(
  host: HTMLElement,
  opts: BoardOptions & { loaded: RankedRow[]; total: number | null },
): void {
  const board = host.querySelector<HTMLElement>(".board");
  const scroller = host.querySelector<HTMLElement>(".board__scroll");
  const list = host.querySelector<HTMLOListElement>(".board__rows");
  const sentinel = host.querySelector<HTMLElement>(".board__sentinel");
  const status = host.querySelector<HTMLElement>(".board__status");
  const note = host.querySelector<HTMLElement>("[data-lb-empty]");
  if (!board || !scroller || !list || !status || !note) return;

  const { slug, total } = opts;
  let loaded = opts.loaded.length;
  let nextRank = rankStream(opts.loaded);
  let inFlight: Promise<boolean> | null = null;
  let allPromise: Promise<void> | null = null;
  let failed = false;
  let exhausted = total === null;
  /* Phones do not get the inner scroller, so they get a collapse
     instead — and the control that opens it is the same control that
     loads the rest, because on a phone those are one gesture's worth
     of intent. matchMedia rather than a resize listener on the body:
     one query, one change event, and it is the same 640px the
     stylesheet cuts at. */
  const phone = window.matchMedia?.("(max-width: 640px)");
  let expanded = false;

  const rowEls = () =>
    Array.from(list.querySelectorAll<HTMLElement>("[data-lb-row]"));

  const collapsedOnPhone = () =>
    !expanded && phone?.matches === true && rowEls().length > PHONE_ROWS;

  const remaining = () => (total === null ? 0 : Math.max(0, total - loaded));

  /** The foot: what is on the board, and the one control that changes
   *  it. Never a zero, and nothing at all under a board short enough
   *  to be read whole. */
  const paintStatus = () => {
    if (failed) {
      status.innerHTML = `<span data-lb-count>${escapeHtml(
        `Showing ${loaded} of ${total}`,
      )}</span><a href="#" data-lb-all>Couldn't load the rest — retry</a>`;
      return;
    }
    const canLoad = remaining() > 0 && !exhausted;
    const canExpand = collapsedOnPhone();
    if (!canLoad && !canExpand) {
      // `total` or nothing. Falling back to `loaded` printed the API's
      // page size as a board size — "595 members" on the head and "20
      // on the board" in the foot, on the same screen, about the same
      // group. See boardTotal: with no total the board says nothing
      // about one.
      status.innerHTML =
        total !== null && total > STATUS_AT
          ? `<span data-lb-count>${escapeHtml(`${total} on the board`)}</span>`
          : "";
      return;
    }
    // Same rule for the count on the control: the phone's collapse can
    // need a "Show everyone" on a board whose size nobody has told us,
    // and there the control goes out without a claim attached to it.
    const count =
      total === null
        ? ""
        : `<span data-lb-count>${escapeHtml(
            `Showing ${canExpand ? PHONE_ROWS : loaded} of ${total}`,
          )}</span>`;
    status.innerHTML = `${count}<a href="#" data-lb-all>Show everyone</a>`;
  };

  /** The fade at the scroller's floor: on while there is anything
   *  below the fold, off at the true end. */
  const paintFade = () => {
    const below =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 8;
    board.classList.toggle("board--more", below || remaining() > 0);
  };

  const append = (rows: LeaderboardRow[]) => {
    if (!rows.length) return;
    const html = nextRank(rows).map(renderBoardRow).join("");
    sentinel?.insertAdjacentHTML("beforebegin", html);
    loaded += rows.length;
    board.dataset.loaded = String(loaded);
  };

  /** One page. Resolves true when it landed, false when it did not —
   *  and a page that did not land stops the automatic paging rather
   *  than retrying into a dead endpoint on every scroll tick. */
  const loadPage = (): Promise<boolean> => {
    if (inFlight) return inFlight;
    if (exhausted || remaining() <= 0) return Promise.resolve(true);
    const url =
      `${DASHBOARD_ORIGIN}/api/public/chapter/${encodeURIComponent(slug)}` +
      `/leaderboard?offset=${loaded}&limit=${PAGE_SIZE}`;
    inFlight = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ rows?: LeaderboardRow[] }>;
      })
      .then((data) => {
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const scored = scoredRows(rows);
        append(scored);
        // Rows are points-descending, so a page that came back short,
        // empty, or with an unscored row on the end is the last page
        // there is — whatever the total said. Marking it exhausted is
        // what stops the observer asking again for ever.
        if (!rows.length || scored.length < rows.length || rows.length < PAGE_SIZE) {
          exhausted = true;
        }
        failed = false;
        return true;
      })
      .catch(() => {
        // Keep every row already on the page, keep the count honest,
        // and turn the control into the retry. The one thing this must
        // never do is blank the board or print a zero.
        failed = true;
        return false;
      })
      .finally(() => {
        inFlight = null;
        paintStatus();
        paintFade();
      });
    return inFlight;
  };

  /** Every remaining page, in order. Shared so a search and a click on
   *  "Show everyone" at the same moment make one run of requests. */
  const loadAll = (): Promise<void> => {
    if (allPromise) return allPromise;
    allPromise = (async () => {
      while (!exhausted && remaining() > 0) {
        const ok = await loadPage();
        if (!ok) break;
      }
      allPromise = null;
    })();
    return allPromise;
  };

  /* ── The search ──────────────────────────────────────────────── */

  const input = host.querySelector<HTMLInputElement>(".lb-search");
  let highlighted: HTMLElement[] = [];

  const clearHighlight = () => {
    for (const row of highlighted) {
      row.classList.remove("board__row--you");
      row.querySelector("[data-lb-ctx]")?.remove();
    }
    highlighted = [];
  };

  const applyFilter = () => {
    if (!input) return;
    const q = fold(input.value);
    clearHighlight();
    const rows = rowEls();
    const hits: HTMLElement[] = [];
    for (const row of rows) {
      // style.display, not [hidden]: `.board__row { display: grid }` is
      // an author rule and beats the UA's `[hidden] { display: none }`
      // at the same specificity, so a hidden row would stay visible.
      const match = !q || (row.dataset.name ?? "").includes(q);
      row.style.display = match ? "" : "none";
      if (match && q) hits.push(row);
    }
    list.classList.remove("is-filtering");
    void list.offsetWidth;
    list.classList.add("is-filtering");

    if (!q) {
      note.hidden = true;
      scroller.scrollTop = 0;
      paintStatus();
      paintFade();
      return;
    }
    if (!hits.length) {
      // Only the whole board can be told it does not contain somebody.
      // `run()` deliberately stops pulling pages once one has failed,
      // so this can be 150 rows of 595 — and "no member named X on the
      // board" there is a falsehood printed directly under a status
      // line saying the rest could not load.
      note.textContent =
        failed || remaining() > 0
          ? `Not in the rows loaded so far — retry to search the rest.`
          : `No member named "${input.value.trim()}" on the board.`;
      note.hidden = false;
      return;
    }
    note.hidden = true;
    if (hits.length <= HIGHLIGHT_AT) {
      for (const row of hits) row.classList.add("board__row--you");
      highlighted = hits;
    }
    // One hit is the case this box exists for: a member found herself.
    // The link puts her back on the board with the rows above and
    // below her, which is the thing a rank means.
    if (hits.length === 1) {
      const marks = hits[0].querySelector(".board__marks");
      marks?.insertAdjacentHTML(
        "beforeend",
        `<a class="board__ctx" href="#" data-lb-ctx>Show in context</a>`,
      );
    }
    scroller.scrollTop = 0;
  };

  if (input) {
    let timer = 0;
    const run = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const q = input.value.trim();
        if (q && remaining() > 0 && !failed) {
          // Searching a board that is 50 rows deep and 595 long finds
          // the 50. Pull the rest first and say so, rather than
          // reporting "no member named …" about somebody who is on it.
          note.textContent = `Searching all ${total}…`;
          note.hidden = false;
          // The phone's collapse hides matches too, so a search always
          // opens the board.
          expanded = true;
          board.classList.add("board--expanded");
          void loadAll().then(applyFilter);
          return;
        }
        expanded = expanded || q.length > 0;
        board.classList.toggle("board--expanded", expanded);
        applyFilter();
      }, SEARCH_DEBOUNCE_MS);
    };
    input.addEventListener("input", run);
    // A restored form value (back button, bfcache) arrives without an
    // event and would otherwise show the whole board under a query.
    if (input.value.trim()) run();
  }

  /* ── The controls ────────────────────────────────────────────── */

  status.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement | null)?.closest("[data-lb-all]");
    if (!link) return;
    e.preventDefault();
    failed = false;
    expanded = true;
    board.classList.add("board--expanded");
    paintStatus();
    void loadAll();
  });

  list.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement | null)?.closest("[data-lb-ctx]");
    if (!link) return;
    e.preventDefault();
    const row = link.closest<HTMLElement>("[data-lb-row]");
    link.remove();
    if (input) input.value = "";
    for (const el of rowEls()) el.style.display = "";
    note.hidden = true;
    // Scroll the SCROLLER, not the page: the visitor is reading the
    // board and the page must not jump underneath them. On a phone
    // there is no scroller, so the row is brought into the page's own
    // view instead.
    if (row) {
      row.classList.add("board__row--you");
      highlighted = [row];
      if (scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop =
          row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2;
      } else {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    paintFade();
  });

  scroller.addEventListener("scroll", paintFade, { passive: true });
  phone?.addEventListener?.("change", () => {
    paintStatus();
    paintFade();
  });

  /* ── Paging on arrival at the end ────────────────────────────── */

  if (!opts.settled && sentinel && remaining() > 0) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        // Not on a phone. There the board is collapsed to PHONE_ROWS
        // and the sentinel is an <li> sitting in normal flow directly
        // under row 12 — visible, and with `root: null` it intersects
        // on the first scroll, so the page fetched 100 rows the
        // collapsed board never showed. "Show everyone" is the phone's
        // paging gesture (B4), and it is the only one.
        if (phone?.matches === true) return;
        if (failed || exhausted || remaining() <= 0) {
          io.disconnect();
          return;
        }
        void loadPage().then(() => {
          if (exhausted || remaining() <= 0 || failed) io.disconnect();
        });
      },
      {
        // Always the scroller. It used to be the page on a phone,
        // because there the board is not a scroll container and an
        // element root that never scrolls never fires — but that is
        // exactly how the phone ended up paging behind its own
        // collapse. A phone does not page here at all now.
        root: scroller,
        rootMargin: "0px 0px 240px 0px",
      },
    );
    io.observe(sentinel);
  }

  paintStatus();
  paintFade();
}

/* ── Badges ──────────────────────────────────────────────────────── */

function renderBadgeTile(b: BadgeRow): string {
  return `
    <div class="badge-card" role="listitem">
      <div class="badge-card__icon">${badgeIcon(b.icon)}</div>
      <div class="badge-card__body">
        <div class="badge-card__name">${escapeHtml(b.name)}</div>
        ${b.description ? `<p class="badge-card__desc">${escapeHtml(b.description)}</p>` : ""}
        ${b.award_count >= 1 ? `<div class="badge-card__count">${b.award_count} earned</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Every badge the chapter awards, most-awarded first. Returns false
 * and leaves the host empty when there are none.
 *
 * A chapter's taxonomy is its own, so MSOE's near-duplicate names
 * ("2023 ROSIE Finalist" and "ROSIE Competition Finalist 2023") both
 * ship rather than being merged.
 */
export function renderBadgeWall(host: HTMLElement, bundle: Bundle): boolean {
  const badges = bundle.badges ?? [];
  if (!badges.length) {
    host.innerHTML = "";
    return false;
  }
  const tiles = [...badges]
    .sort((a, b) => b.award_count - a.award_count)
    .map(renderBadgeTile)
    .join("");
  host.innerHTML = `
    ${blockHead("What members have earned")}
    <div class="badges-grid" role="list">${tiles}</div>
  `;
  return true;
}

/* ── Redeem ──────────────────────────────────────────────────────── */

const PACKAGE_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16.5 9.4 7.55 4.24"/>
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
  <line x1="12" y1="22.08" x2="12" y2="12"/>
</svg>`;

function renderMerchCard(m: MerchRow): string {
  // Prefer the ordered gallery; fall back to the legacy single
  // image_url for older bundles. Blank entries are dropped so a bad
  // row cannot render an empty <img>.
  const imgs = (
    m.images?.length ? m.images : m.image_url ? [m.image_url] : []
  ).filter((u) => typeof u === "string" && u.trim().length > 0);
  const name = escapeHtml(m.name);

  let photo: string;
  if (imgs.length > 1) {
    const thumbs = imgs
      .map(
        (u, i) => `
        <button type="button" class="merch-card__thumb${i === 0 ? " is-active" : ""}"
          data-merch-thumb data-src="${escapeAttr(u)}"
          aria-label="Show photo ${i + 1} of ${imgs.length}" aria-pressed="${i === 0}">
          <img src="${escapeAttr(u)}" alt="" loading="lazy" />
        </button>`,
      )
      .join("");
    photo = `
      <div class="merch-card__photo" data-merch-gallery>
        <img class="merch-card__photo-main" data-merch-main src="${escapeAttr(imgs[0])}" alt="${name}" />
      </div>
      <div class="merch-card__thumbs" role="group" aria-label="${name} photos">${thumbs}</div>`;
  } else if (imgs.length === 1) {
    photo = `<div class="merch-card__photo"><img src="${escapeAttr(imgs[0])}" alt="${name}" loading="lazy" /></div>`;
  } else {
    photo = `<div class="merch-card__photo"><div class="merch-card__photo-placeholder">${PACKAGE_ICON}</div></div>`;
  }

  // A chapter-authored cost_text overrides the points price — 3 of
  // MSOE's 6 items are earned, not bought ("Participate in and Complete
  // a MAIC Research Group"), and those carry cost_points: 0. Never both,
  // and never a zero.
  const costText = (m.cost_text ?? "").trim();
  const cost = costText
    ? escapeHtml(costText)
    : m.cost_points >= 1
      ? `${m.cost_points.toLocaleString()} points`
      : "";

  // Stock is only a fact worth printing when the chapter tracked it.
  // All 6 of MSOE's items are null, which used to print "Unlimited
  // stock" six times.
  const stock =
    m.stock === null
      ? ""
      : m.stock === 0
        ? `<div class="merch-card__stock merch-card__stock--empty">Out of stock</div>`
        : `<div class="merch-card__stock">${m.stock} left</div>`;

  return `
    <div class="merch-card" role="listitem">
      ${photo}
      <div class="merch-card__body">
        <div class="merch-card__header">
          <div class="merch-card__name">${name}</div>
          ${cost ? `<div class="merch-card__cost">${cost}</div>` : ""}
        </div>
        ${m.description ? `<p class="merch-card__desc">${escapeHtml(m.description)}</p>` : ""}
        ${stock}
      </div>
    </div>
  `;
}

/**
 * What the points buy. Returns false and leaves the host empty when
 * the chapter sells nothing — merch is populated on 1 of the 12
 * chapters, so this is the usual answer.
 *
 * Nothing calls this today: the shelf left Home for the Explore
 * "Rewards" block, which shows the first item's photo and three names
 * rather than the whole gallery. Kept, rather than deleted with the
 * band, because MSOE is the only chapter with a shelf and the shelf
 * itself — photos, thumbnail switcher, stock — is worth more than one
 * Explore block; it is waiting for a surface, not obsolete.
 */
export function renderMerch(host: HTMLElement, bundle: Bundle): boolean {
  const items = bundle.merch ?? [];
  if (!items.length) {
    host.innerHTML = "";
    return false;
  }

  host.innerHTML = `
    ${blockHead("Redeem your points", "Earn points at events, redeem in person at any meeting.")}
    <div class="merch-grid" role="list">${items.map(renderMerchCard).join("")}</div>
  `;

  // One delegated listener for every card's thumbnail strip, matching
  // the sponsor modal's delegation style.
  host.addEventListener("click", (e) => {
    const thumb = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-merch-thumb]",
    );
    if (!thumb) return;
    const card = thumb.closest(".merch-card");
    const main = card?.querySelector<HTMLImageElement>("[data-merch-main]");
    const src = thumb.getAttribute("data-src");
    if (!main || !src) return;
    main.src = src;
    card
      ?.querySelectorAll<HTMLButtonElement>("[data-merch-thumb]")
      .forEach((t) => {
        const active = t === thumb;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-pressed", String(active));
      });
  });
  return true;
}

/* renderNetworkLine is gone. It was one sentence hanging off whichever
   recognition band rendered last, and there are no recognition bands:
   the claim it made — your record here travels with you — is the body
   of the Network block in Explore, which has a picture, a link and a
   fixed position on the page instead of a home that moved per
   chapter. */
