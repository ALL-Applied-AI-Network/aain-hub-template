/* The About destination — #about.

   Two blocks, in this order: what the club is, then the people who run
   it. It replaces the Officers tab (src/views/officers.ts, deleted in
   the same pass), and the move is the point rather than a tidy-up.

   Officers were being shown next to the leaderboard, which made them
   read as the top of it. They are not: a board is a score members earn
   by turning up, and an eboard is not competing for one. So officers
   are people here — a face or a monogram, a name, a role, and an
   address that reaches them — and the board stands on its own on Home.

   Two rules decide how the page reads at the two extremes:

   - A role renders only when it is truthy after trim(). ROAR's single
     officer has role: "" — a grey uppercase line with nothing in it
     under a name reads as a rendering bug, not as an officer without a
     title.
   - The About paragraph renders only when the chapter wrote one. There
     is no template fallback: "We're part of the ALL Applied AI
     Network…" was template voice on the club's own page, live on MSOE
     and ROAR alike, and NTUA — which has neither a paragraph nor an
     officer — loses the tab entirely rather than gaining an empty one.

   Neither section carries a page head: the .page-header band above
   already says The club / About, and printing that twice 200 px apart
   is the duplication this pass exists to kill. The roster keeps a
   sub-head because it is the second block on the same page.

   Mounts at most once, on first entry to the tab (see lib/view.ts). */

import type { Officer } from "../lib/bundle";
import { officerInitials } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { renderInlineMarkdown } from "../lib/markdown";
import { safeHttpUrl } from "../lib/net";
import { registerView, type ViewCtx } from "../lib/view";

/**
 * The inner container a block renders into, created if index.html did
 * not ship one. Identified by the page/section pair rather than by an
 * id, because the id is index.html's to choose and this view does not
 * own that file — the same helper events.ts and projects.ts use.
 *
 * Replacing the section's children is deliberate: a destination's only
 * head is the .page-header band, so any .section__head a fork still
 * carries goes with it.
 */
function viewHost(
  ctx: ViewCtx,
  innerId: string,
  page: string,
  section: string,
  extraClass = "",
): HTMLElement | null {
  const existing = ctx.el(innerId);
  if (existing) return existing;
  const outer = document.querySelector<HTMLElement>(
    `[data-page="${page}"][data-section="${section}"]`,
  );
  if (!outer) return null;
  const inner = document.createElement("div");
  inner.className = `section__inner${extraClass ? ` ${extraClass}` : ""}`;
  inner.id = innerId;
  outer.replaceChildren(inner);
  return inner;
}

/**
 * A mailto is only built for a value that looks like one address. The
 * field is officer-entered and stored raw, so whitespace in it would
 * let a second header ride along inside the href.
 */
function mailtoHref(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!/^[^\s<>"'@,;]+@[^\s<>"'@,;]+\.[^\s<>"'@,;]+$/.test(v)) return null;
  return `mailto:${v}`;
}

/**
 * Whether this officer's card will carry a way to reach them.
 *
 * The About header line offers "and how to reach them", and that offer
 * has to be checked against the page rather than assumed from the
 * roster existing: ROAR's single officer has neither an email nor a
 * LinkedIn, so the card is a monogram and a name and the offer was
 * false there. Built from the same two helpers renderOfficerCard uses
 * below, so the line and the card cannot disagree about what a
 * reachable officer is.
 */
export function officerIsReachable(o: Officer): boolean {
  return !!mailtoHref(o.email) || !!(o.linkedin && safeHttpUrl(o.linkedin));
}

/**
 * One officer. linkedin is 0/13 on MSOE and email is 13/13, so email is
 * the affordance that actually exists — but the LinkedIn branch stays
 * for the chapters that fill it in.
 */
function renderOfficerCard(o: Officer): string {
  const name = escapeHtml(o.name);
  const avatar = o.image_url
    ? `<img src="${escapeAttr(o.image_url)}" alt="" loading="lazy" />`
    : escapeHtml(officerInitials(o.name));

  const role = (o.role ?? "").trim();
  const roleHtml = role
    ? `<div class="officer-card__role">${escapeHtml(role)}</div>`
    : "";

  const mailto = mailtoHref(o.email);
  const linkedin = o.linkedin ? safeHttpUrl(o.linkedin) : null;
  const contacts = [
    mailto
      ? `<a class="officer-card__contact link--arrow" href="${escapeAttr(mailto)}" aria-label="Email ${escapeAttr(o.name)}">Email</a>`
      : "",
    linkedin
      ? `<a class="officer-card__contact link--arrow" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(o.name)} on LinkedIn">LinkedIn</a>`
      : "",
  ].join("");
  const contactsHtml = contacts
    ? `<div class="officer-card__links">${contacts}</div>`
    : "";

  return `
    <div class="officer-card" role="listitem">
      <div class="officer-card__avatar">${avatar}</div>
      <div class="officer-card__name">${name}</div>
      ${roleHtml}
      ${contactsHtml}
    </div>
  `;
}

/** The chapter's own About text, at the top of the page. */
function renderAbout(ctx: ViewCtx): void {
  const about = (ctx.bundle.config?.about ?? "").trim();
  if (!about) {
    // Nothing of the chapter's own to say here. The section goes rather
    // than standing empty above the roster; pruneEmptySections has
    // usually already removed it, and this is the same answer for a
    // bundle that changed under us.
    ctx.el("sec-about")?.remove();
    return;
  }

  const host = viewHost(ctx, "about-view", "about", "about", "section__inner--narrow");
  if (!host) return;

  host.innerHTML = `
    <div class="about-content" id="about-content">
      ${about
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p) => `<p>${renderInlineMarkdown(p)}</p>`)
        .join("")}
    </div>`;
}

/** The roster. An empty roster removes the section — a public page with
 *  an empty officer grid on it is worse than a page without one. */
function renderRoster(ctx: ViewCtx): void {
  const officers = ctx.bundle.config?.officers ?? [];
  if (!officers.length) {
    ctx.el("sec-officers")?.remove();
    return;
  }

  const host = viewHost(ctx, "officers-view", "about", "officers");
  if (!host) return;

  // API order is already President-first by role_order. Duplicate roles
  // (MSOE has three Technical Strategists) sit adjacent because that is
  // where the chapter put them — do not group, dedupe or divide.
  host.innerHTML = `
    <div class="block-head">
      <h2 class="section__subhead">Officers</h2>
    </div>
    <div class="officers-grid" id="officers-grid" role="list">
      ${officers.map(renderOfficerCard).join("")}
    </div>`;
}

export function mountAboutView(ctx: ViewCtx): void {
  renderAbout(ctx);
  renderRoster(ctx);
}

registerView("about", mountAboutView);
