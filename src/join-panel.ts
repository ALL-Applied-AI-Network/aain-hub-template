/* The join panel — what "Join {acronym}" actually opens.
 *
 * It used to be a bare link to /join/{code}, which adds your name to the
 * chapter's roster and nothing else. That is not what joining a club
 * means to the student clicking it: joining means being in the room
 * where the next event is announced, which is the chapter's Discord, its
 * Teams, its GroupMe. The link and the room are two different things and
 * the button was only ever offering one of them.
 *
 * So the button opens a panel that hands over both, channels first:
 *
 *   the channels   every join-kind link from config.community_links,
 *                  with its own vendored mark — where the next event
 *                  gets announced.
 *   the roster     the /join/{code} link, named for what it does — it
 *                  is what puts you on the leaderboard and what makes
 *                  your check-ins count.
 *   elsewhere      follow links and the chapter's email, quietly, under
 *                  a rule. Following is not joining.
 *
 * All three are optional and the panel is written from what is actually
 * there. No chapter in the network has authored a community_link yet
 * (verified live, 2026-09-20), so the roster-only panel is the case that
 * ships today and it has to read as a finished thing rather than as a
 * dialog wrapped around one link. With no roster link either, the panel
 * is the channels alone. With NEITHER, there is no panel and no Join
 * button anywhere on the page — see offerIsReal, which every caller
 * checks before it renders a button at all.
 *
 * It is a native <dialog>, opened with showModal(), appended to
 * document.body. That is deliberate on both counts. The dialog element
 * in the top layer is the one box on the platform that a transformed
 * ancestor cannot capture — `.page-enter`'s transform has anchored a
 * position:fixed child to itself before on this project — and showModal
 * brings the focus trap, the Escape key and the inertness of everything
 * behind it without a line of our own. What it does not bring, and what
 * is written out below, is the scroll lock, the backdrop click and
 * putting focus back on the button that opened it.
 */

import { escapeAttr, escapeHtml } from "./lib/html";
import type { CommunityLink } from "./lib/platforms";
import { platformIcon, platformMeta } from "./lib/platforms";

/** Everything the panel can offer, already scheme-checked by the
 *  caller. `joinUrl` null means this chapter runs no roster. */
export interface JoinOffer {
  acronym: string;
  joinUrl: string | null;
  links: CommunityLink[];
}

const joinKind = (l: CommunityLink) => platformMeta(l.platform).kind === "join";

/** The channels a visitor can actually walk into. */
export function joinChannels(links: CommunityLink[]): CommunityLink[] {
  return links.filter(joinKind);
}

/**
 * Is there anything to join?
 *
 * The gate on every Join button on the site. A chapter with no roster
 * and no channel has nothing behind that button, and a button that
 * opens an empty panel is worse than no button — so callers ask this
 * first and render nothing when it is false.
 */
export function offerIsReal(offer: JoinOffer): boolean {
  return Boolean(offer.joinUrl) || joinChannels(offer.links).length > 0;
}

/**
 * The channel buttons.
 *
 * Exported because the join band at the foot of the page leads with the
 * same set — the same marks, the same verbs, the same classes — and two
 * renderers for one row of buttons is how they drift apart.
 */
export function renderChannelButtons(links: CommunityLink[]): string {
  return links
    .map((l) => {
      const meta = platformMeta(l.platform);
      const label = l.label || meta.verb;
      return `
        <a class="plink plink--join" href="${escapeAttr(l.url)}"
           target="_blank" rel="noopener noreferrer">
          <span class="plink__icon" aria-hidden="true">${platformIcon(l.platform)}</span>
          <span class="plink__label">${escapeHtml(label)}</span>
        </a>`;
    })
    .join("");
}

/** The quiet row: feeds and the chapter's address. Marks only at the
 *  panel's width — the label is on the title attribute, because six
 *  named buttons under the two that matter is the row shouting. */
function renderElsewhere(links: CommunityLink[]): string {
  if (!links.length) return "";
  const marks = links
    .map((l) => {
      const meta = platformMeta(l.platform);
      const label = l.label || meta.label;
      return `
        <a class="plink plink--follow" href="${escapeAttr(l.url)}"
           ${l.platform === "email" ? "" : `target="_blank" rel="noopener noreferrer"`}
           title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
          <span class="plink__icon" aria-hidden="true">${platformIcon(l.platform)}</span>
        </a>`;
    })
    .join("");
  return `
    <div class="joinp__elsewhere">
      <span class="joinp__elsewhere-label">Elsewhere</span>
      <div class="joinp__marks">${marks}</div>
    </div>`;
}

/**
 * The panel's body.
 *
 * The steps are numbered only when there are two of them. "1 · The
 * channels" over a panel with no step 2 is the template counting to one.
 */
function renderBody(offer: JoinOffer): string {
  const channels = joinChannels(offer.links);
  const elsewhere = offer.links.filter((l) => !joinKind(l));
  const both = channels.length > 0 && Boolean(offer.joinUrl);
  const n = (i: number) => (both ? `<span class="joinp__n">${i}</span>` : "");

  const channelStep = channels.length
    ? `
      <section class="joinp__step">
        <h3 class="joinp__step-title">${n(1)}The channels</h3>
        <p class="joinp__step-desc">This is where the next event gets announced, and where you ask everything between them.</p>
        <div class="joinp__channels">${renderChannelButtons(channels)}</div>
      </section>`
    : "";

  // The roster step says what the link does, because "Join" on its own
  // is what made a visitor think this button was the Discord invite.
  const rosterStep = offer.joinUrl
    ? `
      <section class="joinp__step">
        <h3 class="joinp__step-title">${n(2)}The roster</h3>
        <p class="joinp__step-desc">Adding your name is what puts you on the leaderboard, and what makes your check-ins at events count toward it. It takes a minute and there is nothing to pay.</p>
        <a class="btn btn--primary joinp__roster" href="${escapeAttr(offer.joinUrl)}" rel="noopener">Add my name</a>
      </section>`
    : "";

  return `
    <div class="joinp__box" role="document">
      <div class="joinp__head">
        <h2 class="joinp__title" id="joinp-title">Join ${escapeHtml(offer.acronym)}</h2>
        <button type="button" class="joinp__close" data-joinp-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      ${channelStep}
      ${rosterStep}
      ${renderElsewhere(elsewhere)}
    </div>`;
}

let dialog: HTMLDialogElement | null = null;
let opener: HTMLElement | null = null;
let lockedOverflow = "";

function close(): void {
  dialog?.close();
}

/** Build the dialog once, on the first open, and keep it. */
function ensureDialog(offer: JoinOffer): HTMLDialogElement | null {
  if (dialog) return dialog;
  const el = document.createElement("dialog");
  // Both the modal semantics and the heading it is named by. aria-modal
  // is redundant under showModal() on a current browser and free on one
  // where it is not.
  el.className = "joinp";
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "joinp-title");
  el.innerHTML = renderBody(offer);

  // A click that lands on the dialog itself and not on the box inside it
  // is a click on the backdrop: the ::backdrop pseudo-element reports
  // its originating element as the target.
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("[data-joinp-close]") || t === el) close();
  });

  // The page must not scroll behind an open modal, and the focus that
  // opened it must come back to the thing that opened it. `close` fires
  // for Escape, for the button and for a backdrop click alike, so both
  // are undone in exactly one place.
  el.addEventListener("close", () => {
    document.documentElement.style.overflow = lockedOverflow;
    opener?.focus?.();
    opener = null;
  });

  document.body.appendChild(el);
  dialog = el;
  return el;
}

/**
 * Open it. `from` is the control that asked, so focus can go back there.
 *
 * Returns false when the browser has no showModal — which is the signal
 * for the caller to let the click through to the href it was already
 * on, rather than swallowing it and leaving the visitor with nothing.
 */
export function openJoinPanel(offer: JoinOffer, from: HTMLElement | null): boolean {
  if (!offerIsReal(offer)) return false;
  const el = ensureDialog(offer);
  if (!el || typeof el.showModal !== "function") return false;
  opener = from;
  lockedOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  el.showModal();
  return true;
}

/**
 * Wire every Join control on the page, now and after any re-render.
 *
 * One delegated listener rather than a handler per button: the hero, the
 * empty leaderboard's note and the band at the foot of the page each
 * render their own button at their own moment, and two of them can be
 * redrawn after this runs. They opt in by carrying `data-join-panel`,
 * and each one keeps a real href underneath — so the middle-click, the
 * cmd-click and the no-JS load all still go somewhere useful.
 */
export function initJoinPanel(offer: JoinOffer): void {
  if (!offerIsReal(offer)) return;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    // A modified click is a request for a second tab, and that request
    // is about the href, not about this panel.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const trigger = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-join-panel]",
    );
    if (!trigger) return;
    if (openJoinPanel(offer, trigger)) e.preventDefault();
  });
}
