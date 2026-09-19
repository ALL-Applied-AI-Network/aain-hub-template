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
   - 20 rows is the whole public board (the bundle's leaderboard query
     has no consent filter, so this renders exactly what already
     ships). The board is therefore bounded, and it renders whole:
     there is no "show more", because the board IS the page's
     centrepiece and truncating it would also give the search box rows
     it could not find.
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
import { renderBadgeIcon } from "../lib/primitives";

/** Where a member manages the profile their points travel on. */
const PROFILE_URL = "https://dashboard.all-ai-network.org/me/profile";

/** Board rows at which the search box earns its place. Below this the
 *  whole board is on one screen and a search box is furniture; at or
 *  above it a member scanning for their own name is scrolling. It sits
 *  inside the board frame and filters from the very first row. */
const SEARCH_AT = 8;

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
  const meta = marks || events ? `<div class="board__marks">${marks}${events}</div>` : "";
  return `
    <li class="board__row${lead ? " board__row--lead" : ""}" data-lb-row data-name="${escapeAttr(fold(row.name))}">
      <span class="board__rank"><span class="visually-hidden">Rank </span>${rank}</span>
      <span class="board__who">
        <span class="board__name">${escapeHtml(row.name)}</span>
        ${meta}
      </span>
      <span class="board__pts">${row.points.toLocaleString()}<span class="visually-hidden"> ${row.points === 1 ? "pt" : "pts"}</span></span>
    </li>
  `;
}

/**
 * Wire the search box over the rows already on the page. Filtering sets
 * style.display rather than the hidden attribute: `.board__row {
 * display: grid }` is an author rule and beats the UA's `[hidden] {
 * display: none }` at the same specificity, so a hidden row would stay
 * visible.
 *
 * The filter runs once on wiring as well as on input, because a
 * restored form value (back button, bfcache) arrives without an event
 * and would otherwise show the full board under a typed query.
 */
function wireSearch(scope: HTMLElement, total: number): void {
  const input = scope.querySelector<HTMLInputElement>(".lb-search");
  const note = scope.querySelector<HTMLElement>("[data-lb-empty]");
  if (!input || !note) return;
  const rows = Array.from(scope.querySelectorAll<HTMLElement>("[data-lb-row]"));
  const apply = () => {
    const q = fold(input.value);
    let hits = 0;
    for (const row of rows) {
      const match = !q || (row.dataset.name ?? "").includes(q);
      row.style.display = match ? "" : "none";
      if (match) hits++;
    }
    note.hidden = hits > 0;
  };
  note.textContent = `No member by that name in the top ${total}.`;
  input.addEventListener("input", apply);
  apply();
}

/** What `renderBoard` put in the host, so the composer knows whether
 *  the band around it has earned its place. */
export type BoardState = "board" | "note" | "none";

/**
 * Fill `host` with the standings.
 *
 * Returns "board" when real rows rendered, "note" when the chapter has
 * events but nobody has scored yet (one sentence that names the fix,
 * and the fix is true for a visitor to read), and "none" when there is
 * nothing honest to say — a board with nobody on it, on a club that
 * has never run an event, is an accusation rather than a record. On
 * "none" the host is left empty and the caller should drop the band.
 */
export function renderBoard(host: HTMLElement, bundle: Bundle): BoardState {
  const rows = scoredRows(bundle.leaderboard ?? []);

  if (!rows.length) {
    if ((bundle.events ?? []).length > 0) {
      host.innerHTML = `<p class="note">Points start showing up here once members check in at an event.</p>`;
      return "note";
    }
    host.innerHTML = "";
    return "none";
  }

  const ranked = rankByPoints(rows);

  // "Top 20 of 595 members." — the board is a cap, and saying so is
  // more honest than letting 20 names look like the whole chapter.
  // Omitted when the board is everyone, and at one row, where the
  // sentence would be counting to one.
  const total = bundle.chapter?.member_count ?? 0;
  const caption =
    rows.length >= 2 && total > rows.length
      ? `Top ${rows.length} of ${plural(total, "member")}.`
      : "";

  // The search lives inside the frame rather than floating above it:
  // it is part of the object, and a board you can search says so on
  // its face.
  const search =
    rows.length >= SEARCH_AT
      ? `<div class="board__search">
           <input type="search" class="lb-search" placeholder="Find your name" aria-label="Find your name" autocomplete="off" spellcheck="false" />
         </div>`
      : "";

  const header =
    rows.length >= HEADER_AT
      ? `<div class="board__head" aria-hidden="true">
           <span class="board__h board__h--rank">Rank</span>
           <span class="board__h">Member</span>
           <span class="board__h board__h--pts">Points</span>
         </div>`
      : "";

  host.innerHTML = `
    <div class="board">
      ${search}
      ${header}
      <ol class="board__rows">${ranked.map(renderBoardRow).join("")}</ol>
      <p class="board__empty" data-lb-empty hidden></p>
      ${caption ? `<p class="board__foot">${escapeHtml(caption)}</p>` : ""}
    </div>
  `;
  if (search) wireSearch(host, rows.length);
  return "board";
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
    ${blockHead("Every badge we award")}
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

/* ── The network line ────────────────────────────────────────────── */

/**
 * One sentence, at the foot of the recognition story. It replaces the
 * ~100-line "living résumé" callout that used to sit on every
 * chapter's front page: same claim, no percentage, no named hiring
 * anecdote, no methodology footnote.
 */
export function renderNetworkLine(host: HTMLElement): void {
  if (host.querySelector(".members-network")) return;
  host.insertAdjacentHTML(
    "beforeend",
    `<p class="members-network">Every check-in and project here also lands on your ALL Applied AI Network profile, which travels with you between chapters. <a class="link--arrow" href="${PROFILE_URL}" target="_blank" rel="noopener">Manage your profile</a></p>`,
  );
}
