/* The Sponsor destination — #sponsor.

   A hand-off, not a second sponsorship product.

   The involvement platform already owns tiered sponsorship at
   sponsors.all-ai-network.org/chapters/{slug}: the organisers, "Work
   with this chapter", Bronze / Silver / Gold with real prices, "Give
   directly", past partners, the project briefs and the network rollup.
   None of that is rebuilt here. This page is the chapter's own short
   pitch and two doors:

     1. "Sponsor Organization →" — the whole tiered funnel, on the
        platform that runs it.
     2. The chapter's own inbox, inlined below. It is a genuinely
        different thing from the funnel: it posts to
        /api/public/sponsor/{slug}, which lands in the eboard's Inbox
        tab and survives officer turnover, and it is the right door for
        "can you speak at our thing", "we're hiring", "what would it
        cost to feed 40 people pizza".

   This page replaces the sponsor modal. The form below is that modal's
   form — the same fields, the same validation, the same POST, the same
   success and error states — moved into the page, because a partner
   reading a chapter's site wants a page they can send to a colleague,
   not a dialog that vanishes on Escape. `#sponsor` is now a route to
   here rather than a modal trigger, so every "Become a partner" link
   already in the wild still lands somewhere correct.

   Mounts at most once, on first entry to the tab (see lib/view.ts). */

import { plural } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { registerView, type ViewCtx } from "../lib/view";

/** The dashboard, which owns the chapter's outreach inbox. */
const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/** The involvement platform, which owns tiers, prices and payment. */
const INVOLVEMENT_ORIGIN = "https://sponsors.all-ai-network.org";

/**
 * Which chapter this page sponsors, set once by main.ts.
 *
 * Deliberately not read from ViewCtx.slug: that value honours the
 * dashboard preview's ?slug= param, and a query string any link can set
 * must never decide where a partner's message is delivered (security
 * audit 2026-08-18, finding 6 — a diverted sponsor lead is the part of
 * it that costs real money). main.ts passes the canonical slug, the
 * same one the modal used.
 */
let target: { slug: string; name: string } | null = null;

export function setSponsorChapter(next: { slug: string; name: string } | null): void {
  target = next && next.slug ? next : null;
}

/* ── The pitch ───────────────────────────────────────────────────── */

/**
 * The chapter's own numbers, as chips. Each one is dropped below 2 —
 * "1 event" is not a reach a sponsor is buying, and a zero never
 * reaches the page at all. A chapter with nothing to count renders no
 * strip and the page is the two doors, which is still true and still
 * useful on the day a chapter is founded.
 */
function factChips(ctx: ViewCtx): string {
  const chapter = ctx.bundle.chapter;
  const counts: { n: number; one: string }[] = [
    { n: chapter?.member_count ?? 0, one: "member" },
    { n: chapter?.event_count ?? 0, one: "event" },
    { n: (ctx.bundle.projects ?? []).length, one: "project" },
  ].filter((c) => c.n >= 2);
  if (!counts.length) return "";
  return `<div class="sponsor-page__facts">${counts
    .map((c) => `<span class="chip chip--num">${escapeHtml(plural(c.n, c.one))}</span>`)
    .join("")}</div>`;
}

/** The chapter's own sentence, or none. There is no generic fallback:
 *  a made-up line about a "vibrant student community" under a real
 *  club's name is the tell this redesign spent a pass removing. */
function pitchLine(ctx: ViewCtx): string {
  const tagline = (ctx.bundle.config?.tagline ?? "").trim();
  return tagline ? `<p class="section__desc">${escapeHtml(tagline)}</p>` : "";
}

/* ── The form ────────────────────────────────────────────────────── */

/** The modal's form, verbatim in everything a visitor can see. The only
 *  changes are structural: `.sponsor-modal__*` became `.sponsor-form__*`
 *  now that there is no modal, and the success state lost its "Close"
 *  button, because a page is not something you close. */
function formHtml(chapterName: string): string {
  return `
    <div class="block-head">
      <h2 class="section__subhead">Or write to the eboard</h2>
      <p class="section__desc">
        Sponsor an event, bring a speaker, recruit our members, or propose
        something else. Your note lands directly in the eboard's inbox —
        they'll get back within a few days.
      </p>
    </div>
    <form class="sponsor-form" novalidate aria-label="Contact ${escapeAttr(chapterName)}">
      <div class="sponsor-field">
        <label class="sponsor-field__label" for="sponsor-name">Your name *</label>
        <input class="sponsor-field__input" id="sponsor-name" name="name" type="text" required maxlength="200" autocomplete="name" />
      </div>
      <div class="sponsor-field sponsor-field--row">
        <div class="sponsor-field__col">
          <label class="sponsor-field__label" for="sponsor-email">Email *</label>
          <input class="sponsor-field__input" id="sponsor-email" name="email" type="email" required maxlength="320" autocomplete="email" />
        </div>
        <div class="sponsor-field__col">
          <label class="sponsor-field__label" for="sponsor-company">Company / organization</label>
          <input class="sponsor-field__input" id="sponsor-company" name="company" type="text" maxlength="200" autocomplete="organization" />
        </div>
      </div>
      <div class="sponsor-field">
        <label class="sponsor-field__label" for="sponsor-phone">Phone (optional)</label>
        <input class="sponsor-field__input" id="sponsor-phone" name="phone" type="tel" maxlength="50" autocomplete="tel" placeholder="Optional — easier than email if it's time-sensitive" />
      </div>
      <div class="sponsor-field">
        <label class="sponsor-field__label" for="sponsor-message">Message *</label>
        <textarea class="sponsor-field__input sponsor-field__textarea" id="sponsor-message" name="message" required minlength="10" maxlength="5000" rows="5" placeholder="What would you like to partner on? The more detail, the faster we can reply."></textarea>
      </div>
      <!-- Honeypot — off-screen on the CSS side, real users never touch
           this, bots that auto-fill every field will. Server drops any
           submission with content here. -->
      <div class="sponsor-field__honeypot" aria-hidden="true">
        <label>Website <input name="website" type="text" tabindex="-1" autocomplete="off" /></label>
      </div>
      <div class="sponsor-form__status" role="status" aria-live="polite"></div>
      <div class="sponsor-form__actions">
        <button type="submit" class="btn btn--primary sponsor-form__submit">
          <span class="sponsor-form__submit-label">Send inquiry</span>
        </button>
      </div>
    </form>
    <div class="sponsor-form__success" hidden>
      <div class="sponsor-form__success-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3 class="sponsor-form__success-title">Got it — thanks for reaching out.</h3>
      <p class="sponsor-form__success-desc">
        The eboard has your note and typically replies within a few days.
        If anything's urgent, feel free to email us directly.
      </p>
    </div>`;
}

/** Wire the inbox form. The submit path, the body it posts and every
 *  message it can show are the modal's, unchanged. */
function wireForm(host: HTMLElement, slug: string): void {
  const form = host.querySelector<HTMLFormElement>(".sponsor-form");
  const statusEl = host.querySelector<HTMLElement>(".sponsor-form__status");
  const successEl = host.querySelector<HTMLElement>(".sponsor-form__success");
  const submitBtn = host.querySelector<HTMLButtonElement>(".sponsor-form__submit");
  const submitLabel = host.querySelector<HTMLElement>(".sponsor-form__submit-label");
  if (!form || !statusEl || !successEl || !submitBtn || !submitLabel) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.classList.remove("sponsor-form__status--error");

    const fd = new FormData(form);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim() || null,
      message: String(fd.get("message") ?? "").trim(),
      website: String(fd.get("website") ?? ""),
    };

    if (!body.name || !body.email || !body.message) {
      statusEl.textContent = "Please fill in the required fields.";
      statusEl.classList.add("sponsor-form__status--error");
      return;
    }
    if (body.message.length < 10) {
      statusEl.textContent = "Add a bit more detail — 10 characters minimum.";
      statusEl.classList.add("sponsor-form__status--error");
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = "Sending…";
    try {
      const res = await fetch(
        `${DASHBOARD_ORIGIN}/api/public/sponsor/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent =
          (data && typeof data.error === "string" && data.error) ||
          "Couldn't send — please try again.";
        statusEl.classList.add("sponsor-form__status--error");
        submitBtn.disabled = false;
        submitLabel.textContent = "Send inquiry";
        return;
      }
      // Swap to the success state in place. The visitor stays on the
      // page they were reading and the confirmation is part of it,
      // rather than a flash that disappears with the dialog.
      form.hidden = true;
      successEl.hidden = false;
      successEl.scrollIntoView({ block: "nearest" });
    } catch {
      statusEl.textContent =
        "Network error — please try again, or email the eboard directly.";
      statusEl.classList.add("sponsor-form__status--error");
      submitBtn.disabled = false;
      submitLabel.textContent = "Send inquiry";
    }
  });
}

/** The inner container, created if index.html did not ship one — the
 *  same helper events.ts and projects.ts use, for the same reason. */
function viewHost(ctx: ViewCtx): HTMLElement | null {
  const existing = ctx.el("sponsor-view");
  if (existing) return existing;
  const outer = document.querySelector<HTMLElement>(
    `[data-page="sponsor"][data-section="sponsor"]`,
  );
  if (!outer) return null;
  const inner = document.createElement("div");
  inner.className = "section__inner section__inner--narrow";
  inner.id = "sponsor-view";
  outer.replaceChildren(inner);
  return inner;
}

export function mountSponsorView(ctx: ViewCtx): void {
  if (!target) {
    // No chapter resolved, so the platform link would point at nothing
    // and the form would post nowhere. main.ts drops the tab for the
    // same reason; this is the answer for a bundle that changed under
    // us.
    ctx.el("sec-sponsor")?.remove();
    return;
  }
  const host = viewHost(ctx);
  if (!host) return;

  const involvement = `${INVOLVEMENT_ORIGIN}/chapters/${encodeURIComponent(target.slug)}`;

  host.innerHTML = `
    <div class="sponsor-page__handoff">
      ${pitchLine(ctx)}
      ${factChips(ctx)}
      <a class="btn btn--primary sponsor-page__cta" href="${escapeAttr(involvement)}" target="_blank" rel="noopener">
        Sponsor Organization <span aria-hidden="true">→</span>
      </a>
      <p class="sponsor-page__note">
        Tiers, prices and what each one includes live on the network's
        involvement platform, alongside the organisers and the projects a
        sponsor would be backing.
      </p>
    </div>
    ${formHtml(target.name)}`;

  wireForm(host, target.slug);
}

registerView("sponsor", mountSponsorView);
