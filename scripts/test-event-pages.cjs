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

  const metadata = load("middleware.ts", {
    fetch: async (url) => {
      if (String(url).includes("/api/public/chapter/")) return Response.json({
        chapter: { slug: "test-club", name: "Test Club" },
        config: { hub_name: "Test Club" },
        events: [{ id: eventId, title: 'Innovation & <Lab>', description: 'Bring your "$&" project.', image_url: "https://example.org/cover.png" }],
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
  const unknown = await metadata.default(new Request(`https://test-club.all-ai-network.org/?event=${otherEventId}`));
  assert.match(await unknown.text(), /Event — Test Club/);
  const homepage = await metadata.default(new Request("https://test-club.all-ai-network.org/"));
  assert.match(await homepage.text(), /Test Club — ALL Applied AI Network/);
  console.log("PASS: static event routes, iframe origin/source/event validation, resize bounds, event metadata and chapter-home preservation");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
