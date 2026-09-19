const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, additions = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, URL, URLSearchParams, Response, Request, AbortSignal,
    require: (specifier) => load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), `${specifier}.ts`))),
    ...additions,
  };
  vm.runInNewContext(output, context, { filename });
  return context.exports;
}

// Run the actual card renderer without booting the full website.
//
// renderEventCard, renderPhaseRow, zoneParts, renderRichMarkdown and
// safeHttpUrl used to be function declarations inside src/main.ts, and
// this lifted them out of it by name. They now live in src/lib/*, which
// is better for the site and better here: load() follows the real
// import graph, so this exercises the module that ships rather than a
// re-transpiled subset of it that could drift from the original.
//
// `window` is the only global the module reaches for (the card links to
// ?event= on the current path); load() passes additions to the module
// it is asked for, and every recursive require resolves from disk.
function loadEventRenderer() {
  return load("src/lib/events.ts", {
    window: { location: { pathname: "/club/" } },
  }).renderEventCard;
}

async function main() {
  const eventId = "69a49634-e7cb-4d18-9599-c1d8c4c6d16d";
  const otherEventId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const helpers = load("src/event-page.ts");
  assert.equal(helpers.eventPageHref(eventId, "/club/"), `/club/?event=${eventId}`);
  assert.equal(helpers.eventFromSearch(`?event=${eventId.toUpperCase()}`), eventId);
  for (const invalid of ["", "?event=../admin", "?event=javascript:alert(1)", "?event=%22%3E"]) {
    assert.equal(helpers.eventFromSearch(invalid), null);
  }
  assert.equal(helpers.flyerUrl(eventId, "chapter-name"), `https://dashboard.all-ai-network.org/embed/event/${eventId}?chapter=chapter-name`);
  assert.equal(helpers.flyerUrl(eventId, "chapter-name", false), `https://dashboard.all-ai-network.org/e/${eventId}?chapter=chapter-name`);

  const frameWindow = {};
  const valid = {
    origin: "https://dashboard.all-ai-network.org", source: frameWindow,
    data: { type: "all-event-flyer:resize", eventId, height: 1920.2 },
  };
  assert.equal(helpers.trustedFlyerHeight(valid, frameWindow, eventId), 1921);
  assert.equal(helpers.trustedFlyerHeight({ ...valid, data: { ...valid.data, height: 10 } }, frameWindow, eventId), 320);
  for (const invalid of [
    { ...valid, origin: "https://untrusted.example" },
    { ...valid, source: {} },
    { ...valid, data: null },
    { ...valid, data: { ...valid.data, eventId: otherEventId } },
    { ...valid, data: { ...valid.data, type: "unrelated" } },
    ...[-1, 0, Infinity, NaN, 100001, "1200"].map((height) => ({ ...valid, data: { ...valid.data, height } })),
  ]) assert.equal(helpers.trustedFlyerHeight(invalid, frameWindow, eventId), null);
  assert.equal(helpers.trustedFlyerHeight(valid, null, eventId), null);

  const navigate = { ...valid, data: { type: "all-event-flyer:navigate", eventId, top: 1208.4 } };
  assert.equal(helpers.trustedFlyerTop(navigate, frameWindow, eventId), 1209);
  assert.equal(helpers.trustedFlyerTop({ ...navigate, data: { ...navigate.data, top: 0 } }, frameWindow, eventId), 0);
  for (const invalid of [
    { ...navigate, origin: "https://untrusted.example" },
    { ...navigate, source: {} },
    { ...navigate, data: null },
    { ...navigate, data: { ...navigate.data, eventId: otherEventId } },
    valid,
    ...[-1, Infinity, NaN, 100001, "1200"].map((top) => ({ ...navigate, data: { ...navigate.data, top } })),
  ]) assert.equal(helpers.trustedFlyerTop(invalid, frameWindow, eventId), null);
  assert.equal(helpers.trustedFlyerTop(navigate, null, eventId), null);

  const renderCard = loadEventRenderer();
  const event = {
    id: eventId, title: "Innovation Lab", publish_status: "listed", type: "Innovation Lab",
    date: "2026-10-08T23:30:00Z", end_date: null, timezone: "America/Chicago", format: "hybrid",
    description: "UNRELEASED_DESCRIPTION", virtual_url: "https://example.org/UNRELEASED_MEETING",
    learning_tree_node_title: "UNRELEASED_LEARNING", points_attend: 987,
    location: "Engineering Hall", image_url: "https://example.org/announcement.png",
    phases: [{ id: "phase-1", name: "Kickoff", date_start: "2026-10-08T23:30:00Z", date_end: null,
      format: "in_person", location: "Room 101", description: "UNRELEASED_PHASE", has_check_in: true, points_attend: 678 }],
  };
  const listedCard = renderCard(event, new Map());
  assert.match(listedCard, /Details coming soon/);
  assert.match(listedCard, /View schedule/);
  assert.match(listedCard, /Innovation Lab/);
  assert.match(listedCard, /Kickoff/);
  assert.match(listedCard, /Room 101/);
  assert.match(listedCard, /announcement\.png/);
  assert.doesNotMatch(listedCard, /UNRELEASED_|987|678|Join virtually/);
  const listedSingle = renderCard({ ...event, phases: [] }, new Map());
  assert.match(listedSingle, /Engineering Hall/);
  assert.doesNotMatch(listedSingle, /UNRELEASED_|Join virtually/);
  const publishedCard = renderCard({ ...event, publish_status: "published" }, new Map());
  assert.match(publishedCard, /UNRELEASED_DESCRIPTION/);
  assert.match(publishedCard, /UNRELEASED_PHASE/);
  assert.match(publishedCard, /UNRELEASED_LEARNING/);
  assert.match(publishedCard, /987 pts/);
  assert.match(publishedCard, /678 pts/);
  assert.match(publishedCard, /View event/);
  assert.doesNotMatch(publishedCard, /Details coming soon/);
  assert.match(renderCard({ ...event, publish_status: undefined }, new Map()), /UNRELEASED_DESCRIPTION/);

  let publishStatus = "published";
  const metadata = load("middleware.ts", {
    fetch: async (url) => {
      if (String(url).includes("/api/public/chapter/")) return Response.json({
        chapter: { slug: "test-club", name: "Test Club" },
        config: { hub_name: "Test Club" },
        events: [{ id: eventId, publish_status: publishStatus, title: 'Innovation & <Lab>', description: 'Bring your "$&" project.', image_url: "https://example.org/cover.png" }],
      });
      if (String(url).includes("/api/public/member/")) return new Response(null, { status: 404 });
      return new Response('<!doctype html><head><title>Chapter Hub</title><meta name="description" content="old"></head><body>Site</body>');
    },
  });
  const result = await metadata.default(new Request(`https://test-club.all-ai-network.org/?event=${eventId}`));
  const html = await result.text();
  assert.match(html, /Innovation &amp; &lt;Lab&gt; — Test Club/);
  assert.match(html, /\?event=69a49634-e7cb-4d18-9599-c1d8c4c6d16d/);
  assert.match(html, /https:\/\/example.org\/cover.png/);
  assert.equal((html.match(/<\/head>/g) || []).length, 1);
  assert.equal(result.headers.get("cache-control"), "no-store");
  publishStatus = "listed";
  const listedMetadata = await metadata.default(new Request(`https://test-club.all-ai-network.org/?event=${eventId}`));
  const listedHtml = await listedMetadata.text();
  assert.match(listedHtml, /Details coming soon/);
  assert.match(listedHtml, /Innovation &amp; &lt;Lab&gt;/);
  assert.match(listedHtml, /https:\/\/example.org\/cover.png/);
  assert.doesNotMatch(listedHtml, /Bring your/);
  const unknown = await metadata.default(new Request(`https://test-club.all-ai-network.org/?event=${otherEventId}`));
  assert.match(await unknown.text(), /Event — Test Club/);
  const homepage = await metadata.default(new Request("https://test-club.all-ai-network.org/"));
  assert.match(await homepage.text(), /Test Club — ALL Applied AI Network/);
  console.log("PASS: event routes, iframe messaging, listed card/metadata redaction, published detail preservation and chapter-home metadata");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
