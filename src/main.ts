declare const __HUB_CONFIG__: HubConfig;

interface HubConfig {
  hub_name: string;
  hub_acronym: string;
  hub_id: string;
  university: string;
  description: string;
  theme: {
    primary_color: string;
    accent_color: string;
  };
  links: Record<string, string>;
  features: {
    learning_tree: boolean;
    playbooks: boolean;
    workshops: boolean;
  };
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
  if (!config.features.learning_tree) {
    hideNavLink('learning');
  }
  if (!config.features.workshops) {
    hideNavLink('workshops');
  }
  if (!config.features.playbooks) {
    hideNavLink('playbooks');
  }

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

function renderSocialLinks() {
  const container = document.getElementById('social-links');
  if (!container) return;

  const icons: Record<string, string> = {
    discord: 'Discord',
    github: 'GitHub',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    email: 'Email',
  };

  const links = Object.entries(config.links)
    .filter(([, url]) => url)
    .map(([key, url]) => {
      const href = key === 'email' ? `mailto:${url}` : url;
      return `<a href="${href}" class="btn btn--ghost btn--sm" target="_blank" rel="noopener">${icons[key] || key}</a>`;
    });

  if (links.length) {
    container.innerHTML = links.join('');
  }
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

function renderCard(entry: { title: string; description?: string; thumbnail?: string; path?: string; difficulty?: string; estimated_minutes?: number }, linkBase: string): string {
  const thumb = entry.thumbnail
    ? `<img class="card__thumb" src="${config.content_url}/${entry.thumbnail}" alt="" loading="lazy" />`
    : '';

  const meta = [
    entry.difficulty ? `<span class="card__badge card__badge--${entry.difficulty}">${entry.difficulty}</span>` : '',
    entry.estimated_minutes ? `<span class="card__meta">${entry.estimated_minutes} min</span>` : '',
  ].filter(Boolean).join('');

  const href = entry.path ? `${linkBase}${entry.path}` : '#';

  return `
    <a href="${href}" class="card" target="_blank" rel="noopener">
      ${thumb}
      <div class="card__body">
        <h3 class="card__title">${entry.title}</h3>
        ${meta ? `<div class="card__meta-row">${meta}</div>` : ''}
        ${entry.description ? `<p class="card__desc">${entry.description}</p>` : ''}
      </div>
    </a>
  `;
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

  const entryNodes = tree.nodes
    .filter(n => n.layer === 0)
    .sort((a, b) => a.title.localeCompare(b.title));

  if (!entryNodes.length) {
    grid.innerHTML = '<p class="muted">No learning content available yet.</p>';
    return;
  }

  grid.innerHTML = entryNodes.map(node =>
    renderCard({
      title: node.title,
      description: node.description,
      thumbnail: node.thumbnail,
      path: node.content_path,
      difficulty: node.difficulty,
      estimated_minutes: node.estimated_minutes,
    }, `${config.content_url}/article.html?path=`)
  ).join('');
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

  const items = manifest.content.filter(c => c.type === type);
  if (!items.length) {
    grid.innerHTML = `<p class="muted">No ${type}s available yet.</p>`;
    return;
  }

  const linkBase = `${config.content_url}/playbook.html?path=`;

  grid.innerHTML = items.map(item => renderCard(item, linkBase)).join('');
}

function hideSection(id: string) {
  const section = document.getElementById(id);
  if (section) section.style.display = 'none';
}

async function init() {
  applyConfig();
  await Promise.all([
    loadLearningTree(),
    loadManifestSection('workshop', 'workshops-grid', 'workshops'),
    loadManifestSection('playbook', 'playbooks-grid', 'playbooks'),
  ]);
}

init();
