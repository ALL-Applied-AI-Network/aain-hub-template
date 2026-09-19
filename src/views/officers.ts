/* The Officers destination — #officers.

   Ben's ask, word for word: "easy navbar to see who their officers
   are". This is that page: the whole roster at full size in the order
   the dashboard returns it (President first, by role_order), and the
   chapter's own About paragraph under it.

   Two rules decide how it reads at the two extremes:

   - A role renders only when it is truthy after trim(). ROAR's single
     officer has role: "" — a grey uppercase line with nothing in it
     under a name reads as a rendering bug, not as an officer without a
     title.
   - About renders only when the chapter wrote one. The two-paragraph
     template fallback that shipped before this ("We're part of the ALL
     Applied AI Network…") was template voice on the club's own page,
     live on MSOE and ROAR alike.

   Neither section carries a head: the .page-header band above already
   says Leadership / Officers, and printing that twice 200 px apart is
   the duplication this pass exists to kill. About keeps a sub-head,
   because it is a second block on the same page.

   Mounts at most once, on first entry to the tab (see lib/view.ts). */

import type { Officer } from "../lib/bundle";
import { officerInitials } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { renderInlineMarkdown } from "../lib/markdown";
import { safeHttpUrl } from "../lib/net";
import { registerView, type ViewCtx } from "../lib/view";

/**
 * Drop the kicker + H2 head from a destination section. The
 * .page-header band is the only head on a destination — #sec-officers
 * used to print "LEADERSHIP / Meet the eboard" directly under a band
 * that already said "Leadership / Officers".
 *
 * index.html now ships these sections headless, so this is belt and
 * braces for a fork whose markup still carries the old heads. It is a
 * no-op against the markup in this repo.
 */
function dropSectionHead(section: HTMLElement | null): void {
  if (!section) return;
  section
    .querySelectorAll(".section__head, .section__kicker, .section__title")
    .forEach((el) => el.remove());
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

/** The roster. An empty roster removes the section — a public page with
 *  an empty officer grid on it is worse than a page without one. */
function renderRoster(ctx: ViewCtx): void {
  const grid = ctx.el("officers-grid");
  if (!grid) return;

  const officers = ctx.bundle.config?.officers ?? [];
  if (!officers.length) {
    ctx.el("sec-officers")?.remove();
    return;
  }

  dropSectionHead(ctx.el("sec-officers"));
  // API order is already President-first by role_order. Duplicate roles
  // (MSOE has three Technical Strategists) sit adjacent because that is
  // where the chapter put them — do not group, dedupe or divide.
  grid.innerHTML = officers.map(renderOfficerCard).join("");
}

/** The chapter's own About text, under the roster. */
function renderAbout(ctx: ViewCtx): void {
  const section = ctx.el("sec-about");
  const content = ctx.el("about-content");
  if (!section || !content) return;

  const about = (ctx.bundle.config?.about ?? "").trim();
  if (!about) {
    section.remove();
    return;
  }

  // The kicker + "Who we are" H2 go; a plain sub-head replaces them so
  // the block still announces itself under the page band.
  dropSectionHead(section);
  const inner = section.querySelector(".section__inner");
  if (inner && !inner.querySelector(".section__subhead")) {
    const head = document.createElement("h3");
    head.className = "section__subhead";
    head.textContent = "About us";
    inner.insertBefore(head, content);
  }

  content.innerHTML = about
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${renderInlineMarkdown(p)}</p>`)
    .join("");
}

registerView("officers", (ctx) => {
  renderRoster(ctx);
  renderAbout(ctx);
});
