import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, 'hub.config.json'), 'utf-8'));

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

  // site_url and logo_url are stamped by the dashboard at deploy time on
  // newer deploys; older repos have neither, hence the slug fallback.
  const siteUrl =
    String(config.site_url || '').trim() ||
    (slug ? `https://${slug}.all-ai-network.org` : '');

  // Prefer the chapter's own logo (an absolute URL from the dashboard).
  // Never emit a relative og:image — crawlers won't resolve it, and a
  // broken image card is worse than none.
  const image = String(config.logo_url || '').trim();

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
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
    ]
      .filter(Boolean)
      .join('\n  ');

  return {
    name: 'inject-social-meta',
    transformIndexHtml(html: string, ctx: { filename?: string; path?: string }) {
      const where = ctx?.filename || ctx?.path || '';
      const isHome = !where.includes('article');
      return html
        // The template ships a hardcoded title and description; replace
        // rather than append so crawlers never see two of either.
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/\s*<meta\s+name="description"[^>]*>/gi, '')
        .replace('</head>', `  ${buildTags(isHome)}\n</head>`);
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
