declare const __HUB_CONFIG__: {
  hub_name: string;
  hub_acronym: string;
  content_url: string;
};

import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';

const config = __HUB_CONFIG__;

// ── Directive preprocessing ──────────────────────────────────────────────────

const CALLOUT_ICONS: Record<string, string> = {
  tip: '\u{1F4A1}', info: '\u2139\uFE0F', warning: '\u26A0\uFE0F', danger: '\u{1F6A8}',
};
const CALLOUT_TITLES: Record<string, string> = {
  tip: 'Tip', info: 'Info', warning: 'Warning', danger: 'Danger',
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function preprocessDirectives(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // :::callout[type]
    const calloutMatch = line.match(/^:::callout\[(\w+)\]\s*$/);
    if (calloutMatch) {
      const type = calloutMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      output.push(
        `<div class="callout callout--${type}">`,
        `<div class="callout__icon">${CALLOUT_ICONS[type] || ''}</div>`,
        `<div class="callout__content">`,
        `<div class="callout__title">${CALLOUT_TITLES[type] || type}</div>`,
        `<div class="callout__body">`, '', ...body, '', `</div></div></div>`, ''
      );
      continue;
    }

    // :::definition[term]
    const defMatch = line.match(/^:::definition\[(.+?)\]\s*$/);
    if (defMatch) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      output.push(
        `<div class="definition"><div class="definition__term">${defMatch[1]}</div>`,
        `<div class="definition__body">`, '', ...body, '', `</div></div>`, ''
      );
      continue;
    }

    // :::details[title]
    const detailsMatch = line.match(/^:::details\[(.+?)\]\s*$/);
    if (detailsMatch) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      output.push(
        `<details class="collapsible"><summary class="collapsible__trigger">${detailsMatch[1]}</summary>`,
        `<div class="collapsible__content">`, '', ...body, '', `</div></details>`, ''
      );
      continue;
    }

    // :::build-challenge
    if (line.match(/^:::build-challenge\s*$/)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      output.push(
        `<div class="build-challenge">`,
        `<div class="build-challenge__header"><span class="build-challenge__icon">\u{1F528}</span>`,
        `<span class="build-challenge__title">Build Challenge</span></div>`,
        `<div class="build-challenge__content">`, '', ...body, '', `</div></div>`, ''
      );
      continue;
    }

    // :::tabs
    if (line.match(/^:::tabs\s*$/)) {
      const tabs: { label: string; body: string[] }[] = [];
      i++;
      let cur: { label: string; body: string[] } | null = null;
      while (i < lines.length && lines[i].trim() !== ':::') {
        const hdr = lines[i].match(/^##tab\s+(.+)$/);
        if (hdr) { if (cur) tabs.push(cur); cur = { label: hdr[1], body: [] }; }
        else if (cur) cur.body.push(lines[i]);
        i++;
      }
      if (cur) tabs.push(cur);
      i++;
      if (tabs.length) {
        const btns = tabs.map((t, idx) =>
          `<button class="tabs__tab${idx === 0 ? ' tabs__tab--active' : ''}" data-tab="${idx}">${t.label}</button>`
        ).join('');
        const panels = tabs.map((t, idx) =>
          `<div class="tabs__panel${idx === 0 ? ' tabs__panel--active' : ''}" data-panel="${idx}">\n\n${t.body.join('\n')}\n\n</div>`
        ).join('\n');
        output.push(`<div class="tabs" data-tabs><div class="tabs__nav">${btns}</div>`, panels, `</div>`, '');
      }
      continue;
    }

    // :::diagram
    if (line.match(/^:::diagram\s*$/)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      const mermaidContent = body.join('\n').replace(/^```mermaid\s*\n?/, '').replace(/\n?```\s*$/, '');
      output.push(`<div class="diagram"><div class="mermaid">${escapeHtml(mermaidContent)}</div></div>`, '');
      continue;
    }

    output.push(line);
    i++;
  }

  return output.join('\n');
}

// ── Rendering ────────────────────────────────────────────────────────────────

async function renderMarkdown(md: string): Promise<string> {
  const processed = preprocessDirectives(md);

  const renderer = new Renderer();
  renderer.code = function (codeOrToken: string | { text?: string; lang?: string }, langArg?: string) {
    let text: string, lang: string;
    if (typeof codeOrToken === 'string') { text = codeOrToken; lang = langArg || ''; }
    else { text = codeOrToken?.text || ''; lang = codeOrToken?.lang || ''; }

    let language = lang, title = '';
    const titleMatch = language.match(/^(\S+)\s+title="([^"]+)"/);
    if (titleMatch) { language = titleMatch[1]; title = titleMatch[2]; }

    const escaped = escapeHtml(text);
    const langAttr = language ? ` class="language-${language}"` : '';
    const titleAttr = title ? ` data-title="${escapeHtml(title)}"` : '';
    return `<pre${titleAttr}><code${langAttr}>${escaped}</code></pre>`;
  };

  marked.setOptions({ gfm: true, breaks: false });
  marked.use({ renderer });

  const rawHtml = await marked.parse(processed);

  return DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['details', 'summary', 'button'],
    ADD_ATTR: ['class', 'data-tab', 'data-tabs', 'data-panel', 'data-title', 'id', 'open', 'style'],
  });
}

function initTabs(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-tabs]').forEach(tabsEl => {
    const btns = tabsEl.querySelectorAll<HTMLElement>('.tabs__tab');
    const panels = tabsEl.querySelectorAll<HTMLElement>('.tabs__panel');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-tab');
        if (idx === null) return;
        btns.forEach(b => b.classList.remove('tabs__tab--active'));
        panels.forEach(p => p.classList.remove('tabs__panel--active'));
        btn.classList.add('tabs__tab--active');
        tabsEl.querySelector<HTMLElement>(`[data-panel="${idx}"]`)?.classList.add('tabs__panel--active');
      });
    });
  });
}

// ── Page init ────────────────────────────────────────────────────────────────

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function init() {
  // Apply config to nav
  setText('nav-acronym', config.hub_acronym);
  setText('nav-hub-name', config.hub_name);
  document.documentElement.style.setProperty('--color-primary', (config as any).theme?.primary_color || '#6366f1');
  document.documentElement.style.setProperty('--color-accent', (config as any).theme?.accent_color || '#06b6d4');

  const params = new URLSearchParams(window.location.search);
  const remotePath = params.get('path');
  const localPath = params.get('local');

  const container = document.getElementById('article-content');
  if (!container || (!remotePath && !localPath)) {
    if (container) container.innerHTML = '<p class="muted">No content path specified.</p>';
    return;
  }

  const isLocal = !!localPath;
  const path = (localPath || remotePath)!;

  // Set breadcrumb
  const parts = path.split('/');
  const sectionName = parts[0] || 'Content';
  const fileName = parts[parts.length - 1]?.replace('.md', '').replace(/^\d+-/, '').replace(/-/g, ' ') || '';
  const breadcrumbPrefix = isLocal ? 'Chapter' : sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
  setText('breadcrumb-section', `${breadcrumbPrefix} / ${fileName}`);

  // Local content is served from the hub's own build output; remote from content_url
  const url = isLocal ? `./${path}` : `${config.content_url}/${path}`;
  const basePath = path.substring(0, path.lastIndexOf('/') + 1);

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${resp.status}`);
    const md = await resp.text();

    // Rewrite relative image paths — local images stay relative, remote get absolute URLs
    const rewrittenMd = isLocal
      ? md  // Local content: images are relative to the hub site, no rewriting needed
      : md.replace(
          /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g,
          (_, alt, src) => `![${alt}](${config.content_url}/${basePath}${src})`
        );

    const html = await renderMarkdown(rewrittenMd);
    container.innerHTML = html;

    // Extract title from first h1
    const h1 = container.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} — ${config.hub_name}`;
    }

    // Init interactive elements
    initTabs(container);

    // Rewrite internal .md links to stay on this site
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.endsWith('.md') && !href.startsWith('http')) {
        if (isLocal) {
          // Local links resolve relative to the local/ folder
          a.href = `./article.html?local=${basePath}${href}`;
        } else {
          const resolvedPath = new URL(href, `${config.content_url}/${basePath}`).pathname.replace(/^\//, '');
          a.href = `./article.html?path=${resolvedPath}`;
        }
      }
    });

  } catch (e) {
    container.innerHTML = `<div class="callout callout--danger"><div class="callout__content"><div class="callout__title">Could not load content</div><div class="callout__body"><p>Unable to fetch this article. Please check your internet connection and try again.</p><p><a href="/">Back to home</a></p></div></div></div>`;
  }
}

init();
