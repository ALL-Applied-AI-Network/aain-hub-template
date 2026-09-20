/* The Projects destination.

   41 projects on MSOE, credited to 120 students — and the bundle has
   been shipping those names since projects existed without a single one
   ever reaching the page. The byline is the point of this view: there is
   no project detail page and `link_url` is null on all 41, so the card
   IS the record, and a record of student work that does not say who did
   it is not a record.

   A chapter with no projects never reaches this view — `pagesWithContent`
   drops the tab — so there is no "no projects yet" state to write. What
   there is instead: a card that renders correctly with no photo, no
   description, no files, no linked event and no members, because that is
   what a chapter's first project looks like the day it is entered. */

import { eventPageHref } from "../event-page";
import type { ProjectFileRow, ProjectRow } from "../lib/bundle";
import { isCaptureStill } from "../lib/capture";
import { escapeAttr, escapeHtml } from "../lib/html";
import { safeHttpUrl } from "../lib/net";
import { registerView, type ViewCtx } from "../lib/view";

/** `projects[].members` is live on the public bundle today — verified
 *  against msoe-ai-club: 41 projects, 120 members, roles "author" and
 *  "advisor". It is not yet declared on `ProjectRow` in src/lib/bundle.ts,
 *  which this file does not own, so it is read through a narrowing type
 *  until it lands there. */
export interface ProjectMember {
  name: string;
  role: string;
}
/* Exported because Home's Explore block names the newest project's
   builders with the same renderByline, and a second narrowing type in
   main.ts is a second place the members field can be got wrong. */
export type ProjectWithMembers = ProjectRow & { members?: ProjectMember[] | null };

const ALL = "";

/** Names on the byline before it becomes " +N". Three is what fits on
 *  one line of a 320px card; the fourth name is where a byline turns
 *  into a paragraph. */
const BYLINE_NAMES = 3;

/** Description length that gets a More button without measuring. Only
 *  used when the card cannot be measured (it is mounted while its tab is
 *  still display:none); the real test is scrollHeight, applied a frame
 *  later. MSOE's median description is 386 characters and its longest is
 *  1101, so this is roughly "longer than the clamp". */
const CLAMP_FALLBACK_CHARS = 260;

/* ── Years ────────────────────────────────────────────────────────── */

export interface YearFilter {
  /** The chapter's own string, verbatim: "2024-2025", or whatever else
   *  an officer typed into a free-text field. */
  year: string;
  /** "2024–25" for the academic-year form, the raw string otherwise. */
  label: string;
  slug: string;
  count: number;
}

const ACADEMIC_YEAR = /^(\d{4})-(\d{4})$/;

/** "2024-2025" → "2024–25". Anything else renders exactly as typed —
 *  chapter data is never rewritten, only abbreviated where the shape is
 *  unambiguous. */
export function yearLabel(year: string): string {
  const match = ACADEMIC_YEAR.exec(year.trim());
  return match ? `${match[1]}–${match[2].slice(2)}` : year.trim();
}

function yearSlug(year: string): string {
  return year
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Year chips, newest first, with anything unparseable sorted last in the
 * order it appeared. Empty when there is nothing to choose between —
 * one group is not a filter.
 */
export function deriveYearFilters(projects: ProjectRow[]): YearFilter[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const year = (p.year ?? "").trim();
    if (!year) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  if (counts.size < 2) return [];

  const order = [...counts.keys()];
  const used = new Set<string>();
  return [...counts.entries()]
    .sort((a, b) => {
      const sa = ACADEMIC_YEAR.exec(a[0].trim())?.[1] ?? /^(\d{4})/.exec(a[0].trim())?.[1];
      const sb = ACADEMIC_YEAR.exec(b[0].trim())?.[1] ?? /^(\d{4})/.exec(b[0].trim())?.[1];
      if (sa && sb) return Number(sb) - Number(sa);
      if (sa) return -1;
      if (sb) return 1;
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([year, count], i) => {
      let slug = yearSlug(year) || `year-${i + 1}`;
      while (used.has(slug)) slug += "-x";
      used.add(slug);
      return { year, label: yearLabel(year), slug, count };
    });
}

function renderYearChips(years: YearFilter[], total: number): string {
  if (!years.length) return "";
  const chip = (slug: string, label: string, n: number) => `
    <button class="filter-chip${slug === ALL ? " filter-chip--active" : ""}" type="button"
            data-filter="${escapeAttr(slug)}" aria-pressed="${slug === ALL}">
      ${escapeHtml(label)}<span class="filter-chip__n">${n}</span>
    </button>`;
  return `
    <div class="filter-chips" role="group" aria-label="Filter projects by year">
      ${chip(ALL, "All", total)}
      ${years.map((y) => chip(y.slug, y.label, y.count)).join("")}
    </div>`;
}

/* ── One project, one card ────────────────────────────────────────── */

/**
 * The byline — the students who built it.
 *
 * Payload order is kept, because that is the order an officer entered
 * them in and it is usually the order that matters. Advisors are marked
 * rather than separated: a faculty advisor on a student project is a
 * fact about the credit, and hiding it would over-claim.
 */
export function renderByline(members: ProjectMember[]): string {
  const named = members
    .map((m) => ({ name: (m.name ?? "").trim(), role: (m.role ?? "").trim().toLowerCase() }))
    .filter((m) => m.name.length > 0);
  if (!named.length) return "";
  const shown = named
    .slice(0, BYLINE_NAMES)
    .map((m) => (m.role === "advisor" ? `${m.name} (advisor)` : m.name))
    .join(", ");
  const rest = named.length - BYLINE_NAMES;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

const FILE_KIND_LABELS: Record<ProjectFileRow["kind"], string> = {
  paper: "Paper",
  slides: "Slides",
  video: "Video",
  image: "Image",
  link: "Link",
  other: "File",
};

/**
 * The project card. Exported because the home page's "What we've built"
 * band shows three of these, and two renderers for one record is how the
 * byline goes missing on one of them.
 */
export function renderProjectCard(p: ProjectRow, pathname: string): string {
  const project = p as ProjectWithMembers;
  const year = (p.year ?? "").trim();
  const byline = renderByline(project.members ?? []);
  const description = (p.description ?? "").trim();

  // No placeholder imagery, ever. A project with no photo is a card that
  // starts at its title, not a card with a grey rectangle on top.
  const photo = p.image_url
    ? `<div class="project-card__photo">
         <img src="${escapeAttr(p.image_url)}" alt="" loading="lazy" />
         ${year ? `<span class="project-card__year">${escapeHtml(yearLabel(year))}</span>` : ""}
       </div>`
    : "";

  // `.rec__meta` is the site's meta line — a wrapping row of chips. Used
  // here rather than a project-only class because that is exactly what
  // this is, and one meta line beats two that drift.
  const chips: string[] = [];
  if (year && !photo) {
    // The year lives on the photo when there is one; without a photo it
    // still has to be somewhere.
    chips.push(`<span class="chip">${escapeHtml(yearLabel(year))}</span>`);
  }
  if (p.event) {
    // 0 of MSOE's 41 projects carry a linked event today — that is an
    // entry gap, not a code gap, and this is the link the day an officer
    // fills one in.
    chips.push(
      `<a class="chip" href="${escapeAttr(eventPageHref(p.event.id, pathname))}">From ${escapeHtml(p.event.title)}</a>`,
    );
  }
  for (const file of p.files ?? []) {
    const href = safeHttpUrl(file.url);
    if (!href) continue;
    chips.push(
      `<a class="chip" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        FILE_KIND_LABELS[file.kind] ?? "File",
      )} <span aria-hidden="true">↗</span></a>`,
    );
  }
  const linkHref = p.link_url ? safeHttpUrl(p.link_url) : null;
  if (linkHref) {
    chips.push(
      `<a class="chip" href="${escapeAttr(linkHref)}" target="_blank" rel="noopener noreferrer">View project <span aria-hidden="true">↗</span></a>`,
    );
  }

  return `
    <article class="project-card project-card--rich" role="listitem" data-year="${escapeAttr(yearSlug(year))}">
      ${photo}
      <div class="project-card__body">
        <h3 class="project-card__title">${escapeHtml(p.title)}</h3>
        ${byline ? `<p class="project-card__byline">${escapeHtml(byline)}</p>` : ""}
        ${description ? `<p class="project-card__desc">${escapeHtml(description)}</p>` : ""}
        ${
          description
            ? `<button class="project-card__expand" type="button" hidden>More</button>`
            : ""
        }
        ${chips.length ? `<div class="rec__meta">${chips.join("")}</div>` : ""}
      </div>
    </article>`;
}

/* ── Expanding a description ──────────────────────────────────────── */

/**
 * Reveal the More button only on the cards that are actually clipped.
 *
 * A view mounts on first entry to its tab, and `showPage` flips the
 * section visible AFTER the mount runs, so nothing here can be measured
 * during mount — every card reports a height of zero. One frame later it
 * can. If it still cannot (a preview iframe that never shows the tab, a
 * browser that skips the frame), the character count decides, which is
 * wrong slightly more often and never leaves the button dead.
 *
 * Capture mode skips the measurement entirely. Text height depends on
 * whether the webfont has landed, so two `?still=1` loads could disagree
 * about which cards get a button — and a capture that is not identical
 * twice is not a capture anyone can compare against.
 *
 * Returns whether anything could actually be measured.
 */
function settleExpanders(host: HTMLElement, deterministic: boolean): boolean {
  let measured = deterministic;
  host.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
    const desc = card.querySelector<HTMLElement>(".project-card__desc");
    const button = card.querySelector<HTMLElement>(".project-card__expand");
    if (!desc || !button) return;
    const measurable = !deterministic && desc.clientHeight > 0;
    if (measurable) measured = true;
    button.hidden = !(measurable
      ? desc.scrollHeight - desc.clientHeight > 4
      : (desc.textContent ?? "").length > CLAMP_FALLBACK_CHARS);
  });
  return measured;
}

function wireExpanders(host: HTMLElement): void {
  // Run once now, and only ask for a frame if this pass had nothing to
  // measure. The buttons are already correct-ish from the character
  // count, so nothing waits on a frame that may never come: a view
  // mounted in a background tab does not get one until the tab is
  // looked at, and rAF is exactly where that stalls.
  const deterministic = isCaptureStill();
  if (!settleExpanders(host, deterministic)) {
    requestAnimationFrame(() => settleExpanders(host, deterministic));
  }

  host.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".project-card__expand",
    );
    if (!button) return;
    const card = button.closest<HTMLElement>(".project-card");
    const desc = card?.querySelector<HTMLElement>(".project-card__desc");
    if (!card || !desc) return;
    const open = !card.classList.contains("project-card--open");
    card.classList.toggle("project-card--open", open);
    // The clamp is a stylesheet rule and the open state is another one.
    // Set it inline as well, so the button does something on the day the
    // markup ships ahead of the CSS — a control that visibly does
    // nothing is worse than no control.
    desc.style.webkitLineClamp = open ? "unset" : "";
    desc.style.display = open ? "block" : "";
    button.textContent = open ? "Less" : "More";
  });
}

/* ── Filtering ────────────────────────────────────────────────────── */

function applyFilter(host: HTMLElement, slug: string): void {
  const isAll = slug === ALL;
  host.querySelectorAll<HTMLElement>(".project-card").forEach((card) => {
    card.style.display = isAll || card.dataset.year === slug ? "" : "none";
  });
  host.querySelectorAll<HTMLElement>(".filter-chip").forEach((chip) => {
    const active = (chip.dataset.filter ?? ALL) === slug;
    chip.classList.toggle("filter-chip--active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

function filterFromHash(years: YearFilter[]): string {
  const [key, sub] = window.location.hash.replace(/^#/, "").split("/");
  if (key !== "projects" || !sub) return ALL;
  return years.some((y) => y.slug === sub) ? sub : ALL;
}

/* ── Mount ────────────────────────────────────────────────────────── */

/** See the identical helper in ./events — the destination's section is
 *  found by its page/section pair because the id belongs to index.html,
 *  and its children are replaced because a destination's only head is
 *  the `.page-header` band above it. */
function viewHost(ctx: ViewCtx, innerId: string, page: string, section: string): HTMLElement | null {
  const existing = ctx.el(innerId);
  if (existing) return existing;
  const outer = document.querySelector<HTMLElement>(
    `[data-page="${page}"][data-section="${section}"]`,
  );
  if (!outer) return null;
  const inner = document.createElement("div");
  inner.className = "section__inner";
  inner.id = innerId;
  outer.replaceChildren(inner);
  return inner;
}

export function mountProjectsView(ctx: ViewCtx): void {
  const projects = ctx.bundle.projects ?? [];
  // No projects means no Projects tab, so this guards against a bundle
  // that changed under us rather than a state a visitor can reach.
  if (!projects.length) return;

  const host = viewHost(ctx, "projects-view", "projects", "projects");
  if (!host) return;

  const years = deriveYearFilters(projects);

  // Bundle order inside the grid: the dashboard's project list is the
  // order officers arranged, and the year chips are how you narrow it.
  host.innerHTML = `
    ${renderYearChips(years, projects.length)}
    <div class="projects-grid" role="list">
      ${projects.map((p) => renderProjectCard(p, ctx.pathname)).join("")}
    </div>`;

  host.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>(".filter-chip");
    if (!chip) return;
    const slug = chip.dataset.filter ?? ALL;
    // The hash carries the filter so Back works and a year is shareable.
    // Applied here too: setting the hash it already has fires nothing.
    window.location.hash = slug === ALL ? "projects" : `projects/${slug}`;
    applyFilter(host, slug);
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash.replace(/^#/, "").split("/")[0] !== "projects") return;
    applyFilter(host, filterFromHash(years));
  });

  applyFilter(host, filterFromHash(years));
  wireExpanders(host);
}

registerView("projects", mountProjectsView);
