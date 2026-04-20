declare const __HUB_CONFIG__: HubConfig;

interface LocalContentEntry {
  title: string;
  description: string;
  path: string;
  type: 'local';
  section: 'learning' | 'workshops' | 'playbooks';
  thumbnail?: string;
}

interface ContentConfig {
  exclude_paths: string[];
  custom_order: string[];
  local_content: LocalContentEntry[];
}

interface HubConfig {
  hub_name: string;
  hub_acronym: string;
  hub_id: string;
  university: string;
  description: string;
  about: string;
  theme: {
    primary_color: string;
    accent_color: string;
  };
  links: Record<string, string>;
  officers: { name: string; role: string; image: string }[];
  events: { title: string; date: string; time: string; location: string; description: string }[];
  features: {
    learning_tree: boolean;
    playbooks: boolean;
    workshops: boolean;
  };
  content?: ContentConfig;
  content_url: string;
}

interface ManifestEntry {
  type: 'learning' | 'playbook' | 'workshop' | 'template';
  title: string;
  description: string;
  path: string;
  thumbnail?: string;
}

interface Manifest {
  content: ManifestEntry[];
}

interface TreeNode {
  id: string;
  title: string;
  description?: string;
  layer: number;
  difficulty: string;
  estimated_minutes: number;
  thumbnail?: string;
  content_path?: string;
}

interface TreeData {
  nodes: TreeNode[];
}

const config = __HUB_CONFIG__;

/**
 * Remote config fetched from the dashboard's public no-auth endpoint.
 * Lets the eboard edit theme colors, logo, and section visibility
 * from dashboard.all-ai-network.org/website → Customize without
 * touching this repo. Falls back to the bundled hub.config.json on
 * any failure — the site always renders.
 */
type RemoteConfig = {
  theme: { primary: string; accent: string };
  logo_url: string | null;
  sections: Record<string, boolean>;
  updated_at: string | null;
};

const DASHBOARD_ORIGIN = 'https://dashboard.all-ai-network.org';

async function loadRemoteConfig(): Promise<RemoteConfig | null> {
  const slug = config.hub_id?.trim().toLowerCase();
  if (!slug) return null;
  try {
    const res = await fetch(
      `${DASHBOARD_ORIGIN}/api/public/config/${encodeURIComponent(slug)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.config ?? null;
  } catch {
    // Dashboard unreachable, CORS oddity, etc. — we fall back to the
    // locally-bundled config rather than breaking the page.
    return null;
  }
}

/**
 * Apply remote section toggles before the render functions run. A
 * "false" toggle removes the section from the DOM entirely (not just
 * display:none — we drop the element so layouts that rely on stacked
 * sections don't end up with visual gaps), and hides its matching
 * nav link if one exists.
 */
function applyRemoteSections(sections: Record<string, boolean> | undefined) {
  if (!sections) return;
  const SECTION_MAP: Record<string, { sectionId?: string; navHref?: string }> = {
    hero: { sectionId: 'hero' },
    about: { sectionId: 'about', navHref: '#about' },
    events: { sectionId: 'events', navHref: '#events' },
    officers: { sectionId: 'officers-grid' }, // lives inside #about
    learning_tree: { sectionId: 'learning', navHref: '#learning' },
    workshops: { sectionId: 'workshops', navHref: '#workshops' },
    playbooks: { sectionId: 'playbooks', navHref: '#playbooks' },
    // leaderboard / badges / merch are forthcoming sections — the
    // toggles exist on the dashboard already; the hub-template doesn't
    // render them yet. Future renderers should respect these keys.
  };
  for (const [key, on] of Object.entries(sections)) {
    if (on) continue;
    const map = SECTION_MAP[key];
    if (!map) continue;
    if (map.sectionId) {
      const el = document.getElementById(map.sectionId);
      el?.remove();
    }
    if (map.navHref) {
      const link = document.querySelector(`.nav__link[href="${map.navHref}"]`);
      link?.remove();
    }
  }
}

function applyRemoteTheme(theme: { primary: string; accent: string }) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-accent', theme.accent);
  root.style.setProperty('--color-primary-rgb', hexToRgb(theme.primary));
}

function applyRemoteLogo(logoUrl: string | null) {
  const img = document.getElementById('nav-logo-img') as HTMLImageElement | null;
  const acronym = document.getElementById('nav-acronym');
  if (!img || !acronym) return;
  if (logoUrl) {
    img.src = logoUrl;
    img.hidden = false;
    img.setAttribute('aria-hidden', 'false');
    acronym.style.display = 'none';
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    acronym.style.display = '';
  }
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function applyConfig() {
  document.title = `${config.hub_name} — ALL Applied AI Network`;

  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', config.description);

  const root = document.documentElement;
  root.style.setProperty('--color-primary', config.theme.primary_color);
  root.style.setProperty('--color-accent', config.theme.accent_color);
  root.style.setProperty('--color-primary-rgb', hexToRgb(config.theme.primary_color));

  setText('nav-acronym', config.hub_acronym);
  setText('nav-hub-name', config.hub_name);
  setText('hero-title', config.hub_name);
  setText('hero-subtitle', config.description);
  setText('hero-university', config.university);

  const treeLink = document.getElementById('tree-link') as HTMLAnchorElement;
  if (treeLink) {
    treeLink.href = `${config.content_url}/tree.html`;
  }

  // Hide nav links for disabled features
  if (!config.features.learning_tree) hideNavLink('learning');
  if (!config.features.workshops) hideNavLink('workshops');

  renderAbout();
  renderOfficers();
  renderEvents();
  renderSocialLinks();
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function hideNavLink(sectionId: string) {
  const link = document.querySelector(`.nav__link[href="#${sectionId}"]`) as HTMLElement;
  if (link) link.style.display = 'none';
}

function renderAbout() {
  const container = document.getElementById('about-content');
  if (!container) return;

  if (config.about) {
    container.innerHTML = config.about
      .split('\n')
      .filter(p => p.trim())
      .map(p => `<p>${p}</p>`)
      .join('');
  } else {
    container.innerHTML = `
      <p>We're part of the <strong>ALL Applied AI Network</strong> — a nationwide network of university AI chapters focused on applied AI engineering.</p>
      <p>Our curriculum starts at absolute zero and builds a path to shipping real AI products. No prior experience required.</p>
    `;
  }
}

function renderOfficers() {
  const container = document.getElementById('officers-grid');
  if (!container || !config.officers?.length) return;

  container.innerHTML = `
    <h3 class="officers__title">Leadership</h3>
    <div class="officers__grid">
      ${config.officers.map(o => `
        <div class="officer">
          <div class="officer__avatar">${o.image ? `<img src="${o.image}" alt="${o.name}" />` : o.name.split(' ').map(n => n[0]).join('')}</div>
          <div class="officer__name">${o.name}</div>
          <div class="officer__role">${o.role}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderEvents() {
  const container = document.getElementById('events-grid');
  if (!container) return;

  if (!config.events?.length) {
    hideSection('events');
    const navLink = document.querySelector('.nav__link[href="#events"]') as HTMLElement;
    if (navLink) navLink.style.display = 'none';
    return;
  }

  container.innerHTML = config.events.map(event => `
    <div class="event-card">
      <div class="event-card__date">
        <div class="event-card__date-text">${event.date}</div>
        <div class="event-card__time">${event.time}</div>
      </div>
      <div class="event-card__body">
        <h3 class="event-card__title">${event.title}</h3>
        <p class="event-card__location">${event.location}</p>
        <p class="event-card__desc">${event.description}</p>
      </div>
    </div>
  `).join('');
}

function renderSocialLinks() {
  const container = document.getElementById('social-links');
  if (!container) return;

  const icons: Record<string, string> = {
    discord: 'Discord', github: 'GitHub', instagram: 'Instagram',
    linkedin: 'LinkedIn', email: 'Email',
  };

  const links = Object.entries(config.links)
    .filter(([, url]) => url)
    .map(([key, url]) => {
      const href = key === 'email' ? `mailto:${url}` : url;
      return `<a href="${href}" class="btn btn--ghost btn--sm" target="_blank" rel="noopener">${icons[key] || key}</a>`;
    });

  if (links.length) container.innerHTML = links.join('');
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`Failed to fetch ${url}:`, e);
    return null;
  }
}

function isLocalPath(path: string): boolean {
  return path.startsWith('local/');
}

function renderCard(entry: { title: string; description?: string; thumbnail?: string; path?: string; difficulty?: string; estimated_minutes?: number; isLocal?: boolean }): string {
  const local = entry.isLocal || (entry.path && isLocalPath(entry.path));
  const thumbSrc = entry.thumbnail
    ? (local ? entry.thumbnail : `${config.content_url}/${entry.thumbnail}`)
    : '';
  const thumb = thumbSrc
    ? `<img class="card__thumb" src="${thumbSrc}" alt="" loading="lazy" />`
    : '';

  const meta = [
    entry.difficulty ? `<span class="card__badge card__badge--${entry.difficulty}">${entry.difficulty}</span>` : '',
    entry.estimated_minutes ? `<span class="card__meta">${entry.estimated_minutes} min</span>` : '',
    local ? '<span class="card__badge card__badge--local">Chapter</span>' : '',
  ].filter(Boolean).join('');

  // Local content uses a local= param; remote uses path= param
  const href = entry.path
    ? (local ? `./article.html?local=${entry.path}` : `./article.html?path=${entry.path}`)
    : '#';

  return `
    <a href="${href}" class="card">
      ${thumb}
      <div class="card__body">
        <h3 class="card__title">${entry.title}</h3>
        ${meta ? `<div class="card__meta-row">${meta}</div>` : ''}
        ${entry.description ? `<p class="card__desc">${entry.description}</p>` : ''}
      </div>
    </a>
  `;
}

function isPathExcluded(path: string | undefined): boolean {
  if (!path || !config.content?.exclude_paths?.length) return false;
  return config.content.exclude_paths.some(excluded =>
    path === excluded || path.startsWith(excluded + '/')
  );
}

function applyCustomOrder<T extends { path?: string; content_path?: string }>(items: T[]): T[] {
  const order = config.content?.custom_order;
  if (!order?.length) return items;

  const orderMap = new Map(order.map((p, i) => [p, i]));

  return items.sort((a, b) => {
    const pathA = a.path || a.content_path || '';
    const pathB = b.path || b.content_path || '';
    const idxA = orderMap.has(pathA) ? orderMap.get(pathA)! : Infinity;
    const idxB = orderMap.has(pathB) ? orderMap.get(pathB)! : Infinity;
    if (idxA !== Infinity || idxB !== Infinity) return idxA - idxB;
    // Fallback: alphabetical for un-ordered items
    return (a as any).title?.localeCompare?.((b as any).title) || 0;
  });
}

function getLocalContentForSection(section: string): LocalContentEntry[] {
  return config.content?.local_content?.filter(lc => lc.section === section) || [];
}

async function loadLearningTree() {
  if (!config.features.learning_tree) {
    hideSection('learning');
    return;
  }

  const tree = await fetchJSON<TreeData>(`${config.content_url}/tree.json`);
  const grid = document.getElementById('learning-grid');
  if (!grid || !tree) {
    if (grid) grid.innerHTML = '<p class="muted">Could not load learning content.</p>';
    return;
  }

  // Filter out excluded paths
  let entryNodes = tree.nodes
    .filter(n => n.layer === 0)
    .filter(n => !isPathExcluded(n.content_path));

  // Apply custom ordering
  entryNodes = applyCustomOrder(entryNodes);

  // If no custom order, default to alphabetical
  if (!config.content?.custom_order?.length) {
    entryNodes.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Build cards from remote content
  const remoteCards = entryNodes.map(node =>
    renderCard({
      title: node.title,
      description: node.description,
      thumbnail: node.thumbnail,
      path: node.content_path,
      difficulty: node.difficulty,
      estimated_minutes: node.estimated_minutes,
    })
  );

  // Inject local content for the learning section
  const localCards = getLocalContentForSection('learning').map(lc =>
    renderCard({
      title: lc.title,
      description: lc.description,
      thumbnail: lc.thumbnail,
      path: lc.path,
      isLocal: true,
    })
  );

  const allCards = [...localCards, ...remoteCards];

  if (!allCards.length) {
    grid.innerHTML = '<p class="muted">No learning content available yet.</p>';
    return;
  }

  grid.innerHTML = allCards.join('');
}

async function loadManifestSection(type: 'workshop' | 'playbook', gridId: string, sectionId: string) {
  const featureKey = type === 'workshop' ? 'workshops' : 'playbooks';
  if (!config.features[featureKey]) {
    hideSection(sectionId);
    return;
  }

  const manifest = await fetchJSON<Manifest>(`${config.content_url}/manifest.json`);
  const grid = document.getElementById(gridId);
  if (!grid || !manifest) {
    if (grid) grid.innerHTML = '<p class="muted">Could not load content.</p>';
    return;
  }

  // Filter out excluded paths from remote content
  const items = manifest.content
    .filter(c => c.type === type)
    .filter(c => !isPathExcluded(c.path));

  const remoteCards = items.map(item => renderCard(item));

  // Inject local content for this section
  const sectionKey = type === 'workshop' ? 'workshops' : 'playbooks';
  const localCards = getLocalContentForSection(sectionKey).map(lc =>
    renderCard({
      title: lc.title,
      description: lc.description,
      thumbnail: lc.thumbnail,
      path: lc.path,
      isLocal: true,
    })
  );

  const allCards = [...localCards, ...remoteCards];

  if (!allCards.length) {
    grid.innerHTML = `<p class="muted">No ${type}s available yet.</p>`;
    return;
  }

  grid.innerHTML = allCards.join('');
}

function hideSection(id: string) {
  const section = document.getElementById(id);
  if (section) section.style.display = 'none';
}

/**
 * Preview mode: the dashboard's Customize tab iframes this template
 * with ?preview=1 + theme/logo/sections passed as URL params, so the
 * eboard sees changes instantly without deploying. We skip the remote
 * fetch in preview mode (their in-progress settings haven't been
 * saved yet) and apply the URL-param overrides directly.
 *
 * Query params:
 *   preview=1      required to enter preview mode
 *   primary=%234f8fea  hex color, URL-encoded
 *   accent=%23a855f7   hex color, URL-encoded
 *   logo=<url>     optional; "" or missing = default wordmark
 *   off=events,merch   comma-separated list of disabled section keys
 *                      (defaults all on, same as the dashboard model)
 */
function applyPreviewFromParams(params: URLSearchParams) {
  const primary = params.get('primary');
  const accent = params.get('accent');
  if (primary || accent) {
    applyRemoteTheme({
      primary: primary ?? config.theme.primary_color,
      accent: accent ?? config.theme.accent_color,
    });
  }

  // `logo=` with empty value = explicitly clear; absent = leave default
  const logo = params.get('logo');
  if (logo !== null) applyRemoteLogo(logo.length > 0 ? logo : null);

  const off = params.get('off');
  if (off !== null) {
    const sections: Record<string, boolean> = {};
    for (const key of off.split(',').map((s) => s.trim()).filter(Boolean)) {
      sections[key] = false;
    }
    applyRemoteSections(sections);
  }
}

async function init() {
  // 1. Apply everything we can from the bundled config (instant; no
  //    network). The page already looks right by the time any remote
  //    step finishes.
  applyConfig();

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  if (params?.get('preview') === '1') {
    // Preview mode: skip the dashboard fetch and apply overrides from
    // URL params. The iframe lives inside the dashboard's Customize
    // tab — reloading the iframe src is how the eboard sees their
    // in-progress edits reflected.
    applyPreviewFromParams(params);
  } else {
    // 2. Fetch the dashboard-managed config. Layer its theme / logo /
    //    section toggles on top of the local defaults. Section removal
    //    has to happen BEFORE render fns below, so we await.
    const remote = await loadRemoteConfig();
    if (remote) {
      applyRemoteSections(remote.sections);
      applyRemoteTheme(remote.theme);
      applyRemoteLogo(remote.logo_url);
    }
  }

  // 3. Render the remote-content-driven sections. These skip themselves
  //    when their section element was removed above (document.
  //    getElementById returns null).
  await Promise.all([
    loadLearningTree(),
    loadManifestSection('workshop', 'workshops-grid', 'workshops'),
    loadManifestSection('playbook', 'playbooks-grid', 'playbooks'),
  ]);
}

init();
