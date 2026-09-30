/* The card a name on the board opens when that member has no public
   profile to link to.

   Built ONLY from the board row it was opened from: name, chapter,
   points, event count and badges. That is the whole of what the public
   board already says about a roster member who never made an account,
   and it is deliberately all this card may say (ruling D4) — their
   event list stays in the dashboard. The one thing it adds is the door
   for the person it describes: "Is this you? Claim your record".

   One card at a time, appended to <body> and positioned against the
   name it came from, so the board's own overflow cannot clip it. It is
   a non-modal dialog: focus moves into it, Escape closes it and puts
   focus back on the name, and a click or a tab anywhere else simply
   lets it go. Scrolling carries it with its name until the name leaves
   the view, and then it closes rather than float over the wrong row.

   Motion: it opens out of the name (the transform origin is the name's
   own position), 220 ms on the house entrance curve, its lines settling
   30 ms apart; it leaves in 140 ms. Reduced motion and ?still=1 cut
   both. Nothing runs while it is open and still. */

import type { LeaderboardRow } from "./lib/bundle";
import { officerInitials, plural } from "./lib/format";
import { escapeAttr, escapeHtml } from "./lib/html";
import { renderBadgeIcon } from "./lib/primitives";

/** Where a roster member makes the account their record becomes. */
export const CLAIM_URL = "https://dashboard.all-ai-network.org/sign-up";

/** Badges named on the card before the rest become a count. */
const CARD_BADGES = 6;

export interface MemberCardCtx {
  /** The chapter's name as its site shows it (hub_name wins). */
  chapter: string;
  /** Reduced motion or a capture: open and close without transitions. */
  settled: boolean;
}

let card: HTMLElement | null = null;
let anchor: HTMLElement | null = null;
let detach: (() => void) | null = null;

const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

function cardHtml(row: LeaderboardRow, ctx: MemberCardCtx): string {
  const facts: string[] = [];
  // Never a zero: a fact that is 0 is not a fact about this person.
  if (row.points >= 1) {
    facts.push(
      `<div class="mcard__fact"><b>${row.points.toLocaleString()}</b><span>${row.points === 1 ? "point" : "points"}</span></div>`,
    );
  }
  if (row.events_attended >= 1) {
    facts.push(
      `<div class="mcard__fact"><b>${row.events_attended.toLocaleString()}</b><span>${row.events_attended === 1 ? "event" : "events"}</span></div>`,
    );
  }
  const badges = row.badges ?? [];
  if (badges.length) {
    facts.push(
      `<div class="mcard__fact"><b>${badges.length}</b><span>${badges.length === 1 ? "badge" : "badges"}</span></div>`,
    );
  }
  const shown = badges.slice(0, CARD_BADGES);
  const more = badges.length - shown.length;
  const badgeList = shown.length
    ? `<ul class="mcard__badges">${shown
        .map(
          (b) =>
            `<li class="mcard__badge"><span class="mcard__badge-icon" aria-hidden="true">${renderBadgeIcon(b.icon)}</span><span>${escapeHtml(b.name)}</span></li>`,
        )
        .join("")}${more > 0 ? `<li class="mcard__badge mcard__badge--more">${escapeHtml(plural(more, "more badge"))}</li>` : ""}</ul>`
    : "";

  return `
    <div class="mcard__head">
      <span class="mcard__mono" aria-hidden="true">${escapeHtml(officerInitials(row.name))}</span>
      <div class="mcard__id">
        <h3 class="mcard__name" id="mcard-name">${escapeHtml(row.name)}</h3>
        ${ctx.chapter ? `<p class="mcard__chapter">${escapeHtml(ctx.chapter)}</p>` : ""}
      </div>
      <button type="button" class="mcard__x" data-mcard-close aria-label="Close">${CLOSE_ICON}</button>
    </div>
    ${facts.length ? `<div class="mcard__facts">${facts.join("")}</div>` : ""}
    ${badgeList}
    <div class="mcard__claim">
      <span class="mcard__ask">Is this you?</span>
      <a class="btn btn--primary btn--sm mcard__go" href="${escapeAttr(CLAIM_URL)}">Claim your record</a>
    </div>`;
}

/** The scroller the name sits in, if any: the card follows the name
 *  and closes once the name has scrolled out of it. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  return el.closest<HTMLElement>(".board__scroll");
}

function place(): boolean {
  if (!card || !anchor) return false;
  const r = anchor.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  // Out of sight: out of the page, or out of the board's own scroller.
  if (r.bottom < 0 || r.top > vh || (!r.width && !r.height)) return false;
  const sp = scrollParentOf(anchor);
  if (sp) {
    const s = sp.getBoundingClientRect();
    if (r.bottom < s.top + 4 || r.top > s.bottom - 4) return false;
  }
  const edge = 12;
  const gap = 8;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const left = Math.min(Math.max(edge, r.left - 14), vw - w - edge);
  let top = r.bottom + gap;
  let above = false;
  if (top + h > vh - edge && r.top - gap - h >= edge) {
    top = r.top - gap - h;
    above = true;
  }
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
  // Open out of the name itself, not out of the card's corner.
  const ox = Math.min(Math.max(r.left + 16 - left, 16), w - 16);
  card.style.transformOrigin = `${Math.round(ox)}px ${above ? "100%" : "0%"}`;
  card.dataset.side = above ? "above" : "below";
  return true;
}

/** Close the open card. `restoreFocus` is for Escape and the close
 *  button: the person was inside the card and goes back to the name. */
export function closeMemberCard(restoreFocus = false): void {
  const el = card;
  const from = anchor;
  detach?.();
  detach = null;
  card = null;
  anchor = null;
  if (from) {
    from.setAttribute("aria-expanded", "false");
    from.closest("[data-lb-row]")?.classList.remove("board__row--carded");
    if (restoreFocus) from.focus({ preventScroll: true });
  }
  if (!el) return;
  if (el.dataset.settled === "1") {
    el.remove();
    return;
  }
  el.classList.remove("is-open");
  el.classList.add("is-closing");
  window.setTimeout(() => el.remove(), 160);
}

/** Open the card for `row` against `trigger`, or close it if that name's
 *  card is the one already open. */
export function toggleMemberCard(
  trigger: HTMLElement,
  row: LeaderboardRow,
  ctx: MemberCardCtx,
): void {
  if (anchor === trigger) {
    closeMemberCard(false);
    return;
  }
  closeMemberCard(false);

  const el = document.createElement("div");
  el.className = "mcard";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-labelledby", "mcard-name");
  el.tabIndex = -1;
  if (ctx.settled) el.dataset.settled = "1";
  el.innerHTML = cardHtml(row, ctx);
  document.body.appendChild(el);

  card = el;
  anchor = trigger;
  trigger.setAttribute("aria-expanded", "true");
  trigger.closest("[data-lb-row]")?.classList.add("board__row--carded");

  if (!place()) {
    closeMemberCard(false);
    return;
  }
  el.focus({ preventScroll: true });
  if (ctx.settled) el.classList.add("is-open");
  else requestAnimationFrame(() => el.classList.add("is-open"));

  /* Everything that ends the card, wired once and undone together. */
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (card === el && !place()) closeMemberCard(false);
    });
  };
  // The whole row is the name's click target (see wireBoard), so a press
  // anywhere on it belongs to the toggle, not to "clicked elsewhere".
  const ownRow = trigger.closest<HTMLElement>("[data-lb-row]");
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node | null;
    if (!t || el.contains(t) || trigger.contains(t) || ownRow?.contains(t)) return;
    closeMemberCard(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMemberCard(true);
    }
  };
  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next || el.contains(next) || trigger.contains(next)) return;
    closeMemberCard(false);
  };
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest("[data-mcard-close]")) {
      closeMemberCard(true);
    }
  };
  const onResize = () => closeMemberCard(false);

  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  el.addEventListener("focusout", onFocusOut);
  el.addEventListener("click", onClick);
  detach = () => {
    document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    el.removeEventListener("focusout", onFocusOut);
    el.removeEventListener("click", onClick);
  };
}
