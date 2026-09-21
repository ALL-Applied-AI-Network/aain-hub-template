/* The join panel — what "Join {acronym}" actually opens.
 *
 * This panel is the menu. Nothing else on the page offers a way in:
 * the masthead, the empty leaderboard's note and the band at the foot
 * all render the same one button, and every option a visitor has lives
 * in here. Spreading the options across the page — a Teams button in
 * the band with a sign-up line hung under it — is the shape Ben looked
 * at and asked to collapse back into one door.
 *
 * And the door asks first. A chapter's Discord or Teams invite is the
 * thing a visitor came for, and handing it over on a public page means
 * the chapter never learns who walked in and the invite is one
 * right-click from being reposted anywhere. So when the chapter runs a
 * sign-up form, the form comes first and the invite comes after it:
 *
 *   sign up        the /join/{code} link — the chapter's OWN form (name
 *                  + email, plus any question the eboard added to it on
 *                  Your Chapter). It puts you on the leaderboard, makes
 *                  your check-ins count, and it is how the eboard gets
 *                  an address to send the invite to.
 *   the channels   NOT a link. The mark and the name of each platform
 *                  being withheld, under one line saying the invite
 *                  follows the form. `config.gated_channels` carries
 *                  platform names and nothing else, so there is no URL
 *                  here to leak even by accident — the gate itself is
 *                  the API's, which stops sending the URL at all.
 *   elsewhere      follow links and the chapter's email, quietly, under
 *                  a rule. Following is not joining.
 *
 * With NO sign-up form there is nothing to collect and nothing to gate
 * behind, and hiding the invite would leave that chapter's site with no
 * way in at all — so `community_links` still carries the join-kind
 * links in that case and the panel is the plain channel menu it has
 * always been. With neither a form nor a channel there is no panel and
 * no Join button anywhere on the page — see offerIsReal, which every
 * caller checks before it renders a button at all.
 *
 * One rule holds across all of it: a join-kind URL is rendered only
 * when the chapter has no form. The API is what makes that a gate
 * rather than a curtain (a URL in the keyless public bundle is public
 * whatever this file draws), but the two must not disagree, so this
 * file withholds on the same condition the API does and never renders
 * an href for a channel it is describing as gated.
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
  /** Platform names only, from `config.gated_channels` — the join-kind
   *  links the API is withholding behind `joinUrl`. Never a URL. Empty
   *  on a bundle from an API that predates the gate. */
  gatedChannels: string[];
}

const joinKind = (l: CommunityLink) => platformMeta(l.platform).kind === "join";

/** The channels a visitor can actually walk into. */
export function joinChannels(links: CommunityLink[]): CommunityLink[] {
  return links.filter(joinKind);
}

/**
 * The channels this panel hands over as links.
 *
 * None, whenever the chapter runs a form. That is the whole gate on
 * this side of the wire, and it is written as one expression on
 * purpose: every caller that renders a join-kind href goes through
 * here, so there is a single place to be right.
 *
 * Note what it does NOT do: it does not ask whether the API gated this
 * particular link. Today's bundle still ships MSOE's Teams URL inside
 * `community_links` next to a live roster code, and rendering it
 * because the API has not caught up yet would put the invite back on
 * the public page — the exact thing being fixed. The condition is the
 * form, not the field the URL arrived in.
 */
export function openChannels(offer: JoinOffer): CommunityLink[] {
  return offer.joinUrl ? [] : joinChannels(offer.links);
}

/**
 * Every link on this chapter that may be rendered as an href, anywhere
 * on the page.
 *
 * Follow and contact links always; join-kind links only when
 * `openChannels` says they are open. The footer is why this exists as
 * its own export: it draws the same community list the join band does,
 * which is normally the point — a chapter cannot have a Discord in its
 * footer and not in its join band — but it made the footer a second
 * door the gate did not cover, and it shipped the withheld Teams URL
 * in an href three screens below the panel that was carefully not
 * rendering it. Any surface that turns this chapter's links into hrefs
 * starts from here.
 */
export function renderableLinks(offer: JoinOffer): CommunityLink[] {
  return offer.joinUrl ? offer.links.filter((l) => !joinKind(l)) : offer.links;
}

/**
 * The platforms named as withheld — what the locked preview lists.
 *
 * Two sources, because the API deploys separately from this site:
 * `gated_channels` is what tomorrow's bundle says it is holding back,
 * and any join-kind link still arriving in `community_links` beside a
 * roster is one today's bundle has not learned to hold back yet. Both
 * are platform names by the time they leave here; the URL, where there
 * is one, is dropped on the floor.
 */
export function lockedChannels(offer: JoinOffer): string[] {
  if (!offer.joinUrl) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [
    ...offer.gatedChannels,
    ...joinChannels(offer.links).map((l) => l.platform),
  ]) {
    const platform = (p ?? "").trim().toLowerCase();
    if (!platform || seen.has(platform)) continue;
    seen.add(platform);
    out.push(platform);
  }
  return out;
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
 * The channel buttons — the ungated case, and only ever that.
 *
 * Not exported any more. The band at the foot of the page used to call
 * it to lead with the same row of buttons, which is how the options
 * ended up spread across the page; the band is one button now and this
 * markup exists in exactly one place, which is the panel.
 */
function renderChannelButtons(links: CommunityLink[]): string {
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
 * The locked preview: what you get, once you have signed up.
 *
 * Marks and names, in a list. Deliberately not buttons and not
 * button-shaped: a row with a border and a hover state that does
 * nothing when you click it is a broken button, and the visitor cannot
 * tell the difference between "this is coming" and "this is bust". No
 * href is written here at all — `lockedChannels` hands over platform
 * names, so there is nothing in scope to write one from.
 */
function renderLocked(platforms: string[]): string {
  if (!platforms.length) return "";
  const rows = platforms
    .map((p) => {
      const meta = platformMeta(p);
      return `
        <li class="joinp__locked-row">
          <span class="joinp__locked-mark" aria-hidden="true">${platformIcon(p)}</span>
          <span class="joinp__locked-name">${escapeHtml(meta.label)}</span>
        </li>`;
    })
    .join("");
  // One line, and it says the thing the visitor is owed: what they get
  // and when. The list underneath names the platforms, so this does
  // not — saying "the Teams invite" over a row that says Microsoft
  // Teams is the panel reading itself back.
  const note =
    platforms.length > 1
      ? "The invites come right after you sign up."
      : "The invite comes right after you sign up.";
  return `
    <section class="joinp__locked">
      <p class="joinp__locked-note">${note}</p>
      <ul class="joinp__locked-list">${rows}</ul>
    </section>`;
}

/**
 * The panel's body.
 *
 * Two shapes, and which one renders is decided by `openChannels` /
 * `lockedChannels` rather than here: with a form, sign-up leads and the
 * channels are a preview; with no form, the channels are the menu.
 * They are never both, so nothing is numbered — "1 · Sign up" over a
 * panel with no step 2 is the template counting to one.
 */
function renderBody(offer: JoinOffer): string {
  const open = openChannels(offer);
  const locked = lockedChannels(offer);
  const elsewhere = offer.links.filter((l) => !joinKind(l));

  const channelStep = open.length
    ? `
      <section class="joinp__step">
        <h3 class="joinp__step-title">The channels</h3>
        <p class="joinp__step-desc">This is where the next event gets announced, and where you ask everything between them.</p>
        <div class="joinp__channels">${renderChannelButtons(open)}</div>
      </section>`
    : "";

  // The roster step says what the link does, because "Join" on its own
  // is what made a visitor think this button was the Discord invite.
  //
  // It also has to say what the link ASKS for, and now more than
  // before: this is the step standing between the visitor and the
  // invite, so being coy about the name and the email would be a
  // toll booth with no sign on it. Say what is asked, say what it is
  // for, and stop.
  const rosterStep = offer.joinUrl
    ? `
      <section class="joinp__step">
        <h3 class="joinp__step-title">Sign up</h3>
        <p class="joinp__step-desc">The form asks for your name and email. It puts you on the leaderboard, makes your check-ins at events count toward it, and gives the eboard an address to send you what is coming up. It takes a minute and there is nothing to pay.</p>
        <a class="btn btn--primary joinp__roster" href="${escapeAttr(offer.joinUrl)}" rel="noopener">Sign up</a>
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
      ${rosterStep}
      ${renderLocked(locked)}
      ${channelStep}
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
