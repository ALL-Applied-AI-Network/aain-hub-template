import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Which identity this build carries.
 *
 * A chapter's own build reads hub.config.json, stamped with their slug at
 * deploy time. The HOSTED deployment that serves *.all-ai-network.org sets
 * HUB_CONFIG=hub.config.hosted.json instead: one build serves every chapter,
 * so it must carry no chapter's identity and no sample content — see the
 * note at the top of that file.
 */
const configFile = process.env.HUB_CONFIG?.trim() || 'hub.config.json';
const configPath = resolve(__dirname, configFile);
if (!existsSync(configPath)) {
  throw new Error(`HUB_CONFIG points at ${configFile}, which does not exist.`);
}
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

/**
 * Social/SEO meta — baked at BUILD time, on purpose.
 *
 * The template is a static site whose content arrives from the dashboard
 * bundle at runtime, and main.ts sets document.title only AFTER that fetch
 * resolves. Unfurl bots (Discord, Slack, iMessage, LinkedIn, WhatsApp) and
 * search crawlers don't run that JS, so every shared link rendered as the
 * template's hardcoded "Hub — ALL Applied AI Network" with a generic
 * description and no image — i.e. the chapter was invisible at the exact
 * moment an officer pasted their site into a club Discord or an org-fair QR.
 *
 * hub.config.json is stamped with the chapter's real identity at deploy
 * time, so the correct values are already on disk when Vite builds. A baked
 * title that's right on the day it deployed beats a runtime title no
 * crawler will ever see.
 */
function injectSocialMeta() {
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const name = String(config.hub_name || '').trim() || 'Chapter Hub';
  const university = String(config.university || '').trim();
  const slug = String(config.hub_id || '').trim();

  const description =
    String(config.description || '').trim() ||
    (university
      ? `The applied AI club at ${university}. Events, projects and workshops — no experience required.`
      : 'A student-run applied AI community.');

  // Only a site_url the dashboard actually stamped. This deliberately does
  // NOT guess `https://{slug}.all-ai-network.org`: subdomain provisioning is
  // best-effort (skipped entirely without VERCEL_API_TOKEN, and its failures
  // are swallowed), so plenty of live sites are served from a github.io URL
  // instead. A canonical pointing at a host that doesn't resolve tells Google
  // to drop the URL that works, and og:url is the card's click target — that
  // is strictly worse than emitting neither. Nothing stamps site_url yet, so
  // today canonical/og:url are simply absent, which is neutral.
  const siteUrl = String(config.site_url || '').trim();

  // Prefer the chapter's own logo (an absolute URL from the dashboard).
  // Never emit a relative og:image — crawlers won't resolve it, and a
  // broken image card is worse than none.
  //
  /**
   * Unfurl bots won't render SVG. The dashboard's generated chapter logo is
   * an SVG, so a chapter that never uploaded a logo of its own unfurled as a
   * text-only card everywhere — Discord, Slack, iMessage, X, LinkedIn all
   * refuse it. The same endpoint has a PNG sibling that renders a proper
   * 1200x630 card, and it lives at the same origin, so the URL is the only
   * thing that has to change. An UPLOADED logo is already a raster file and
   * is left exactly as the chapter set it.
   */
  const rawImage = String(config.logo_url || '').trim();
  const image = rawImage.replace(
    '/api/public/chapter-logo/',
    () => '/api/public/chapter-card/',
  );
  const generatedCard = image !== rawImage;

  const title = `${name} — ALL Applied AI Network`;

  // article.html renders whichever article the ?path= query names, so at
  // build time we don't know its URL. Emitting the site root as canonical
  // there would tell crawlers every article IS the homepage — worse than
  // emitting nothing — so those two tags are homepage-only.
  const buildTags = (isHome: boolean) =>
    [
      `<meta name="description" content="${esc(description)}" />`,
      isHome && siteUrl ? `<link rel="canonical" href="${esc(siteUrl)}" />` : '',
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(name)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      isHome && siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}" />` : '',
      image ? `<meta property="og:image" content="${esc(image)}" />` : '',
      image ? `<meta property="og:image:alt" content="${esc(name + ' logo')}" />` : '',
      // The generated card is a real 1.91:1 image; an uploaded logo is
      // usually square and gets cropped by a large card.
      `<meta name="twitter:card" content="${!image ? 'summary' : generatedCard ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
    ]
      .filter(Boolean)
      .join('\n  ');

  return {
    name: 'inject-social-meta',
    transformIndexHtml(html: string, ctx: { filename?: string; path?: string }) {
      // Basename only: ctx.filename is an absolute path, so testing the
      // whole string would misread the homepage as an article whenever any
      // ancestor directory happens to contain "article".
      const where = (ctx?.filename || ctx?.path || '').split(/[\\/]/).pop() || '';
      const isHome = !where.startsWith('article');
      // Replacer FUNCTIONS, not strings: a string replacement expands $$,
      // $&, $` and $'. esc() rewrites & < > " into entities that all begin
      // with '&', so any '$' immediately before one of those characters
      // becomes the '$&' pattern and expands to the matched text — a real
      // chapter writing "grants for $<1k" shipped `</head>` inside its own
      // meta description, four </head> tags in the document, and a broken
      // unfurl card. A '$\'' would splice the whole document body into the
      // attribute. Functions make the replacement literal.
      return html
        // The template ships a hardcoded title and description; replace
        // rather than append so crawlers never see two of either.
        .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
        .replace(/\s*<meta\s+name="description"[^>]*>/gi, '')
        .replace('</head>', () => `  ${buildTags(isHome)}\n</head>`);
    },
  };
}

// Plugin to copy the local/ content folder into dist/ at build time
function copyLocalContent() {
  return {
    name: 'copy-local-content',
    closeBundle() {
      const localDir = resolve(__dirname, 'local');
      const outDir = resolve(__dirname, 'dist', 'local');
      if (existsSync(localDir)) {
        cpSync(localDir, outDir, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: './',
  define: {
    __HUB_CONFIG__: JSON.stringify(config),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        article: resolve(__dirname, 'article.html'),
      },
    },
  },
  plugins: [injectSocialMeta(), copyLocalContent()],
});
