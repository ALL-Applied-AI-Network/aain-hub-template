/* Event records: how they are ordered, and how a card is drawn.

   renderEventCard and renderPhaseRow moved out of main.ts byte for byte
   — every surface that shows an event (the home band, the events
   archive, the feature slot) renders through this one function, so its
   covers, multi-day chips, format chips, tree chips, Maps pills,
   virtual pills, co-host badges, points, phase timeline and
   `publish_status: "listed"` suppression stay in one place.

   The ordering helpers are new, and they exist because the bundle's
   ordering flipped: `?events=all` returns events DESCENDING, while the
   old implicit `upcoming` window returned them ascending. Anything
   asking "what is next" must sort its own ascending copy of the future
   subset, or it gets the farthest-out event instead of the nearest one.
*/

import { escapeAttr, escapeHtml } from "./html";
import { eventPageHref } from "../event-page";
import { zoneParts } from "./format";
import { renderRichMarkdown } from "./markdown";
import { safeHttpUrl } from "./net";
import type { EventPhase, EventRow } from "./bundle";

/* ── Ordering ─────────────────────────────────────────────────────── */

/** An event is still ahead of us until its END passes, so a multi-day
 *  event running today counts as future rather than archive. */
export function isFutureEvent(e: EventRow, now = Date.now()): boolean {
  const ends = new Date(e.end_date ?? e.date).getTime();
  return Number.isFinite(ends) && ends >= now;
}

/** The future subset, soonest first. The bundle is descending, so this
 *  is the copy every forward-looking surface reads: the hero CTA, the
 *  term line's "Next:", the feature card, "Coming up". */
export function futureEventsAscending(events: EventRow[], now = Date.now()): EventRow[] {
  return events
    .filter((e) => isFutureEvent(e, now))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** The archive, newest first — the order the bundle already ships in,
 *  sorted anyway so a caller never has to know that. */
export function pastEventsDescending(events: EventRow[], now = Date.now()): EventRow[] {
  return events
    .filter((e) => !isFutureEvent(e, now))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** The next event, or null when the chapter has nothing scheduled. */
export function nextEvent(events: EventRow[], now = Date.now()): EventRow | null {
  return futureEventsAscending(events, now)[0] ?? null;
}

/** The most recent past event, or null. */
export function latestPastEvent(events: EventRow[], now = Date.now()): EventRow | null {
  return pastEventsDescending(events, now)[0] ?? null;
}

/** What a phase's format is called on screen. "milestone" is a
 *  checkpoint with no attendance, which is why it is not a place. */
export function phaseFormatLabel(format: EventPhase["format"]): string {
  return format === "in_person"
    ? "In person"
    : format === "virtual"
      ? "Virtual"
      : format === "hybrid"
        ? "Hybrid"
        : "Milestone";
}

/* ── Cards ────────────────────────────────────────────────────────── */

export function renderEventCard(
  e: EventRow,
  byId: Map<string, EventRow>,
): string {
  const listed = e.publish_status === "listed";
  const tz = e.timezone;
  const s = zoneParts(e.date, tz);
  const eParts = e.end_date ? zoneParts(e.end_date, tz) : null;
  const isMultiDay =
    eParts !== null &&
    (eParts.year !== s.year ||
      eParts.month !== s.month ||
      eParts.day !== s.day);

  const month = s.monthShort.toUpperCase();
  const day = s.day;
  const startTime = e.timezone ? `${s.time} ${s.tzAbbr}` : s.time;
  const endTime = eParts
    ? e.timezone
      ? `${eParts.time} ${eParts.tzAbbr}`
      : eParts.time
    : null;
  const endLabel = eParts
    ? `${eParts.month === s.month ? "" : eParts.monthShort + " "}${eParts.day}`.trim()
    : null;

  // Date chip on the left — adds a "→ N" range stripe for multi-day.
  const dateChip = `
    <div class="event-card__date${isMultiDay ? " event-card__date--range" : ""}" aria-label="${month} ${day}${endLabel ? ` to ${endLabel}` : ""}">
      <div class="event-card__date-month">${month}</div>
      <div class="event-card__date-day">${day}</div>
      ${
        isMultiDay && endLabel
          ? `<div class="event-card__date-range">→ ${escapeHtml(endLabel)}</div>`
          : ""
      }
    </div>
  `;

  // Description renders through the richer paragraphs+bullets
  // markdown pass so what the dashboard preview shows matches what
  // visitors see (the create form's toolbar inserts `- ` lists and
  // blank-line paragraph splits).
  const desc = !listed && e.description
    ? `<div class="event-card__desc">${renderRichMarkdown(e.description)}</div>`
    : "";

  // Format → which pills render. in_person + (default) → just map.
  // virtual → just join. hybrid → both stacked.
  const fmt = e.format ?? "in_person";
  const showLocation =
    !(e.phases?.length) &&
    (fmt === "in_person" || fmt === "hybrid") &&
    e.location &&
    e.location.trim().length > 0;
  const showVirtual =
    !listed &&
    !(e.phases?.length) &&
    (fmt === "virtual" || fmt === "hybrid") &&
    e.virtual_url &&
    e.virtual_url.trim().length > 0;

  const formatChip =
    fmt === "virtual" || fmt === "hybrid"
      ? `<span class="event-card__format-chip event-card__format-chip--${fmt}">${
          fmt === "virtual" ? "Virtual" : "Hybrid"
        }</span>`
      : "";

  // Learning Tree association — links to the Learn PAGE (hash-router key
  // "learn", not the section's DOM id) so a visitor can jump from a
  // workshop event to the material it teaches.
  const treeChip = !listed && e.learning_tree_node_title
    ? `<a class="event-card__format-chip event-card__format-chip--tree" href="#learn">🌳 ${escapeHtml(e.learning_tree_node_title)}</a>`
    : "";

  const locationPill = showLocation
    ? `<a class="event-card__pill event-card__pill--map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location ?? "")}" target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>${escapeHtml(e.location ?? "")}</span>
      </a>`
    : "";

  // virtual_url is free text: a real join URL renders as a "Join
  // virtually" link; anything else ("See in Teams (private)") renders as
  // a plain pill showing the note itself. safeHttpUrl also keeps
  // javascript:-style values out of the href.
  const virtualHref = showVirtual ? safeHttpUrl(e.virtual_url ?? "") : null;
  const virtualIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>`;
  const virtualPill = showVirtual
    ? virtualHref
      ? `<a class="event-card__pill event-card__pill--virtual" href="${escapeAttr(virtualHref)}" target="_blank" rel="noopener noreferrer">
        ${virtualIcon}
        <span>Join virtually</span>
      </a>`
      : `<span class="event-card__pill event-card__pill--virtual">
        ${virtualIcon}
        <span>${escapeHtml(e.virtual_url ?? "")}</span>
      </span>`
    : "";

  // Co-host attribution: when this hub is surfacing another chapter's
  // event, credit the host so visitors know who organized it.
  const cohostBadge =
    e.my_role === "co_host" && e.host_chapter
      ? `<div class="event-card__cohost">Hosted by <strong>${escapeHtml(e.host_chapter.name)}</strong></div>`
      : "";

  // Parent badge: "Part of <Umbrella>" — only if the parent is in
  // the same bundle (same window). Otherwise quietly omit.
  const parent = e.parent_event_id ? byId.get(e.parent_event_id) : null;
  const parentBadge = parent
    ? `<div class="event-card__parent">Part of <strong>${escapeHtml(parent.title)}</strong></div>`
    : "";

  // Cover image up top when set. 16:9 aspect ratio matches the
  // dashboard preview and most marketing photos.
  const cover = e.image_url
    ? `<div class="event-card__cover"><img src="${escapeAttr(e.image_url)}" alt="" loading="lazy" onload="fitCover(this)" /></div>`
    : "";

  // Meta line: time + points (or "no points" when QR was off, which
  // we infer client-side from points_attend === 0; the bundle never
  // surfaces QR-disabled events with points anyway).
  const timeLabel =
    isMultiDay && endTime ? `${startTime} → ${endTime}` : startTime;
  const meta = listed ? timeLabel : `${timeLabel} · ${e.points_attend} ${e.points_attend === 1 ? "pt" : "pts"}`;

  // Phase timeline — when the event has phases (kickoff → midpoint →
  // finals → due-date), render them as a numbered checkpoint list
  // under the description. Each row carries its own format chip and
  // a short relative date so members can see the whole arc at once.
  // Sorted by the bundle endpoint (ordering, then date_start), so we
  // just render in order.
  const phases = (e.phases ?? []).slice();
  const phaseTimeline = phases.length
    ? `<div class="event-card__phases" aria-label="Event phases">
        <div class="event-card__phases-heading">${phases.length}-${listed ? "phase event" : "part project"}</div>
        <ol class="event-card__phase-list">
          ${phases.map((p, i) => renderPhaseRow(p, i + 1, e.timezone, listed)).join("")}
        </ol>
      </div>`
    : "";

  return `
    <article class="event-card${cover ? " event-card--with-cover" : ""}" role="listitem">
      ${cover}
      <div class="event-card__inner">
        ${dateChip}
        <div class="event-card__body">
          <div class="event-card__type-row">
            <span class="event-card__type">${escapeHtml(e.type ?? "event")}</span>
            ${formatChip}
            ${treeChip}
            ${listed ? '<span class="event-card__announcement">Details coming soon</span>' : ""}
          </div>
          ${parentBadge}
          <h3 class="event-card__title"><a href="${escapeAttr(eventPageHref(e.id, window.location.pathname))}">${escapeHtml(e.title)}</a></h3>
          ${cohostBadge}
          ${desc}
          ${phaseTimeline}
          ${locationPill || virtualPill ? `<div class="event-card__pills">${locationPill}${virtualPill}</div>` : ""}
          <div class="event-card__meta">${meta}</div>
          <a class="event-card__details" href="${escapeAttr(eventPageHref(e.id, window.location.pathname))}">${listed ? "View schedule" : "View event"} <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </article>
  `;
}

/** Render a single phase row inside the event-card phase timeline.
 *  Format milestone → no chip, just the "Milestone" pill (no
 *  check-in expected). in_person / virtual / hybrid → coloured chip
 *  + location or "Virtual" hint, matching how the parent event card
 *  surfaces format. Points are only shown when has_check_in (otherwise
 *  the row is a checkpoint without attendance). */
export function renderPhaseRow(
  p: EventPhase,
  num: number,
  tz: string | null,
  listed = false,
): string {
  const s = zoneParts(p.date_start, tz);
  const eParts = p.date_end ? zoneParts(p.date_end, tz) : null;
  const startStr = `${s.monthShort} ${s.day}`;
  const startTime = tz ? `${s.time} ${s.tzAbbr}` : s.time;
  const sameDayEnd =
    eParts !== null &&
    eParts.year === s.year &&
    eParts.month === s.month &&
    eParts.day === s.day;
  const endStr = eParts
    ? sameDayEnd
      ? tz
        ? `${eParts.time} ${eParts.tzAbbr}`
        : eParts.time
      : `${eParts.monthShort} ${eParts.day}`
    : null;
  const whenLabel = endStr
    ? sameDayEnd
      ? `${startStr} · ${startTime} → ${endStr}`
      : `${startStr} → ${endStr}`
    : `${startStr} · ${startTime}`;

  const formatLabel = phaseFormatLabel(p.format);
  const formatChip = `<span class="event-card__phase-chip event-card__phase-chip--${escapeAttr(p.format)}">${formatLabel}</span>`;

  const locText =
    (p.format === "in_person" || p.format === "hybrid") &&
    p.location &&
    p.location.trim().length > 0
      ? `<span class="event-card__phase-loc">${escapeHtml(p.location)}</span>`
      : "";

  const pointsText =
    !listed && p.has_check_in && p.points_attend > 0
      ? `<span class="event-card__phase-points">+${p.points_attend} ${p.points_attend === 1 ? "pt" : "pts"}</span>`
      : "";

  const descBlock = !listed && p.description
    ? `<div class="event-card__phase-desc">${escapeHtml(p.description)}</div>`
    : "";

  return `
    <li class="event-card__phase-row event-card__phase-row--${escapeAttr(p.format)}">
      <div class="event-card__phase-num" aria-hidden="true">${num}</div>
      <div class="event-card__phase-body">
        <div class="event-card__phase-head">
          <span class="event-card__phase-name">${escapeHtml(p.name)}</span>
          ${formatChip}
          ${pointsText}
        </div>
        <div class="event-card__phase-when">${escapeHtml(whenLabel)}${locText ? " · " : ""}${locText}</div>
        ${descBlock}
      </div>
    </li>
  `;
}
