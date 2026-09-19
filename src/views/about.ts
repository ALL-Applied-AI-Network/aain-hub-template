/* The About destination — #about.

   Two blocks, in this order: what the club is, then the people who run
   it. It replaces the Officers tab (src/views/officers.ts, deleted in
   the same pass), and the move is the point rather than a tidy-up.

   Officers were being shown next to the leaderboard, which made them
   read as the top of it. They are not: a board is a score members earn
   by turning up, and an eboard is not competing for one. So officers
   are people here — a face or a monogram, a name, a role, and an
   address that reaches them — and the board stands on its own on Home.

   An officer card carries two kinds of public detail, and they are not
   published under the same rule. The blurb, the role, the photo and the
   typed LinkedIn are the eboard's own writing, published because the
   roster row is visible on the site. The Profile / GitHub / LinkedIn
   account links come from the ALL member account behind the row and are
   present only while that member's portfolio is published — one switch
   on their own settings page takes the portfolio and these links down
   together. So the card renders whatever arrived and never reconstructs
   a missing account link from somewhere else.

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

/* Icon marks for the two account links. Copied rather than imported:
   main.ts keeps SOCIAL_ICONS private for its 18px footer row, and a
   view importing from main.ts would close a cycle (main.ts imports
   officerIsReachable from here). Same paths, sized for a card. */
const MARK_ICONS = {
  github: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.77 5.46.77 11.73c0 4.96 3.22 9.17 7.68 10.66.56.1.77-.24.77-.54v-2.06c-3.13.68-3.79-1.3-3.79-1.3-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.72-1.5-2.5-.28-5.12-1.25-5.12-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.15a10.8 10.8 0 0 1 5.62 0c2.15-1.46 3.09-1.15 3.09-1.15.61 1.54.23 2.69.11 2.97.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.26-5.14 5.54.4.35.76 1.03.76 2.07v3.07c0 .3.21.65.78.54 4.45-1.49 7.67-5.7 7.67-10.66C23.23 5.46 18.27.5 12 .5z"/></svg>`,
  linkedin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.67H5.67v8.67zM7 8.5a1.54 1.54 0 1 0 0-3.08 1.54 1.54 0 0 0 0 3.08zm11.34 9.84v-4.75c0-2.53-1.35-3.7-3.15-3.7-1.45 0-2.1.8-2.47 1.37V9.67h-2.68s.03.76 0 8.67h2.68v-4.84c0-.24.02-.48.09-.65.18-.48.62-.98 1.35-.98.96 0 1.34.73 1.34 1.8v4.67z"/></svg>`,
};

/**
 * Every outbound link one officer card can carry, resolved once so the
 * card and officerIsReachable cannot disagree about what is there.
 *
 * The account_* fields arrive already gated by the dashboard — they are
 * present only while that member's ALL portfolio is published, and all
 * three go dark together when it is not. They are still scheme-checked
 * here like the officer-typed link: everything in this bundle is remote
 * data, and an href is an href.
 */
function officerLinks(o: Officer) {
  const profile = o.account_profile_url
    ? safeHttpUrl(o.account_profile_url)
    : null;
  const github = o.account_github_url
    ? safeHttpUrl(o.account_github_url)
    : null;
  // Same person, two possible sources. The account's link wins because
  // its owner maintains it; the officer-typed one is the fallback it
  // has always been, and is still shown when there is no account.
  const linkedinRaw = o.account_linkedin_url || o.linkedin || null;
  const linkedin = linkedinRaw ? safeHttpUrl(linkedinRaw) : null;
  return { profile, github, linkedin, mailto: mailtoHref(o.email) };
}

/**
 * Whether this officer's card will carry a way to reach them.
 *
 * The About header line offers "and how to reach them", and that offer
 * has to be checked against the page rather than assumed from the
 * roster existing: ROAR's single officer has neither an email nor a
 * LinkedIn, so the card is a monogram and a name and the offer was
 * false there. Built from the same helper renderOfficerCard uses below,
 * so the line and the card cannot disagree about what a reachable
 * officer is.
 *
 * A portfolio or a GitHub page is deliberately NOT counted: they are
 * places to read about someone, not addresses that reach them, and the
 * header line would be overclaiming.
 */
export function officerIsReachable(o: Officer): boolean {
  const { mailto, linkedin } = officerLinks(o);
  return !!mailto || !!linkedin;
}

/**
 * One officer: face or monogram, name, role, their own blurb, then the
 * links.
 *
 * The links are ordered richest-first. An ALL profile is the one
 * destination that carries everything else about them, so it leads when
 * it exists and GitHub/LinkedIn ride beside it as marks rather than
 * repeating themselves as words. Without an account the row is exactly
 * what shipped before — Email, then the officer's own LinkedIn — which
 * is what most officers will have for a while yet.
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

  // Plain text by contract (the dashboard caps it at 280 and collapses
  // whitespace), so it is escaped, not run through the markdown pass
  // the About paragraph gets. A card is not a bio page.
  const bio = (o.description ?? "").trim();
  const bioHtml = bio ? `<p class="officer-card__bio">${escapeHtml(bio)}</p>` : "";

  const { profile, github, linkedin, mailto } = officerLinks(o);
  const named = [
    profile
      ? `<a class="officer-card__contact link--arrow" href="${escapeAttr(profile)}" target="_blank" rel="noopener noreferrer" aria-label="${name}'s ALL profile">Profile</a>`
      : "",
    mailto
      ? `<a class="officer-card__contact link--arrow" href="${escapeAttr(mailto)}" aria-label="Email ${name}">Email</a>`
      : "",
    // Named only when it is the best link on the card. With a profile
    // present it becomes a mark below, so it is never on the card twice.
    linkedin && !profile
      ? `<a class="officer-card__contact link--arrow" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${name} on LinkedIn">LinkedIn</a>`
      : "",
  ].join("");
  const marks = [
    github
      ? `<a class="officer-card__mark" href="${escapeAttr(github)}" target="_blank" rel="noopener noreferrer" aria-label="${name} on GitHub">${MARK_ICONS.github}</a>`
      : "",
    linkedin && profile
      ? `<a class="officer-card__mark" href="${escapeAttr(linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${name} on LinkedIn">${MARK_ICONS.linkedin}</a>`
      : "",
  ].join("");
  const linksHtml =
    named || marks
      ? `<div class="officer-card__links">${named}${marks}</div>`
      : "";

  return `
    <div class="officer-card" role="listitem">
      <div class="officer-card__avatar">${avatar}</div>
      <div class="officer-card__name">${name}</div>
      ${roleHtml}
      ${bioHtml}
      ${linksHtml}
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
