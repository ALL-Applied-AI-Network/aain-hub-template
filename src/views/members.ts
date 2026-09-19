/* The Members destination — #members.

   One story, in order: earn points → get recognised → redeem. The
   standings, how the points work, every badge the chapter awards, and
   the merch those points buy. Merch used to be its own tab and was
   empty on 11 of the 12 chapters; a tab that is usually empty is worse
   than no tab.

   The counting laws this page is built on:

   - Dense ranking off points, computed here. The API hands back rank 1
     and rank 2 for MSOE's two members who both have 88 points; equal
     scores share a rank and the next distinct score skips past it, so
     that tie reads 1, 1, 3. A medal only renders where a rank is held
     by exactly one member, because a shared gold is not a gold.
   - Never print a zero. events_attended is 0 for most of MSOE's top 20
     (the check-in rows predate the import), and "0 events" next to 88
     points reads as broken data — so the line is dropped, not zeroed.
     Same for a badge that nobody has earned and a merch item with no
     points price.
   - 20 rows is the whole public board. The bundle's leaderboard query
     has no consent filter, so this view asks for no more than what
     already ships and the search box sits over those 20.

   Mounts at most once, on first entry to the tab (see lib/view.ts). */

import type {
  BadgeRow,
  LeaderboardBadge,
  LeaderboardRow,
  MerchRow,
} from "../lib/bundle";
import { plural } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { MEDAL_SVGS, renderBadgeIcon } from "../lib/primitives";
import { registerView, type ViewCtx } from "../lib/view";

/** Where a member manages the profile their points travel on. */
const PROFILE_URL = "https://dashboard.all-ai-network.org/me/profile";

/** Board rows at which the search box earns its place. The public
 *  board is capped at 20 by the API, so this is "the board is full" —
 *  at that size a member scanning for their own name is scrolling. */
const SEARCH_AT = 20;

/** Badge icons shown next to a name before the +N chip takes over. */
const MAX_ROW_BADGES = 4;

/* ── Building blocks ─────────────────────────────────────────────── */

/**
 * Drop the kicker + H2 head from a destination section. The
 * .page-header band is the only head on a destination; today
 * #sec-badges prints "POINTS & RECOGNITION / How it all works" under a
 * band that just said "Points & recognition / Members".
 */
function dropSectionHead(section: HTMLElement | null): void {
  if (!section) return;
  section
    .querySelectorAll(".section__head, .section__kicker, .section__title")
    .forEach((el) => el.remove());
}

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
 * names, mixed inside one chapter. The emoji branch now lives in
 * renderBadgeIcon itself (src/lib/primitives.ts), so the landing page's
 * badge chips get it without importing from a view.
 *
 * Kept as a named export because this module's own rows call it and
 * because the name says what the call is for.
 */
export function badgeIcon(icon: string): string {
  return renderBadgeIcon((icon ?? "").trim());
}

/** The compact badge strip beside a name on the board. */
function renderRowBadges(badges: LeaderboardBadge[] | undefined): string {
  if (!badges?.length) return "";
  const shown = badges.slice(0, MAX_ROW_BADGES);
  const overflow = badges.length - shown.length;
  const chips = shown
    .map(
      (b) =>
        `<span class="member-badge" title="${escapeAttr(b.name)}" aria-label="${escapeAttr(b.name)}">${badgeIcon(b.icon)}</span>`,
    )
    .join("");
  const more =
    overflow > 0
      ? `<span class="member-badge member-badge--more" title="${overflow} more" aria-label="${overflow} more">+${overflow}</span>`
      : "";
  return `<div class="member-badges" aria-label="earned badges">${chips}${more}</div>`;
}

/* ── Standings ───────────────────────────────────────────────────── */

export interface RankedRow {
  row: LeaderboardRow;
  rank: number;
  /** True when this rank is held by exactly one member. A medal on a
   *  shared rank claims a winner the points do not support. */
  sole: boolean;
  /** True when this row is on a podium that actually exists: rank 1, 2
   *  or 3, and every rank at or above it held by one member.
   *
   *  `sole` alone is not enough. MSOE's board opens 88, 88, 83, so
   *  rank 1 is shared and rank 3 is not — and the board rendered a
   *  lone bronze at the top with no gold or silver above it, which
   *  reads as a bug rather than as a tie. A podium is built downward
   *  from first place and stops at the first tie. */
  podium: boolean;
}

/**
 * Rank by points, ties sharing a rank and the next distinct score
 * skipping past them (88, 88, 83 → 1, 1, 3). The rank the API sends is
 * a row number, not a ranking: MSOE's two 88-point members come back as
 * 1 and 2, which is the podium's "Gold / Silver" lie in the data.
 *
 * The sort is defensive — the API already orders by points desc — and
 * is stable, so members on equal points keep the order they arrived in.
 *
 * Exported with renderBoardRow and scoredRows so the landing page's
 * five-row standings band ranks and renders identically to this page's
 * full board — the same tie has to read the same way in both places.
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

  // How far down the podium is unambiguous: 1, then 2, then 3, stopping
  // at the first rank that is shared or missing. On MSOE (88, 88, 83)
  // that is 0 — no medals at all, rather than a bronze on its own.
  let podiumDepth = 0;
  while (podiumDepth < 3 && held.get(podiumDepth + 1) === 1) podiumDepth++;

  return sorted.map((row, i) => ({
    row,
    rank: ranks[i],
    sole: held.get(ranks[i]) === 1,
    podium: ranks[i] <= podiumDepth,
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

/** Case- and accent-insensitive form of a name, for the search box. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function renderBoardRow({ row, rank, podium }: RankedRow): string {
  const medal = podium ? (MEDAL_SVGS[rank] ?? "") : "";
  const medalHtml = medal
    ? `<span class="rec__medal" aria-hidden="true">${medal}</span>`
    : "";
  const events =
    row.events_attended >= 1
      ? `<span class="chip">${escapeHtml(plural(row.events_attended, "event"))}</span>`
      : "";
  const meta =
    renderRowBadges(row.badges) || events
      ? `<div class="rec__meta">${renderRowBadges(row.badges)}${events}</div>`
      : "";
  return `
    <div class="rec rec--lb" data-lb-row data-name="${escapeAttr(fold(row.name))}">
      <div class="rec__main">
        <div class="rec__rank">${medalHtml}${rank}</div>
        <div class="rec__body">
          <div class="rec__title">${escapeHtml(row.name)}</div>
          ${meta}
        </div>
        <div class="rec__pts">${row.points.toLocaleString()}<span class="rec__pts-unit">${row.points === 1 ? "pt" : "pts"}</span></div>
      </div>
    </div>
  `;
}

/**
 * Wire the search box over the rows already on the page. Filtering sets
 * style.display rather than the hidden attribute: `.rec { display:
 * block }` is an author rule and beats the UA's `[hidden] { display:
 * none }` at the same specificity, so a hidden .rec would stay visible.
 */
function wireSearch(scope: HTMLElement, total: number): void {
  const input = scope.querySelector<HTMLInputElement>(".lb-search");
  const note = scope.querySelector<HTMLElement>("[data-lb-empty]");
  if (!input || !note) return;
  const rows = Array.from(
    scope.querySelectorAll<HTMLElement>("[data-lb-row]"),
  );
  input.addEventListener("input", () => {
    const q = fold(input.value);
    let hits = 0;
    for (const row of rows) {
      const match = !q || (row.dataset.name ?? "").includes(q);
      row.style.display = match ? "" : "none";
      if (match) hits++;
    }
    note.hidden = hits > 0;
  });
  note.textContent = `No member by that name in the top ${total}.`;
}

function renderStandings(ctx: ViewCtx): void {
  const container = ctx.el("leaderboard-content");
  if (!container) return;

  const rows = scoredRows(ctx.bundle.leaderboard ?? []);
  if (!rows.length) {
    // A board with nobody on it says nothing true about the chapter.
    // The Members tab only exists when one of its blocks has data, so
    // nobody lands on the hole this leaves.
    ctx.el("sec-leaderboard")?.remove();
    return;
  }

  dropSectionHead(ctx.el("sec-leaderboard"));

  // "Top 20 of 595 members." — the board is a cap, and saying so is
  // more honest than letting 20 names look like the whole chapter.
  // Omitted when the board is everyone, and at one row, where the
  // sentence would be counting to one.
  const total = ctx.bundle.chapter?.member_count ?? 0;
  const caption =
    rows.length >= 2 && total > rows.length
      ? `Top ${rows.length} of ${plural(total, "member")}.`
      : "";

  const search =
    rows.length >= SEARCH_AT
      ? `<input type="search" class="lb-search" placeholder="Find your name" aria-label="Find your name" autocomplete="off" spellcheck="false" />`
      : "";

  container.innerHTML = `
    ${blockHead("Standings", caption || undefined)}
    ${search}
    ${rankByPoints(rows).map(renderBoardRow).join("")}
    <p class="note" data-lb-empty hidden></p>
  `;
  if (search) wireSearch(container, rows.length);
}

/* ── How points work · badges ────────────────────────────────────── */

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
 * The badges section carries two blocks: the three points-explainer
 * cards (authored in index.html, kept verbatim) and the badge wall.
 * The explainer earns its place whenever there are points or badges to
 * explain; with neither, it is the template describing a system this
 * chapter does not run yet.
 */
function renderBadges(ctx: ViewCtx): void {
  const section = ctx.el("sec-badges");
  const grid = ctx.el("badges-grid");
  if (!section) return;

  const badges = ctx.bundle.badges ?? [];
  const hasPoints = scoredRows(ctx.bundle.leaderboard ?? []).length > 0;

  dropSectionHead(section);

  const explainer = section.querySelector<HTMLElement>(".points-explainer");
  if (explainer) {
    if (!badges.length && !hasPoints) {
      explainer.remove();
    } else if (
      !explainer.previousElementSibling?.classList.contains("block-head")
    ) {
      explainer.insertAdjacentHTML("beforebegin", blockHead("How points work"));
    }
  }

  if (!badges.length) {
    // Drop the wall and the sub-head that announces it; the explainer
    // above it may still have earned its place.
    const head = grid?.previousElementSibling;
    if (head?.classList.contains("section__subhead")) head.remove();
    grid?.remove();
  } else if (grid) {
    // index.html's bare <h3> becomes the same block head every other
    // block on this page uses.
    const head = grid.previousElementSibling;
    if (head?.classList.contains("section__subhead")) head.remove();
    if (!grid.previousElementSibling?.classList.contains("block-head")) {
      grid.insertAdjacentHTML("beforebegin", blockHead("Every badge we award"));
    }
    // Most-awarded first: a chapter's taxonomy is its own, so
    // near-duplicate names ("2023 ROSIE Finalist" and "ROSIE
    // Competition Finalist 2023") both ship rather than being merged.
    grid.innerHTML = [...badges]
      .sort((a, b) => b.award_count - a.award_count)
      .map(renderBadgeTile)
      .join("");
  }

  if (!section.querySelector(".points-explainer, .badges-grid")) {
    section.remove();
  }
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

function renderMerch(ctx: ViewCtx): void {
  const grid = ctx.el("merch-grid");
  if (!grid) return;

  const items = ctx.bundle.merch ?? [];
  if (!items.length) {
    ctx.el("sec-merch")?.remove();
    return;
  }

  dropSectionHead(ctx.el("sec-merch"));
  if (!grid.previousElementSibling?.classList.contains("block-head")) {
    grid.insertAdjacentHTML(
      "beforebegin",
      blockHead(
        "Redeem your points",
        "Earn points at events, redeem in person at any meeting.",
      ),
    );
  }
  grid.innerHTML = items.map(renderMerchCard).join("");

  // One delegated listener for every card's thumbnail strip, matching
  // the sponsor modal's delegation style.
  grid.addEventListener("click", (e) => {
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
}

/* ── The network line ────────────────────────────────────────────── */

/**
 * One sentence, at the foot of whichever block ends this page. It
 * replaces the callout deleted above: same claim, no percentage, no
 * hiring anecdote, no footnote.
 */
function renderNetworkLine(ctx: ViewCtx): void {
  // Last block standing wins, in page order. Sections with no data have
  // already removed themselves by the time this runs.
  const host = ["sec-merch", "sec-badges", "sec-leaderboard"]
    .map((id) => ctx.el(id))
    .find((s): s is HTMLElement => Boolean(s?.isConnected));
  const inner = host?.querySelector(".section__inner");
  if (!inner || inner.querySelector(".members-network")) return;

  inner.insertAdjacentHTML(
    "beforeend",
    `<p class="members-network">Every check-in and project here also lands on your ALL Applied AI Network profile, which travels with you between chapters. <a class="link--arrow" href="${PROFILE_URL}" target="_blank" rel="noopener">Manage your profile</a></p>`,
  );
}

registerView("members", (ctx) => {
  renderStandings(ctx);
  renderBadges(ctx);
  renderMerch(ctx);
  renderNetworkLine(ctx);
});
