/* The Events destination.

   MSOE has run 59 events over three years and the site has been
   rendering one of them. This is the room the nav's "Events" tab opens
   onto: everything that is still ahead, pinned as full cards, and then
   every event the chapter has ever run as a reverse-chronological feed
   grouped by year.

   Two rules shape almost every decision in here:

   1. Every way into an event is `eventPageHref(id, pathname)` — the
      flyer takeover in ../event-page.ts. Nothing in this file builds an
      event URL by hand, so `?event=` stays the one contract the
      dashboard mints, middleware unfurls and this site opens.

   2. The chapter with one event gets the same page as the chapter with
      59, minus the parts that would be lying. No zero is ever printed,
      a count line only appears from two upwards, and a section with
      nothing in it is absent rather than empty. A chapter with no events
      at all never reaches this view: `pagesWithContent` drops the tab,
      so the cases handled here are "one event" and "some events".

   The filter chips are derived from the `type` values actually present
   in the data. There is no hardcoded list of event types anywhere in
   this file — chapters invent their own ("DH 449", "ROSIE
   Competition"), and a chip row that knows about Hackathons but not
   about DH 449 is a chip row that lies about the archive. */

import { eventPageHref } from "../event-page";
import type { EventRow } from "../lib/bundle";
import { isCaptureStill } from "../lib/capture";
import {
  futureEventsAscending,
  isFutureEvent,
  pastEventsDescending,
  renderEventCard,
} from "../lib/events";
import { plural, zoneParts } from "../lib/format";
import { escapeAttr, escapeHtml } from "../lib/html";
import { plainText } from "../plain-text";
import { registerView, type ViewCtx } from "../lib/view";

/** The chip that means "no filter". Not a type slug, so it can never
 *  collide with one: a chapter cannot name an event type "". */
const ALL = "";

/** How much of the archive renders before `Show earlier events`. MSOE's
 *  58 past events are ~58 rows of DOM on a phone; this shows three years
 *  of it and puts the rest one tap away. Not infinite scroll — one step,
 *  and then it is all there. */
const FEED_CUT = 40;

/** Chip row gates. Fewer than two types is not a filter, it is a label;
 *  a short archive is faster to read than to filter. */
const MIN_TYPE_CHIPS = 2;
const MIN_EVENTS_FOR_CHIPS = 8;
const MAX_TYPE_CHIPS = 6;

/* ── Types, chips and slugs ───────────────────────────────────────── */

export interface TypeFilter {
  /** The chapter's own string, verbatim. Never rewritten. */
  type: string;
  /** What the chip says — the raw type, or its trailing segment when
   *  that is unambiguous ("Speaker Event - Intro Series" → "Intro
   *  Series"). The ROW always shows the raw string. */
  label: string;
  /** Hash sub-route: `#events/{slug}`. Derived from the raw type, not
   *  the label, so a shared link survives a label rule changing. */
  slug: string;
  count: number;
}

/** A type string as a hash segment. */
export function typeSlug(type: string): string {
  return type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The chip row, derived from the events themselves.
 *
 * Types present once are dropped — a chip that filters 59 events down to
 * 1 is a worse control than scrolling. The survivors sort by how much of
 * the archive they actually are, ties alphabetically, and the row caps
 * at six so it does not become a second navigation.
 *
 * Returns an empty array when the row should not render at all, so the
 * caller has one thing to check rather than three.
 */
export function deriveTypeFilters(events: EventRow[]): TypeFilter[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const type = (e.type ?? "").trim();
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TYPE_CHIPS);

  if (ranked.length < MIN_TYPE_CHIPS || events.length < MIN_EVENTS_FOR_CHIPS) {
    return [];
  }

  // "Speaker Event - Intro Series" is the eboard's own taxonomy, and it
  // is 28 characters of chip. The trailing segment is the part that
  // distinguishes it — but only while it stays unique among the chips
  // shown, otherwise two different types would wear the same label.
  const shortened = ranked.map(([type]) => {
    const cut = type.lastIndexOf(" - ");
    return cut === -1 ? type : type.slice(cut + 3).trim() || type;
  });
  const labelUses = new Map<string, number>();
  for (const label of shortened) {
    labelUses.set(label, (labelUses.get(label) ?? 0) + 1);
  }

  const used = new Set<string>();
  return ranked.map(([type, count], i) => {
    const short = shortened[i];
    let slug = typeSlug(type) || `type-${i + 1}`;
    while (used.has(slug)) slug += "-x";
    used.add(slug);
    return {
      type,
      label: (labelUses.get(short) ?? 0) > 1 ? type : short,
      slug,
      count,
    };
  });
}

function renderFilterChips(filters: TypeFilter[], total: number): string {
  if (!filters.length) return "";
  const chip = (slug: string, label: string, n: number) => `
    <button class="filter-chip${slug === ALL ? " filter-chip--active" : ""}" type="button"
            data-filter="${escapeAttr(slug)}" aria-pressed="${slug === ALL}">
      ${escapeHtml(label)}<span class="filter-chip__n">${n}</span>
    </button>`;
  return `
    <div class="filter-chips" role="group" aria-label="Filter events by type">
      ${chip(ALL, "All", total)}
      ${filters.map((f) => chip(f.slug, f.label, f.count)).join("")}
    </div>`;
}

/* ── One event, one row ───────────────────────────────────────────── */

/** The venue, not the postal address.
 *
 *  `location` is free text and officers paste what Maps gives them:
 *  MSOE's reads "Direct Supply Innovation & Technology Center, 1020 N
 *  Broadway, Milwaukee, WI 53202, USA". A `.chip` does not wrap, so that
 *  string is 90 characters of horizontal scroll on a 375px phone. The
 *  part before the first comma is the venue — which is the part a row is
 *  for — and the full address is one tap away on the flyer, where it is
 *  a Maps link rather than a label. */
function shortLocation(location: string): string {
  const venue = location.split(",")[0].trim() || location.trim();
  return venue.length > 48 ? `${venue.slice(0, 47).trimEnd()}…` : venue;
}

/**
 * `.rec--event` — the archive row, and the same row the home page's
 * "What's on" band uses for its three recent nights. Exported so there
 * is one event row on the site rather than one per surface.
 *
 * The whole row is the link into the flyer, which is why nothing inside
 * it is an anchor: the type is a span, the location is text, and the
 * description is plain text rather than rendered markdown (a markdown
 * link inside an `<a>` is invalid and Safari drops it).
 */
export function renderEventRow(e: EventRow, pathname: string): string {
  const future = isFutureEvent(e);
  const listed = e.publish_status === "listed";
  const s = zoneParts(e.date, e.timezone);
  const end = e.end_date ? zoneParts(e.end_date, e.timezone) : null;
  const multiDay =
    end !== null && (end.year !== s.year || end.month !== s.month || end.day !== s.day);
  const endLabel = multiDay && end
    ? end.month === s.month ? `${end.day}` : `${end.monthShort} ${end.day}`
    : null;

  const chips: string[] = [];
  const type = (e.type ?? "").trim();
  if (type) chips.push(`<span class="chip">${escapeHtml(type)}</span>`);
  // A multi-day run reads as a chip rather than a third line inside the
  // date tile: the tile is a fixed 56×56 box and MSOE's hackathon runs
  // Oct 8 → Dec 4, which is two months that will not fit in it.
  if (endLabel) chips.push(`<span class="chip chip--num">→ ${escapeHtml(endLabel)}</span>`);
  if (e.location && e.location.trim()) {
    // `.rec__where` is a hook, not a style: a venue name is the widest
    // thing in the meta line and at 375px it takes a row to itself,
    // which is what turns a 60px row into a 190px one. The stylesheet
    // drops it at the same breakpoint it drops `.rec__sub` and
    // `.rec__pic`; until it does, this renders exactly as before.
    chips.push(`<span class="chip rec__where">${escapeHtml(shortLocation(e.location))}</span>`);
  }
  // Points and phase counts are counts, so they obey the counting laws:
  // a zero-point event says nothing about points, and a one-phase event
  // is just an event.
  if (!listed && e.points_attend > 0) {
    chips.push(`<span class="chip chip--num">+${escapeHtml(plural(e.points_attend, "pt"))}</span>`);
  }
  const phases = e.phases?.length ?? 0;
  if (phases > 1) {
    chips.push(`<span class="chip chip--num">${escapeHtml(plural(phases, "phase"))}</span>`);
  }
  if (listed) chips.push(`<span class="chip chip--soon">Details coming soon</span>`);

  // A listed event is an announcement with the details still withheld,
  // so its description is not ours to show yet.
  const summary = listed ? "" : plainText(e.description);

  // No placeholder imagery, ever: 7 of MSOE's 59 events have no cover,
  // and seven grey boxes down the feed is noise pretending to be data.
  const pic = e.image_url
    ? `<div class="rec__pic"><img src="${escapeAttr(e.image_url)}" alt="" loading="lazy" /></div>`
    : "";

  return `
    <a class="rec rec--event${future ? " rec--future" : ""}"
       href="${escapeAttr(eventPageHref(e.id, pathname))}"
       data-type="${escapeAttr(typeSlug(type))}">
      <div class="rec__main">
        <div class="rec__date">
          <span class="rec__date-month">${escapeHtml(s.monthShort.toUpperCase())}</span>
          <span class="rec__date-day">${s.day}</span>
        </div>
        <div class="rec__body">
          <div class="rec__title">${escapeHtml(e.title)}</div>
          ${summary ? `<div class="rec__sub">${escapeHtml(summary)}</div>` : ""}
          ${chips.length ? `<div class="rec__meta">${chips.join("")}</div>` : ""}
        </div>
        <div class="rec__end">
          ${pic}
          <span class="rec__go"><span class="rec__go-label">View </span><span aria-hidden="true">→</span></span>
        </div>
      </div>
    </a>`;
}

/* ── The feature card ─────────────────────────────────────────────── */

/**
 * The existing event card with one modifier class on it.
 *
 * `renderEventCard` already knows about covers, multi-day chips, format
 * chips, tree chips, Maps pills, virtual pills, co-host credit, points,
 * the phase timeline and the `listed` suppression rules. Re-implementing
 * any of that to get a wider card would be two renderers drifting apart,
 * so this parses its output and adds the class — no string surgery, no
 * second copy of the markup.
 *
 * `pastLabel` marks the card as the last thing that happened, for a
 * chapter with nothing scheduled. Exported for the home page's
 * "What's on" band, which is the other place a feature card appears.
 */
export function renderFeatureCard(
  e: EventRow,
  byId: Map<string, EventRow>,
  opts: { pastLabel?: boolean } = {},
): string {
  const holder = document.createElement("template");
  holder.innerHTML = renderEventCard(e, byId).trim();
  const card = holder.content.firstElementChild;
  if (!(card instanceof HTMLElement)) return "";
  card.classList.add("event-card--feature");
  card.dataset.type = typeSlug((e.type ?? "").trim());
  if (opts.pastLabel) {
    card
      .querySelector(".event-card__date")
      ?.insertAdjacentHTML("beforeend", `<span class="event-card__past">Last time</span>`);
  }
  return holder.innerHTML;
}

/* ── The two blocks ───────────────────────────────────────────────── */

function renderUpcoming(
  upcoming: EventRow[],
  archived: number,
  byId: Map<string, EventRow>,
): string {
  // Nothing scheduled and nothing run is not a state this view can be
  // in — the tab would not exist — so the only silent case is "nothing
  // scheduled, and no archive under it to point at".
  if (!upcoming.length && archived === 0) return "";
  const body = upcoming.length
    ? upcoming.map((e) => renderFeatureCard(e, byId)).join("")
    : `<p class="note">Nothing on the calendar right now. Everything this chapter has run is below.</p>`;
  return `
    <div class="events-view__block" data-upcoming>
      <div class="band-head"><h2 class="band-head__title">Coming up</h2></div>
      ${body}
    </div>`;
}

function renderArchive(
  archive: EventRow[],
  filters: TypeFilter[],
  total: number,
  pathname: string,
): string {
  if (!archive.length) return "";

  // Year groups, in the event's own timezone: an 8pm Chicago event on
  // December 31st is not next year's event just because UTC says so.
  const groups: { year: number; events: EventRow[] }[] = [];
  for (const e of archive) {
    const year = zoneParts(e.date, e.timezone).year;
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.events.push(e);
    else groups.push({ year, events: [e] });
  }

  const rendered = groups
    .map((g) => {
      const rows = g.events.map((e) => renderEventRow(e, pathname)).join("");
      return `
        <section class="group" data-year="${g.year}">
          <div class="group__head">
            <span class="group__title">${g.year}</span>
            <span class="group__n" data-group-n>${
              g.events.length >= 2 ? escapeHtml(plural(g.events.length, "event")) : ""
            }</span>
          </div>
          <div class="group__list">
            <span class="group__rule" aria-hidden="true"></span>
            ${rows}
          </div>
        </section>`;
    })
    .join("");

  const chips = renderFilterChips(filters, total);

  // The chip row leads with "All {total}", counting the upcoming
  // feature card as well as the rows. A head count beside it counts
  // only the rows, so MSOE printed "The archive 58 events" directly
  // above "All 59" — two numbers for one set, one pixel row apart.
  // The chips own the count whenever they render.
  const headCount =
    !chips && archive.length >= 2
      ? `<span class="band-head__n">${escapeHtml(plural(archive.length, "event"))}</span>`
      : "";

  return `
    <div class="events-view__block">
      <div class="band-head">
        <h2 class="band-head__title">The archive${headCount}</h2>
      </div>
      ${chips}
      <div class="events-view__feed">
        ${rendered}
        ${
          archive.length > FEED_CUT
            ? `<button class="feed-more" type="button">Show earlier events</button>`
            : ""
        }
      </div>
    </div>`;
}

/* ── Filtering ────────────────────────────────────────────────────── */

/** Show/hide by `display`, per the design: a filter is a fact about the
 *  set, not an event worth animating. Group counts follow the filter so
 *  a head never claims 24 events over three rows. */
function applyFilter(host: HTMLElement, slug: string): void {
  const isAll = slug === ALL;
  const expanded = host.dataset.feedExpanded === "1";

  const upcoming = host.querySelector<HTMLElement>("[data-upcoming]");
  if (upcoming) {
    let shown = 0;
    upcoming.querySelectorAll<HTMLElement>("[data-type]").forEach((card) => {
      const on = isAll || card.dataset.type === slug;
      card.style.display = on ? "" : "none";
      if (on) shown += 1;
    });
    // Under "All" the block may legitimately hold only the empty-calendar
    // line, which is a statement about the calendar rather than about the
    // filter — so it survives there and nowhere else.
    upcoming.style.display = isAll || shown > 0 ? "" : "none";
  }

  host.querySelectorAll<HTMLElement>(".group").forEach((group) => {
    let matching = 0;
    let visible = 0;
    group.querySelectorAll<HTMLElement>(".rec--event").forEach((row) => {
      const matches = isAll || row.dataset.type === slug;
      if (matches) matching += 1;
      // The 40-row cut is the unfiltered feed's default depth. A chosen
      // type is a small set by construction, so the cut lifts for it —
      // otherwise a type whose every event is older than the fortieth
      // would filter down to an empty page.
      const on = matches && !(isAll && !expanded && row.dataset.cut === "1");
      row.style.display = on ? "" : "none";
      if (on) visible += 1;
    });
    const count = group.querySelector<HTMLElement>("[data-group-n]");
    // The head counts what the filter matched, not what the cut left —
    // "2024 · 10 events" above six rows is true, and the button below
    // says where the other four are.
    if (count) count.textContent = matching >= 2 ? plural(matching, "event") : "";
    group.style.display = visible > 0 ? "" : "none";
  });

  const more = host.querySelector<HTMLElement>(".feed-more");
  if (more) more.style.display = isAll && !expanded ? "" : "none";

  host.querySelectorAll<HTMLElement>(".filter-chip").forEach((chip) => {
    const active = (chip.dataset.filter ?? ALL) === slug;
    chip.classList.toggle("filter-chip--active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

/** The filter named by `#events/{slug}`, or ALL. Any slug that is not a
 *  chip — a stale share, a typo — reads as no filter rather than as an
 *  empty archive. */
function filterFromHash(filters: TypeFilter[]): string {
  const hash = window.location.hash.replace(/^#/, "");
  const [key, sub] = hash.split("/");
  if (key !== "events" || !sub) return ALL;
  return filters.some((f) => f.slug === sub) ? sub : ALL;
}

/* ── Mount ────────────────────────────────────────────────────────── */

/** The element this view fills.
 *
 *  Preferred: an empty `#events-view` already in index.html. Failing
 *  that, the destination's own section — identified by the page/section
 *  pair rather than by an id, because the id is index.html's to choose
 *  and two elements now carry `data-section="events"` (the home band and
 *  this archive). Replacing its children is deliberate: a destination's
 *  only head is the `.page-header` band, so the section's old
 *  `.section__head` goes with it. */
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

/** Draw each year group's spine as it is reached. One observer, one
 *  reveal per group, unobserved on first hit — the rows themselves never
 *  animate, because 58 staggered rows is a loading screen.
 *
 *  Skipped entirely in capture mode and under reduced motion, where the
 *  spine is simply already drawn. */
function revealGroups(host: HTMLElement): void {
  const groups = [...host.querySelectorAll<HTMLElement>(".group")];
  const settled =
    isCaptureStill() ||
    typeof IntersectionObserver === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (settled) {
    groups.forEach((g) => g.classList.add("in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
  );
  groups.forEach((g) => observer.observe(g));
}

export function mountEventsView(ctx: ViewCtx): void {
  const events = ctx.bundle.events ?? [];
  // A chapter with no events has no Events tab, so this is defence
  // against a bundle that changed under us, not a render path.
  if (!events.length) return;

  const host = viewHost(ctx, "events-view", "events", "events");
  if (!host) return;

  const byId = new Map(events.map((e) => [e.id, e]));
  const upcoming = futureEventsAscending(events);
  const archive = pastEventsDescending(events);
  const filters = deriveTypeFilters(events);

  host.innerHTML =
    renderUpcoming(upcoming, archive.length, byId) +
    renderArchive(archive, filters, events.length, ctx.pathname);

  // The cut is a property of the feed, not of a row, so it is marked
  // here by position across the whole archive: "the first 40" means the
  // same thing whichever year the fortieth event falls in.
  host.querySelectorAll<HTMLElement>(".rec--event").forEach((row, i) => {
    if (i >= FEED_CUT) row.dataset.cut = "1";
  });

  host.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;

    const chip = target?.closest<HTMLElement>(".filter-chip");
    if (chip) {
      const slug = chip.dataset.filter ?? ALL;
      // The hash carries the filter so Back works and a filtered
      // archive is a link someone can send. Applied here too, because
      // setting the hash it already has fires no hashchange.
      window.location.hash = slug === ALL ? "events" : `events/${slug}`;
      applyFilter(host, slug);
      return;
    }

    const more = target?.closest<HTMLElement>(".feed-more");
    if (more) {
      host.dataset.feedExpanded = "1";
      more.remove();
      applyFilter(host, filterFromHash(filters));
    }
  });

  window.addEventListener("hashchange", () => {
    // Only when the archive is the page being looked at: another tab's
    // hash is none of this view's business.
    if (window.location.hash.replace(/^#/, "").split("/")[0] !== "events") return;
    applyFilter(host, filterFromHash(filters));
  });

  applyFilter(host, filterFromHash(filters));
  revealGroups(host);
}

registerView("events", mountEventsView);
