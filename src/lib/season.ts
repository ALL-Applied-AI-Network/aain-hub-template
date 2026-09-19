/* The term line — the one large-ish claim the landing page makes.
 *
 *     MSOE   Fall 2026 · 3 events this term · Next: Oct 8
 *     ROAR   Fall 2026 · 1 event this term
 *     NTUA   Fall 2026
 *     (June) Summer 2027 · Between terms · Next: Sep 2
 *
 * Every clause is the chapter's own data, and any clause that would
 * count zero is dropped rather than printed — which is what makes the
 * same line correct on a chapter with 59 events and on one with none.
 *
 * The bundle carries no term or season field and does not need one: the
 * only thing that cannot be derived is where a term starts, and that is
 * the single constant below. It is isolated on purpose. A chapter site
 * that hardcoded a per-chapter academic calendar would be asserting
 * NTUA's and URJC's term dates from Milwaukee, which is exactly the
 * failure this keeps to one line someone can find and change.
 *
 * Events are bucketed in their OWN timezone (zoneParts), so an 8pm
 * Chicago event on December 31st stays in the Fall term rather than
 * moving to Spring because UTC rolled over.
 */

import type { EventRow } from "./bundle";
import { monthDay, plural, zoneParts } from "./format";

/** The one constant. Months are 1-based; each entry is the first month
 *  of that season. Summer is not a teaching term, which is what
 *  `between` means downstream. */
const SEASONS = [
  { name: "Spring", from: 1, to: 5, between: false },
  { name: "Summer", from: 6, to: 7, between: true },
  { name: "Fall", from: 8, to: 12, between: false },
] as const;

export interface Term {
  /** "Fall 2026" — what the line leads with. */
  label: string;
  season: string;
  year: number;
  /** True in Summer: the chapter is not in session, so "{n} events this
   *  term" is replaced by "Between terms". */
  between: boolean;
  /** Inclusive month bounds, 1-based, within `year`. */
  fromMonth: number;
  toMonth: number;
}

/** Which term today falls in. */
export function currentTerm(now: Date = new Date()): Term {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const season = SEASONS.find((s) => month >= s.from && month <= s.to) ?? SEASONS[2];
  return {
    label: `${season.name} ${year}`,
    season: season.name,
    year,
    between: season.between,
    fromMonth: season.from,
    toMonth: season.to,
  };
}

/** Is this event inside the term, by its own wall clock? */
function inTerm(e: EventRow, term: Term): boolean {
  const p = zoneParts(e.date, e.timezone);
  return p.year === term.year && p.month >= term.fromMonth && p.month <= term.toMonth;
}

export function eventsInTerm(events: EventRow[], term: Term): number {
  return events.filter((e) => inTerm(e, term)).length;
}

/**
 * The clauses of the term line, in order, already free of anything that
 * would print a zero. The caller joins them with a separator so the
 * separator is a rendering decision rather than a string in the data.
 *
 * `next` is the chapter's next event, or null — resolved by the caller
 * from the ascending future copy rather than re-derived here, so the
 * hero CTA and this line can never disagree about which event is next.
 */
export function termLineParts(
  events: EventRow[],
  next: EventRow | null,
  now: Date = new Date(),
): string[] {
  const term = currentTerm(now);
  const parts: string[] = [term.label];

  if (term.between) {
    parts.push("Between terms");
  } else {
    const n = eventsInTerm(events, term);
    // Law 1: an integer of 0 does not reach the page. A chapter that has
    // not run anything this term says its season and stops.
    if (n >= 1) parts.push(`${plural(n, "event")} this term`);
  }

  if (next) parts.push(`Next: ${monthDay(next.date, next.timezone)}`);
  return parts;
}
