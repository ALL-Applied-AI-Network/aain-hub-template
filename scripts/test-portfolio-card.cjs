// The member card's rules (src/portfolio-card.ts), run against the module
// that ships: node scripts/test-portfolio-card.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");

function load(relative) {
  const filename = path.resolve(ROOT, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, URL,
    require: (specifier) => load(path.relative(ROOT, path.resolve(path.dirname(filename), `${specifier}.ts`))),
  };
  vm.runInNewContext(output, context, { filename });
  return context.exports;
}

const { cardFromJson, renderCard, initialsOf, placeMetal, termOf, SHOWN } = load("src/portfolio-card.ts");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/portfolio", `${name}.json`), "utf8"));
const img = (raw) => {
  const v = (raw ?? "").trim();
  return /^https:\/\//.test(v) || /^\/fixtures\/portfolio\/img\/[\w.-]+$/.test(v) ? v : null;
};
const all = { projects: true, badges: true, events: true };
const card = (b, sections = all) => cardFromJson(b, { host: b.slug ? `${b.slug}.all-ai-network.org` : null, img, sections });
const html = (m) => renderCard(m, (src, cls) => `<img class="${cls}" src="${src}">`);
// The module runs in its own realm, so compare plain copies.
const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
const keys = (m) => m.shelves.map((s) => s.key).join(",");
const lines = (m, key) => m.shelves.find((s) => s.key === key).lines.map((l) => `${l.n} ${l.label}`).join(" / ");
// A number printed as a word count: "0 events", "0 badges"…
const ZERO = />0<\/b>|\b0 (events?|points?|badges?|friends? brought)\b|All 0\b/;

// New: the name and when they joined, nothing else.
{
  const m = card(fixture("card-new"));
  assert.equal(keys(m), "");
  assert.equal(m.since, "Joined Nov 2026");
  assert.equal(m.edge, null);
  assert.equal(m.initials, "RC");
  const out = html(m);
  assert.doesNotMatch(out, /mc-shelves/);
  assert.match(out, /class="mc mc--none"/);
}

// One check-in: one shelf, its two lines, no "All".
{
  const m = card(fixture("card-one-checkin"));
  assert.equal(keys(m), "checkins");
  assert.equal(lines(m, "checkins"), "1 event / 10 points");
  assert.equal(m.shelves[0].all, null);
  assert.equal(m.since, "Since Nov 2026");
  assert.equal(m.checkins[0].day, "12");
  assert.equal(m.checkins[0].month, "Nov");
}

// Typical: Earned then Checked in, "All 4" to the events.
{
  const m = card(fixture("card-typical"));
  assert.equal(keys(m), "earned,checkins");
  assert.equal(lines(m, "earned"), "1 badge");
  same(m.shelves[1].all, { n: 4, href: "#pp-events", land: "events" });
  assert.equal(m.checkins.length, SHOWN.checkins);
}

// Rich: two chapters primary first, the folded repo once, newest badges,
// friends brought, the fixed shelf order.
{
  const m = card(fixture("card-rich"));
  assert.equal(keys(m), "built,earned,checkins");
  same(m.chapters.map((c) => c.acronym), ["EAC", "LRA"]);
  assert.equal(m.edge, "#8f4fe8");
  same(m.built.map((b) => b.name), ["Linewatch", "tiny-rag", "edge-yolo-bench"]);
  assert.equal(m.shelves[0].all.n, 4);
  assert.equal(m.built[0].language, "Python");
  assert.equal(m.built[0].stars, 12);
  same(m.badges.map((b) => b.name), ["Brought a Friend", "Lab Team", "Shipped", "Lab Finalist"]);
  assert.equal(lines(m, "earned"), "14 badges");
  assert.equal(lines(m, "checkins"), "8 events / 115 points / 2 friends brought");
  // A check-in at another chapter wears that chapter's colour.
  assert.equal(m.checkins[2].hostColor, "#1f9d73");
  assert.doesNotMatch(html(m), ZERO);
  // The words a visitor reads: never a rank, a "#12" or "Verified".
  const words = html(m).replace(/<[^>]*>/g, " ").replace(/&#?\w+;/g, " ");
  assert.doesNotMatch(words, /\bverified\b|\brank(ed)?\b|#\d/i);
  // No address without a host; the fourth project waits behind "All 4".
  const bare = cardFromJson(fixture("card-rich"), { host: null, img, sections: all });
  assert.equal(bare.address, null);
  assert.doesNotMatch(html(bare), /mc-url/);
  assert.equal(bare.built.length, 3);
}

// Competitions: the placement only when the JSON carries it, and first.
{
  const m = card(fixture("card-rich-competitions"));
  assert.equal(m.built[0].kind, "placement");
  assert.equal(m.built[0].metal, "silver");
  assert.equal(m.built[0].team, "Team Line Sight");
  assert.equal(m.built[0].meta, "Example AI Club · Fall 2026");
  assert.equal(m.shelves[0].all.n, 5);
  assert.equal(card(fixture("card-rich")).built.some((b) => b.kind === "placement"), false);
  assert.equal(placeMetal("Winner"), "gold");
  assert.equal(placeMetal("2nd runner-up"), "bronze");
  assert.equal(placeMetal("Honorable mention"), "steel");
  assert.equal(termOf("2026-03-01"), "Spring 2026");
  assert.equal(termOf("2026-07-01"), "Summer 2026");
}

// Older JSON: `chapter` stands in for `chapters`, "and 1 more", no
// brought line, a check-in elsewhere gets a neutral leaf, and the
// résumé tagline stands in for a missing headline.
{
  const m = card(fixture("card-older"));
  same(m.chapters.map((c) => c.name), ["Lakeside Robotics & AI"]);
  assert.equal(m.moreChapters, 1);
  assert.equal(lines(m, "checkins"), "3 events / 30 points");
  assert.equal(m.checkins[2].hostColor, null);
  assert.equal(m.headline, "Robotics, mostly on small hardware.");
  assert.match(html(m), /and 1 more chapter</);
  assert.equal(m.built[0].href, "#pp-projects");
}

// Missing pictures: every picture is still asked for (and falls back in
// the page); a chapter with no colour gets the default edge and neutral
// date leaves.
{
  const m = card(fixture("card-missing-images"));
  assert.ok(m.imageUrl && m.checkins[0].imageUrl && m.built[0].imageUrl);
  assert.ok("image" in m.badges[0].art);
  assert.equal(m.edge, "#4f8fea");
  assert.equal(m.checkins[0].hostColor, null);
  const out = html(m);
  assert.match(out, /mc-portrait__i">SF</);
  assert.match(out, /mc-ev__leaf is-plain"><b>4<\/b><span>Nov</);
}

// Carried points with no check-in and no badge: Earned says so.
{
  const m = card(fixture("card-carried"));
  assert.equal(keys(m), "earned");
  assert.equal(lines(m, "earned"), "25 points");
  assert.equal(m.carried, 25);
}

// Zero is never printed, whatever the totals say.
{
  const b = { ...fixture("card-one-checkin"), record: { entries: [], totals: { points: 0, events: 0, badges: 0, brought: 0 } } };
  const m = card(b);
  assert.equal(keys(m), "");
  assert.doesNotMatch(html(m), ZERO);
}

// One chip per event: a multi-phase event's rows fold into one.
{
  const b = fixture("card-one-checkin");
  const e = b.record.entries[0];
  b.record.entries = [e, { ...e, id: "x2", phase: "Finals" }];
  const m = card(b);
  assert.equal(m.checkins.length, 1);
  assert.equal(lines(m, "checkins"), "1 event / 10 points");
}

// "All N" never points at a section the page does not have.
{
  const m = card(fixture("card-rich"), { projects: false, badges: false, events: false });
  assert.ok(m.shelves.every((s) => s.all === null));
}

// Everything the JSON sends is text: no markup gets through.
{
  const b = { ...fixture("card-typical"), name: '<img src=x onerror="alert(1)">', headline: "a & <b>b</b>" };
  b.badges = [{ ...b.badges[0], name: "<script>x</script>", icon: "javascript:alert(1)" }];
  const out = html(card(b));
  assert.doesNotMatch(out, /<img src=x|<script>|<b>b<\/b>|javascript:/);
  assert.equal(initialsOf("Prince"), "PR");
  assert.equal(initialsOf("  "), "?");
}

console.log("PASS: member card shelves, zero rule, older JSON, competitions gate, repo fold, picture fallbacks, escaping");
