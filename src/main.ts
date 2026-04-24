/**
 * Hub template entry — fetches everything from the dashboard's public
 * bundle endpoint on load, then renders every section.
 *
 * The bundle endpoint (/api/public/chapter/{slug}/bundle) returns:
 *   { chapter, config, events, leaderboard, badges, merch }
 *
 * Nothing in this file requires an API key — the bundle is public
 * (slug-keyed) so we can fetch safely from the client without
 * leaking credentials into the Vite bundle. Changes on the dashboard
 * propagate to every hub site on next page load; no rebuild needed.
 */

declare const __HUB_CONFIG__: HubConfig;

const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";

/* ──────────────────────────────────────────────────────────────────
   Page structure — fixed for v1. Each section's data-page attribute
   in index.html maps it to one of these; sections not listed here
   are treated as part of the first page (defensive default).
   Later we can make the page structure dashboard-editable, but for
   now this gives us a grouped tabbed site without a schema change.
   ────────────────────────────────────────────────────────────────── */

interface Page {
  key: string;
  label: string;
  sections: string[]; // for deciding when a page is "empty"
}

const PAGES: Page[] = [
  // Home now hosts the explainer-flavored badges section (moved off
  // Team per eboard feedback — badges + the points/merch system make
  // more sense adjacent to the leaderboard).
  { key: "home", label: "Home", sections: ["hero", "events", "leaderboard", "badges"] },
  // Learn is just the tree. Workshops/playbooks are on the content
  // CDN; the hub template used to mirror them but that duplicated
  // effort and a fresh chapter site doesn't need them by default.
  { key: "learn", label: "Learn", sections: ["learning_tree"] },
  // Team = about-the-chapter + who runs it. Badges moved out.
  { key: "team", label: "Team", sections: ["about", "officers"] },
  // Merch stays as its own tab.
  { key: "merch", label: "Merch", sections: ["merch"] },
  // Projects tab — eboard-editable showcase via the dashboard's
  // /projects page. Section toggles off entirely via Customize →
  // Section visibility, or auto-hides when no active projects exist.
  { key: "projects", label: "Projects", sections: ["projects"] },
];

/** Dashboard route each section can be edited from — used by the
 *  preview-mode click-to-edit overlay. Empty = non-editable. */
const SECTION_EDIT_INFO: Record<
  string,
  { path: string; label: string; kind: "internal" | "external" }
> = {
  hero: { path: "/website", label: "Customize → Identity", kind: "internal" },
  about: { path: "/website", label: "Customize → About", kind: "internal" },
  events: { path: "/events", label: "Events page", kind: "internal" },
  leaderboard: { path: "/people", label: "Members page", kind: "internal" },
  badges: { path: "/awards", label: "Badges & Awards", kind: "internal" },
  merch: { path: "/merch", label: "Merch page", kind: "internal" },
  projects: { path: "/projects", label: "Projects page", kind: "internal" },
  officers: { path: "/website", label: "Customize → Officers", kind: "internal" },
  learning_tree: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
  workshops: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
  playbooks: {
    path: "https://github.com/ALL-Applied-AI-Network/aain-content",
    label: "aain-content repo",
    kind: "external",
  },
};

/* ── Types (kept compact; full shapes documented in aain-api lib/hub-config.ts) ── */

interface HubConfig {
  hub_name: string;
  hub_acronym: string;
  hub_id: string;
  university: string;
  description: string;
  about: string;
  theme: { primary_color: string; accent_color: string };
  links: Record<string, string>;
  officers: { name: string; role: string; image: string }[];
  events: { title: string; date: string; time: string; location: string; description: string }[];
  features: { learning_tree: boolean; playbooks: boolean; workshops: boolean };
  content?: {
    exclude_paths: string[];
    custom_order: string[];
    local_content: LocalContentEntry[];
  };
  content_url: string;
}

interface LocalContentEntry {
  title: string;
  description: string;
  path: string;
  type: "local";
  section: "learning" | "workshops" | "playbooks";
  thumbnail?: string;
}

interface ManifestEntry {
  type: "learning" | "playbook" | "workshop" | "template";
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

interface Officer {
  name: string;
  role: string;
  image_url?: string | null;
  linkedin?: string | null;
}

interface RemoteConfig {
  theme: { primary: string; accent: string };
  logo_url: string | null;
  sections: Record<string, boolean>;
  hub_name: string | null;
  hub_acronym: string | null;
  tagline: string | null;
  about: string | null;
  cta_primary_label: string | null;
  cta_primary_href: string | null;
  cta_secondary_label: string | null;
  cta_secondary_href: string | null;
  officers: Officer[];
  social_links: Record<string, string>;
  updated_at: string | null;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  date: string;
  points_attend: number;
  points_win: number | null;
}

interface LeaderboardBadge {
  id: string;
  name: string;
  icon: string; // built-in key like "trophy", or full URL for custom uploads
}

interface LeaderboardRow {
  name: string;
  points: number;
  events_attended: number;
  rank: number;
  badges?: LeaderboardBadge[];
}

interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  award_count: number;
}

interface MerchRow {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  image_url: string | null;
  stock: number | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  year: string | null;
}

interface ChapterBundle {
  chapter: { slug: string; name: string; university: string; member_count: number; event_count: number };
  config: RemoteConfig;
  events: EventRow[];
  leaderboard: LeaderboardRow[];
  badges: BadgeRow[];
  merch: MerchRow[];
  projects: ProjectRow[];
}

const config = __HUB_CONFIG__;

/* ──────────────────────────────────────────────────────────────────
   Preview mode — dashboard's Customize tab iframes this with
   ?preview=1 + theme/logo/sections + slug params. In preview mode
   we still fetch the bundle so the iframe shows the chapter's
   actual data; URL params layer in-progress edits on top. See
   hub/README for the param table.
   ────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────
   Bundle fetch — single round trip for config + data
   ────────────────────────────────────────────────────────────────── */

async function fetchBundle(slug: string): Promise<ChapterBundle | null> {
  if (!slug) return null;
  try {
    const res = await fetch(
      `${DASHBOARD_ORIGIN}/api/public/chapter/${encodeURIComponent(
        slug.toLowerCase(),
      )}/bundle`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ChapterBundle;
  } catch {
    // Dashboard unreachable / CORS hiccup — we'll fall back to bundled
    // hub.config.json and skip the data-driven sections.
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────────
   Theme + layout primitives
   ────────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function applyTheme(theme: { primary: string; accent: string }) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", theme.primary);
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-primary-rgb", hexToRgb(theme.primary));
  root.style.setProperty("--color-accent-rgb", hexToRgb(theme.accent));
}

function applyLogo(logoUrl: string | null) {
  for (const id of ["nav-logo-img", "footer-logo-img"]) {
    const img = document.getElementById(id) as HTMLImageElement | null;
    if (!img) continue;
    if (logoUrl) {
      img.src = logoUrl;
      img.hidden = false;
      img.setAttribute("aria-hidden", "false");
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      img.setAttribute("aria-hidden", "true");
    }
  }
  // Hide the acronym when a real logo is shown in the nav, to avoid
  // a double-brand effect.
  const acronym = document.getElementById("nav-acronym");
  if (acronym) acronym.style.display = logoUrl ? "none" : "";
}

function applySectionToggles(sections: Record<string, boolean>) {
  // Remove sections (and their nav links) when a key is explicitly
  // false. Missing keys default to ON. A section-key like "events"
  // matches elements with `data-section="events"`.
  for (const [key, on] of Object.entries(sections)) {
    if (on) continue;
    document.querySelectorAll(`[data-section="${key}"]`).forEach((el) => el.remove());
    document
      .querySelectorAll(`.nav__link[data-nav-for="${key}"]`)
      .forEach((el) => el.remove());
  }
}

/* ──────────────────────────────────────────────────────────────────
   Identity (name / acronym / tagline / about) + hero CTAs
   ────────────────────────────────────────────────────────────────── */

function setText(id: string, text: string | null | undefined) {
  const el = document.getElementById(id);
  if (!el) return;
  if (text == null || text.length === 0) {
    el.textContent = "";
    return;
  }
  el.textContent = text;
}

function renderIdentity(
  remote: RemoteConfig | null,
  chapter: ChapterBundle["chapter"] | null,
) {
  const hubName = remote?.hub_name ?? chapter?.name ?? config.hub_name;
  const hubAcronym =
    remote?.hub_acronym ?? config.hub_acronym ?? hubName.slice(0, 4);
  const tagline =
    remote?.tagline ?? config.description ?? "A student-run applied AI community.";
  const university = chapter?.university ?? config.university;

  document.title = `${hubName} — ALL Applied AI Network`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", tagline);

  setText("nav-acronym", hubAcronym);
  setText("nav-hub-name", hubName);
  setText("hero-title", hubName);
  setText("hero-subtitle", tagline);
  setText("hero-university", university);
  setText("about-title", `About ${hubName}`);
  setText("footer-hub-name", hubName);
  setText("footer-university", university);
}

function renderHeroActions(remote: RemoteConfig | null) {
  const container = document.getElementById("hero-actions");
  if (!container) return;
  container.innerHTML = "";

  const buttons: Array<{ label: string; href: string; primary: boolean }> = [];
  if (remote?.cta_primary_label && remote?.cta_primary_href) {
    buttons.push({
      label: remote.cta_primary_label,
      href: remote.cta_primary_href,
      primary: true,
    });
  }
  if (remote?.cta_secondary_label && remote?.cta_secondary_href) {
    buttons.push({
      label: remote.cta_secondary_label,
      href: remote.cta_secondary_href,
      primary: false,
    });
  }

  // Sensible defaults when the dashboard hasn't been configured yet —
  // anchor links into the page, so the site still feels complete.
  if (buttons.length === 0) {
    if (document.getElementById("events")) {
      buttons.push({ label: "Upcoming events", href: "#events", primary: true });
    }
    if (document.getElementById("learning")) {
      buttons.push({
        label: "Start learning",
        href: "#learning",
        primary: buttons.length === 0,
      });
    }
  }

  for (const b of buttons) {
    const a = document.createElement("a");
    a.className = `btn ${b.primary ? "btn--primary" : "btn--ghost"}`;
    a.href = b.href;
    // Only external links open in a new tab.
    if (/^https?:\/\//.test(b.href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.textContent = b.label;
    container.appendChild(a);
  }
}

function renderStats(chapter: ChapterBundle["chapter"] | null, badges: BadgeRow[]) {
  const strip = document.getElementById("hero-stats") as HTMLElement | null;
  if (!strip) return;

  // No chapter data → hide the strip entirely. Em-dashes read as
  // "data loading" rather than "nothing to show yet," and a ghost
  // stats strip on a fresh template is worse than no strip at all.
  if (!chapter) {
    strip.style.display = "none";
    return;
  }

  strip.style.display = "";
  const map: Record<string, string> = {
    members: formatCount(chapter.member_count),
    events: formatCount(chapter.event_count),
    badges: formatCount(badges.length),
  };
  for (const [key, val] of Object.entries(map)) {
    const el = document.querySelector(`[data-stat="${key}"]`);
    if (el) el.textContent = val;
  }
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function renderAbout(remoteAbout: string | null) {
  const container = document.getElementById("about-content");
  if (!container) return;
  const md = remoteAbout ?? config.about ?? "";
  if (!md.trim()) {
    container.innerHTML = `
      <p>We're part of the <strong>ALL Applied AI Network</strong> — a nationwide network of university AI chapters focused on applied AI engineering.</p>
      <p>Our curriculum starts at absolute zero and builds a path to shipping real AI products. No prior experience required.</p>
    `;
    return;
  }
  container.innerHTML = md
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${renderInlineMarkdown(p)}</p>`)
    .join("");
}

/** Very small markdown subset: **bold**, *italic*, [label](url). */
function renderInlineMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\n/g, "<br />");
}

/* ──────────────────────────────────────────────────────────────────
   Events
   ────────────────────────────────────────────────────────────────── */

/** Remove a whole section + its nav link + any page tabs that
 *  pointed at it. Used by the data-driven renderers below when the
 *  API returns no rows — empty "no events yet" cards on a public
 *  site read as broken, better to hide the section entirely and
 *  surface the warning on the dashboard. */
function hideSection(sectionKey: string) {
  document
    .querySelectorAll(`[data-section="${sectionKey}"]`)
    .forEach((el) => el.remove());
  document
    .querySelectorAll(`.nav__link[data-nav-for="${sectionKey}"]`)
    .forEach((el) => el.remove());
}

function renderEvents(events: EventRow[], _tagline: string | null | undefined) {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  if (!events.length) {
    hideSection("events");
    return;
  }

  grid.innerHTML = events
    .map((e) => {
      const d = new Date(e.date);
      const month = d
        .toLocaleDateString("en-US", { month: "short" })
        .toUpperCase();
      const day = d.getDate();
      const time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const desc = e.description
        ? escapeHtml(e.description)
        : "";
      return `
        <article class="event-card" role="listitem">
          <div class="event-card__date" aria-label="${month} ${day}">
            <div class="event-card__date-month">${month}</div>
            <div class="event-card__date-day">${day}</div>
          </div>
          <div class="event-card__body">
            <div class="event-card__type">${escapeHtml(e.type ?? "event")}</div>
            <h3 class="event-card__title">${escapeHtml(e.title)}</h3>
            ${desc ? `<p class="event-card__desc">${desc}</p>` : ""}
            <div class="event-card__meta">${time} · ${e.points_attend} pts</div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Leaderboard — top 3 podium + list up to 20
   ────────────────────────────────────────────────────────────────── */

/** SVG medal icons — the emoji versions read as "playful" rather than
 *  "grand". These are flat SVGs styled with CSS per rank. */
const MEDAL_SVGS: Record<number, string> = {
  1: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="m10.5 15 1.5 1.5L14 14"/></svg>`,
  2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/></svg>`,
  3: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/></svg>`,
};

function renderLeaderboard(rows: LeaderboardRow[]) {
  const container = document.getElementById("leaderboard-content");
  if (!container) return;

  if (!rows.length) {
    hideSection("leaderboard");
    return;
  }

  // Cap the visible count so the podium has something even on small
  // chapters, and the list doesn't run forever.
  const top3 = rows.filter((r) => r.rank <= 3);
  const rest = rows.filter((r) => r.rank > 3);
  const maxPoints = Math.max(...rows.map((r) => r.points), 1);

  // Re-order 2, 1, 3 visually for the classic podium shape (center
  // winner, left runner-up, right third). #1 card is taller to
  // reinforce the tier visually beyond color alone.
  const ordered = [2, 1, 3]
    .map((rank) => top3.find((t) => t.rank === rank))
    .filter((r): r is LeaderboardRow => Boolean(r));

  const rankLabel: Record<number, string> = { 1: "Gold", 2: "Silver", 3: "Bronze" };

  // Compact badge strip next to each member's name — cap at 4 visible
  // icons so a prolific winner doesn't blow out the row, with a "+N"
  // overflow chip. Gives the leaderboard visual variety across members.
  const renderMemberBadges = (badges?: LeaderboardBadge[]): string => {
    if (!badges?.length) return "";
    const MAX = 4;
    const shown = badges.slice(0, MAX);
    const overflow = badges.length - shown.length;
    const chips = shown
      .map(
        (b) => `
        <span class="member-badge" title="${escapeAttr(b.name)}" aria-label="${escapeAttr(b.name)}">
          ${renderBadgeIcon(b.icon)}
        </span>
      `,
      )
      .join("");
    const more =
      overflow > 0
        ? `<span class="member-badge member-badge--more" title="${overflow} more" aria-label="${overflow} more">+${overflow}</span>`
        : "";
    return `<div class="member-badges" aria-label="earned badges">${chips}${more}</div>`;
  };

  const podiumHtml = ordered.length
    ? `
      <div class="podium">
        ${ordered
          .map((r) => {
            const pctOfMax = Math.round((r.points / maxPoints) * 100);
            return `
          <div class="podium-card podium-card--rank-${r.rank}">
            <div class="podium-card__glow" aria-hidden="true"></div>
            <div class="podium-card__medal">${MEDAL_SVGS[r.rank] ?? ""}</div>
            <div class="podium-card__tier">${rankLabel[r.rank]}</div>
            <div class="podium-card__rank">${r.rank}</div>
            <div class="podium-card__name">${escapeHtml(r.name)}</div>
            ${renderMemberBadges(r.badges)}
            <div class="podium-card__xp">
              <span class="podium-card__xp-num">${r.points.toLocaleString()}</span>
              <span class="podium-card__xp-unit">Pts</span>
            </div>
            <div class="podium-card__events">${r.events_attended} events</div>
            <div class="podium-card__bar" aria-hidden="true">
              <div class="podium-card__bar-fill" style="width:${pctOfMax}%"></div>
            </div>
          </div>
        `;
          })
          .join("")}
      </div>
    `
    : "";

  const listHtml = rest.length
    ? `
      <div class="leaderboard-list">
        ${rest
          .map((r) => {
            const pctOfMax = Math.round((r.points / maxPoints) * 100);
            return `
          <div class="leaderboard-row">
            <div class="leaderboard-row__rank">#${r.rank}</div>
            <div class="leaderboard-row__body">
              <div class="leaderboard-row__name-row">
                <span class="leaderboard-row__name">${escapeHtml(r.name)}</span>
                ${renderMemberBadges(r.badges)}
              </div>
              <div class="leaderboard-row__bar" aria-hidden="true">
                <div class="leaderboard-row__bar-fill" style="width:${pctOfMax}%"></div>
              </div>
              <div class="leaderboard-row__meta">${r.events_attended} events</div>
            </div>
            <div class="leaderboard-row__points">
              ${r.points.toLocaleString()}<span class="leaderboard-row__points-unit">Pts</span>
            </div>
          </div>
        `;
          })
          .join("")}
      </div>
    `
    : "";

  container.innerHTML = podiumHtml + listHtml;
}

/* ──────────────────────────────────────────────────────────────────
   Badges
   ────────────────────────────────────────────────────────────────── */

const BUILT_IN_ICONS: Record<string, string> = {
  trophy:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  award:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  medal:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><circle cx="12" cy="17" r="5"/></svg>',
  lightning:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
};

function renderBadgeIcon(icon: string): string {
  const key = (icon ?? "").trim();
  if (
    key.startsWith("http://") ||
    key.startsWith("https://") ||
    key.startsWith("data:image/")
  ) {
    return `<img src="${escapeAttr(key)}" alt="" />`;
  }
  return BUILT_IN_ICONS[key] ?? BUILT_IN_ICONS.trophy;
}

function renderBadges(badges: BadgeRow[]) {
  const grid = document.getElementById("badges-grid");
  if (!grid) return;

  if (!badges.length) {
    hideSection("badges");
    return;
  }

  const sorted = [...badges].sort((a, b) => b.award_count - a.award_count);

  grid.innerHTML = sorted
    .map(
      (b) => `
    <div class="badge-card" role="listitem">
      <div class="badge-card__icon">${renderBadgeIcon(b.icon)}</div>
      <div class="badge-card__body">
        <div class="badge-card__name">${escapeHtml(b.name)}</div>
        ${
          b.description
            ? `<p class="badge-card__desc">${escapeHtml(b.description)}</p>`
            : ""
        }
        <div class="badge-card__count">${b.award_count} earned</div>
      </div>
    </div>
  `,
    )
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Merch
   ────────────────────────────────────────────────────────────────── */

function renderMerch(items: MerchRow[]) {
  const grid = document.getElementById("merch-grid");
  if (!grid) return;

  if (!items.length) {
    hideSection("merch");
    return;
  }

  const packageIcon = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16.5 9.4 7.55 4.24"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>`;

  grid.innerHTML = items
    .map((m) => {
      const photo = m.image_url
        ? `<img src="${escapeAttr(m.image_url)}" alt="" />`
        : `<div class="merch-card__photo-placeholder">${packageIcon}</div>`;
      const stockLine =
        m.stock === null
          ? "Unlimited stock"
          : m.stock === 0
            ? "Out of stock"
            : `${m.stock} left`;
      const stockClass = m.stock === 0 ? " merch-card__stock--empty" : "";
      return `
      <div class="merch-card" role="listitem">
        <div class="merch-card__photo">${photo}</div>
        <div class="merch-card__body">
          <div class="merch-card__header">
            <div class="merch-card__name">${escapeHtml(m.name)}</div>
            <div class="merch-card__cost">${m.cost_points.toLocaleString()} pts</div>
          </div>
          ${
            m.description
              ? `<p class="merch-card__desc">${escapeHtml(m.description)}</p>`
              : ""
          }
          <div class="merch-card__stock${stockClass}">${stockLine}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Officers
   ────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────
   Projects — chapter-editable showcase
   ────────────────────────────────────────────────────────────────── */

function renderProjects(projects: ProjectRow[]) {
  const grid = document.getElementById("projects-grid");
  if (!grid) return;

  if (!projects.length) {
    // Same auto-hide pattern as the other data-driven sections — no
    // data → the whole Projects tab disappears from the nav.
    hideSection("projects");
    return;
  }

  const packageIcon = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>`;

  const externalIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>`;

  grid.innerHTML = projects
    .map((p) => {
      const photo = p.image_url
        ? `<img src="${escapeAttr(p.image_url)}" alt="" loading="lazy" />`
        : `<div class="project-card__photo-placeholder">${packageIcon}</div>`;
      const year = p.year
        ? `<span class="project-card__year">${escapeHtml(p.year)}</span>`
        : "";
      const linkWrap = p.link_url
        ? `<a class="project-card" href="${escapeAttr(p.link_url)}" target="_blank" rel="noopener noreferrer" role="listitem">`
        : `<div class="project-card" role="listitem">`;
      const linkClose = p.link_url ? `</a>` : `</div>`;
      const linkTag = p.link_url
        ? `<span class="project-card__link">${externalIcon} View</span>`
        : "";
      return `
        ${linkWrap}
          <div class="project-card__photo">
            ${photo}
            ${year}
          </div>
          <div class="project-card__body">
            <h3 class="project-card__title">${escapeHtml(p.title)}</h3>
            ${
              p.description
                ? `<p class="project-card__desc">${escapeHtml(p.description)}</p>`
                : ""
            }
            ${linkTag}
          </div>
        ${linkClose}
      `;
    })
    .join("");
}

function officerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function renderOfficers(officers: Officer[]) {
  const grid = document.getElementById("officers-grid");
  if (!grid) return;

  // Fall back to the template's local officers if none from remote, so
  // a fresh fork still shows something.
  const list =
    officers.length > 0
      ? officers
      : (config.officers ?? []).map((o) => ({
          name: o.name,
          role: o.role,
          image_url: o.image || null,
          linkedin: null,
        }));

  if (!list.length) {
    // No officers anywhere — remove the section entirely.
    const section = document.getElementById("officers");
    section?.remove();
    document
      .querySelector('.nav__link[data-nav-for="officers"]')
      ?.remove();
    return;
  }

  const linkedinIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.67H5.67v8.67zM7 8.5a1.54 1.54 0 1 0 0-3.08 1.54 1.54 0 0 0 0 3.08zm11.34 9.84v-4.75c0-2.53-1.35-3.7-3.15-3.7-1.45 0-2.1.8-2.47 1.37V9.67h-2.68s.03.76 0 8.67h2.68v-4.84c0-.24.02-.48.09-.65.18-.48.62-.98 1.35-.98.96 0 1.34.73 1.34 1.8v4.67z"/></svg>`;

  grid.innerHTML = list
    .map((o) => {
      const avatar = o.image_url
        ? `<img src="${escapeAttr(o.image_url)}" alt="" />`
        : officerInitials(o.name);
      const linkedin = o.linkedin
        ? `<a class="officer-card__linkedin" href="${escapeAttr(o.linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(o.name)} on LinkedIn">${linkedinIcon}</a>`
        : "";
      return `
      <div class="officer-card" role="listitem">
        <div class="officer-card__avatar">${avatar}</div>
        <div class="officer-card__name">${escapeHtml(o.name)}</div>
        <div class="officer-card__role">${escapeHtml(o.role ?? "")}</div>
        ${linkedin}
      </div>
    `;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Social links footer
   ────────────────────────────────────────────────────────────────── */

const SOCIAL_ICONS: Record<string, string> = {
  discord: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.32 4.37a19.79 19.79 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.2.38-.43.87-.59 1.26a18.27 18.27 0 0 0-5.52 0c-.17-.39-.4-.88-.6-1.26a.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.44 9.05-.27 13.58.1 18.06a.1.1 0 0 0 .04.07 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-2a.07.07 0 0 0-.04-.11 13.1 13.1 0 0 1-1.88-.9.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.3a.08.08 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.07 0a.08.08 0 0 1 .08.01c.12.1.24.2.37.3a.08.08 0 0 1-.01.13 12.3 12.3 0 0 1-1.88.9.08.08 0 0 0-.04.11c.37.7.78 1.37 1.24 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .04-.07c.44-5.18-.73-9.67-3.1-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.22 0 2.19 1.1 2.16 2.42 0 1.33-.94 2.42-2.16 2.42z"/></svg>`,
  github: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.77 5.46.77 11.73c0 4.96 3.22 9.17 7.68 10.66.56.1.77-.24.77-.54v-2.06c-3.13.68-3.79-1.3-3.79-1.3-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.39-1.22.72-1.5-2.5-.28-5.12-1.25-5.12-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.15a10.8 10.8 0 0 1 5.62 0c2.15-1.46 3.09-1.15 3.09-1.15.61 1.54.23 2.69.11 2.97.72.79 1.16 1.79 1.16 3.02 0 4.31-2.63 5.26-5.14 5.54.4.35.76 1.03.76 2.07v3.07c0 .3.21.65.78.54 4.45-1.49 7.67-5.7 7.67-10.66C23.23 5.46 18.27.5 12 .5z"/></svg>`,
  instagram: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37a4 4 0 1 1-7.914 1.172A4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  linkedin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.34 18.34V9.67H5.67v8.67zM7 8.5a1.54 1.54 0 1 0 0-3.08 1.54 1.54 0 0 0 0 3.08zm11.34 9.84v-4.75c0-2.53-1.35-3.7-3.15-3.7-1.45 0-2.1.8-2.47 1.37V9.67h-2.68s.03.76 0 8.67h2.68v-4.84c0-.24.02-.48.09-.65.18-.48.62-.98 1.35-.98.96 0 1.34.73 1.34 1.8v4.67z"/></svg>`,
  twitter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  youtube: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3 3 0 0 0-2.11-2.12C19.505 3.545 12 3.545 12 3.545s-7.504 0-9.389.521A3 3 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3 3 0 0 0 2.11 2.12c1.885.521 9.389.521 9.389.521s7.504 0 9.389-.521a3 3 0 0 0 2.11-2.12C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"/></svg>`,
  email: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
};

const SOCIAL_LABELS: Record<string, string> = {
  discord: "Discord",
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  youtube: "YouTube",
  email: "Email",
};

function renderSocials(links: Record<string, string>) {
  const container = document.getElementById("footer-socials");
  if (!container) return;

  // Merge remote over bundled so a fresh fork has something.
  const merged: Record<string, string> = { ...(config.links ?? {}) };
  for (const [k, v] of Object.entries(links)) {
    if (v) merged[k] = v;
  }

  const entries = Object.entries(merged).filter(([, v]) => v);
  if (!entries.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = entries
    .map(([key, url]) => {
      const href = key === "email" ? `mailto:${url}` : url;
      const icon = SOCIAL_ICONS[key] ?? SOCIAL_ICONS.email;
      const label = SOCIAL_LABELS[key] ?? key;
      return `<a class="footer-social" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${icon}</a>`;
    })
    .join("");
}

/* ──────────────────────────────────────────────────────────────────
   Learning / Workshops / Playbooks — CDN content
   ────────────────────────────────────────────────────────────────── */

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
  return path.startsWith("local/");
}

function renderCard(entry: {
  title: string;
  description?: string;
  thumbnail?: string;
  path?: string;
  difficulty?: string;
  estimated_minutes?: number;
  isLocal?: boolean;
}): string {
  const local = entry.isLocal || (entry.path && isLocalPath(entry.path));
  const thumbSrc = entry.thumbnail
    ? local
      ? entry.thumbnail
      : `${config.content_url}/${entry.thumbnail}`
    : "";
  const thumb = thumbSrc
    ? `<img class="card__thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy" />`
    : "";

  const badges = [
    entry.difficulty
      ? `<span class="card__badge card__badge--${escapeAttr(
          entry.difficulty,
        )}">${escapeHtml(entry.difficulty)}</span>`
      : "",
    entry.estimated_minutes
      ? `<span class="card__meta">${entry.estimated_minutes} min</span>`
      : "",
    local ? '<span class="card__badge card__badge--local">Chapter</span>' : "",
  ]
    .filter(Boolean)
    .join("");

  const href = entry.path
    ? local
      ? `./article.html?local=${encodeURIComponent(entry.path)}`
      : `./article.html?path=${encodeURIComponent(entry.path)}`
    : "#";

  return `
    <a href="${escapeAttr(href)}" class="card">
      ${thumb}
      <div class="card__body">
        <h3 class="card__title">${escapeHtml(entry.title)}</h3>
        ${badges ? `<div class="card__meta-row">${badges}</div>` : ""}
        ${
          entry.description
            ? `<p class="card__desc">${escapeHtml(entry.description)}</p>`
            : ""
        }
      </div>
    </a>
  `;
}

function isPathExcluded(path: string | undefined): boolean {
  if (!path || !config.content?.exclude_paths?.length) return false;
  return config.content.exclude_paths.some(
    (excluded) => path === excluded || path.startsWith(excluded + "/"),
  );
}

function applyCustomOrder<T extends { path?: string; content_path?: string; title?: string }>(
  items: T[],
): T[] {
  const order = config.content?.custom_order;
  if (!order?.length) return items;
  const orderMap = new Map(order.map((p, i) => [p, i]));
  return items.sort((a, b) => {
    const pathA = a.path || a.content_path || "";
    const pathB = b.path || b.content_path || "";
    const idxA = orderMap.has(pathA) ? orderMap.get(pathA)! : Infinity;
    const idxB = orderMap.has(pathB) ? orderMap.get(pathB)! : Infinity;
    if (idxA !== Infinity || idxB !== Infinity) return idxA - idxB;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

function getLocalContentForSection(
  section: "learning" | "workshops" | "playbooks",
): LocalContentEntry[] {
  return (
    config.content?.local_content?.filter((lc) => lc.section === section) ?? []
  );
}

/** Render the shared empty-state card inside a grid. */
function renderGridEmpty(
  gridId: string,
  title: string,
  desc: string,
): void {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__title">${escapeHtml(title)}</div>
      <div class="empty-state__desc">${escapeHtml(desc)}</div>
    </div>
  `;
}

/**
 * Load the learning tree by embedding the content repo's /tree.html
 * directly in the Learn page. The content repo already ships a full
 * interactive tree visualization (D3-based, with expandable node
 * detail drawers); reimplementing that inside every hub template
 * would duplicate a lot of carefully-tuned code and diverge over
 * time. Iframe lets every chapter site inherit upstream improvements
 * for free.
 *
 * If the iframe never loads (content_url missing, CORS hiccup,
 * content repo down), we flip to a simple fallback message with a
 * link out to the tree page.
 */
async function loadLearningTree() {
  const frame = document.getElementById(
    "learn-tree-frame",
  ) as HTMLIFrameElement | null;
  const fallback = document.getElementById("learn-tree-fallback");
  if (!frame) return;

  if (!config.content_url) {
    frame.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      renderGridEmpty(
        "learning-grid",
        "Curriculum will appear here",
        "Once the ALL Applied AI Network content library is wired to this site, the tree loads automatically.",
      );
    }
    return;
  }

  // Point the iframe at the upstream tree page. Using ?embed=1 as a
  // hint for any future tweaks on the content side (e.g., hiding the
  // outer nav when embedded) — it's harmless if ignored.
  frame.src = `${config.content_url}/tree.html?embed=1`;

  // Also wire the fallback's "Open the full interactive tree" link
  // in case the iframe itself is ever unreachable.
  const treeLink = document.getElementById(
    "tree-link",
  ) as HTMLAnchorElement | null;
  if (treeLink) treeLink.href = `${config.content_url}/tree.html`;

  // If the iframe takes more than 8 s to signal load, show the
  // fallback. The content repo is usually sub-second, so this only
  // trips when something's actually wrong.
  const loadTimeout = window.setTimeout(() => {
    frame.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      renderGridEmpty(
        "learning-grid",
        "Couldn't reach the content library",
        "The learning tree lives at all-ai-network.org/tree.html — try the link above.",
      );
    }
  }, 8000);
  frame.addEventListener(
    "load",
    () => window.clearTimeout(loadTimeout),
    { once: true },
  );
}

/** Compact card for a single learning-tree node — visually smaller
 *  than the big workshop/playbook cards so a long row of nodes
 *  reads as a tier. */
/* ──────────────────────────────────────────────────────────────────
   Hero neural-network background

   Generates an SVG mesh of nodes + connecting edges into #hero-network.
   Nodes inherit currentColor (which main.ts sets from --color-primary
   and --color-accent), so the whole pattern recolors live when the
   eboard changes their theme.

   Why procedural instead of hardcoded markup: we want different
   layouts on different reloads so no two sessions look identical,
   and fixed coordinates in HTML would bake a specific pattern into
   every chapter's site. Seeded so the generation is stable for the
   duration of a page load (looks the same after re-renders).
   ────────────────────────────────────────────────────────────────── */

interface NetworkNode {
  x: number;
  y: number;
  r: number;
  /** "primary" or "accent" — which theme color this node uses. */
  tone: "primary" | "accent";
  /** Stagger animation phase so the whole mesh doesn't pulse in sync. */
  delay: number;
}

function renderHeroNetwork() {
  const svg = document.getElementById("hero-network");
  if (!svg) return;

  const VB_W = 1200;
  const VB_H = 500;

  // A rough hex-ish grid of node slots. We jitter each slot a bit
  // and then drop ~25% randomly so the mesh doesn't look machine-
  // regular. The center column is thinned further to keep the hero
  // text (H1 + subtitle) readable.
  const COLS = 8;
  const ROWS = 4;
  const cellW = VB_W / (COLS - 1);
  const cellH = VB_H / (ROWS - 1);

  const nodes: NetworkNode[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const jitterX = (Math.random() - 0.5) * cellW * 0.4;
      const jitterY = (Math.random() - 0.5) * cellH * 0.35;
      const x = c * cellW + jitterX;
      const y = r * cellH + jitterY;

      // Thin out the center zone where the hero title lives so the
      // mesh frames the text rather than running through it.
      const cx = VB_W / 2;
      const cy = VB_H / 2;
      const dx = (x - cx) / (VB_W / 2);
      const dy = (y - cy) / (VB_H / 2);
      const centerDist = Math.sqrt(dx * dx + dy * dy); // 0 at center, ~1 at edges

      // Probability of keeping the node increases toward the edges.
      const keepChance = 0.4 + centerDist * 0.6;
      if (Math.random() > keepChance) continue;

      nodes.push({
        x,
        y,
        r: 2.5 + Math.random() * 2.5,
        tone: Math.random() < 0.55 ? "primary" : "accent",
        delay: Math.random() * 4,
      });
    }
  }

  // Edges: connect each node to its closest 2 neighbors, capped at
  // ~1.5 cells away. Dedupe so (a→b) and (b→a) aren't both drawn.
  const maxEdgeDist = Math.sqrt(cellW * cellW + cellH * cellH) * 1.5;
  const edgeSet = new Set<string>();
  const edges: Array<{ a: NetworkNode; b: NetworkNode; delay: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const distances = nodes
      .map((n, j) => ({
        j,
        d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y),
      }))
      .filter((x) => x.j !== i && x.d <= maxEdgeDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of distances) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        a: nodes[i],
        b: nodes[j],
        delay: Math.random() * 5,
      });
    }
  }

  // Build the SVG markup. The `svg` element is the existing one in
  // index.html — we only replace its inner content.
  const edgesSvg = edges
    .map(
      (e) => `
      <line
        x1="${e.a.x.toFixed(1)}" y1="${e.a.y.toFixed(1)}"
        x2="${e.b.x.toFixed(1)}" y2="${e.b.y.toFixed(1)}"
        class="hero-net-line"
        style="animation-delay:${e.delay.toFixed(2)}s"
      />`,
    )
    .join("");

  const nodesSvg = nodes
    .map(
      (n) => `
      <circle
        cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}"
        class="hero-net-node hero-net-node--${n.tone}"
        style="animation-delay:${n.delay.toFixed(2)}s"
      />`,
    )
    .join("");

  svg.innerHTML = `
    <g class="hero-net-edges">${edgesSvg}</g>
    <g class="hero-net-nodes">${nodesSvg}</g>
  `;
}

/* Workshops + playbooks sections used to live on the hub template
 * and mirror content from the aain-content CDN. They've been
 * removed now — the Learn page iframes the content repo's full
 * tree visualization instead of splitting curriculum across three
 * separate in-page grids. Chapters who want their members to see
 * workshop / playbook content link out to all-ai-network.org from
 * wherever makes sense. */

/* ──────────────────────────────────────────────────────────────────
   Page navigation (tabs + hash routing + visibility)
   ────────────────────────────────────────────────────────────────── */

/** A page is "empty" if every section it contains is either missing
 *  from the DOM (toggled off by the dashboard) or has zero data. */
function pagesWithContent(sectionsEnabled: Record<string, boolean>): Page[] {
  return PAGES.filter((p) => {
    return p.sections.some((sectionKey) => {
      // Section was toggled off entirely by the dashboard — gone from DOM.
      if (sectionsEnabled[sectionKey] === false) return false;
      const el = document.querySelector(`[data-section="${sectionKey}"]`);
      return el !== null;
    });
  });
}

function renderPageNav(pages: Page[], activeKey: string) {
  const container = document.getElementById("nav-links");
  if (!container) return;
  container.innerHTML = pages
    .map(
      (p) => `
      <a
        href="#${p.key}"
        class="nav__link nav__tab${p.key === activeKey ? " nav__tab--active" : ""}"
        data-page-tab="${p.key}"
        role="tab"
        aria-selected="${p.key === activeKey ? "true" : "false"}"
      >${escapeHtml(p.label)}</a>
    `,
    )
    .join("");
}

/** Short copy shown in the compact page-header band at the top of
 *  non-home pages. Gives each page a sense of "arrival" without
 *  repeating the full hero. */
const PAGE_HEADER_COPY: Record<
  string,
  { kicker: string; title: string; desc: string }
> = {
  learn: {
    kicker: "Curriculum",
    title: "Learning tree",
    desc: "Our full applied-AI skill map. Click any node to expand it; follow the edges to see what comes next.",
  },
  projects: {
    kicker: "Our work",
    title: "Projects",
    desc: "What members have built — Innovation Labs cohorts, hackathon winners, research collaborations.",
  },
  team: {
    kicker: "People + recognition",
    title: "Team",
    desc: "Meet the eboard and see every badge members have earned.",
  },
  merch: {
    kicker: "Rewards shop",
    title: "Merch",
    desc: "Earn points at events and recognitions, redeem in person at any meeting.",
  },
};

function showPage(pageKey: string, pages: Page[]) {
  const page = pages.find((p) => p.key === pageKey) ?? pages[0];
  if (!page) return;

  // Flip nav tab active state.
  document.querySelectorAll("[data-page-tab]").forEach((el) => {
    const match = el.getAttribute("data-page-tab") === page.key;
    el.classList.toggle("nav__tab--active", match);
    el.setAttribute("aria-selected", String(match));
  });

  // Show/hide sections by data-page attribute. A section without
  // data-page defaults to "home" so nothing is orphaned.
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
    const assigned = el.getAttribute("data-page") ?? "home";
    el.style.display = assigned === page.key ? "" : "none";
  });

  // Page-header band: populate + show on non-home pages (home has
  // the full hero already). On mobile, visitors get a compact
  // title bar that tells them where they are.
  const header = document.getElementById("page-header");
  if (header) {
    if (page.key === "home") {
      header.hidden = true;
    } else {
      const copy = PAGE_HEADER_COPY[page.key] ?? {
        kicker: "",
        title: page.label,
        desc: "",
      };
      setText("page-header-kicker", copy.kicker);
      setText("page-header-title", copy.title);
      setText("page-header-desc", copy.desc);
      header.hidden = false;
    }
  }

  // Don't scroll on initial load (hashchange on boot); scroll only when
  // the user explicitly clicks a tab.
  if (document.body.dataset.pageInited === "1") {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
}

function getValidPageFromHash(pages: Page[]): string {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (pages.some((p) => p.key === hash)) return hash;
  return pages[0]?.key ?? "home";
}

function wirePageRouting(pages: Page[]) {
  renderPageNav(pages, getValidPageFromHash(pages));
  showPage(getValidPageFromHash(pages), pages);
  document.body.dataset.pageInited = "1";

  window.addEventListener("hashchange", () => {
    showPage(getValidPageFromHash(pages), pages);
  });
}

/* ──────────────────────────────────────────────────────────────────
   Click-to-edit overlays (preview mode only)
   ────────────────────────────────────────────────────────────────── */

function enableEditOverlays() {
  document.body.classList.add("preview-edit-mode");
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => {
    const key = section.getAttribute("data-section");
    if (!key) return;
    const info = SECTION_EDIT_INFO[key];
    if (!info) return;

    // Position the pill relative to the section.
    if (getComputedStyle(section).position === "static") {
      section.style.position = "relative";
    }

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "edit-pill";
    pill.innerHTML = `
      <svg class="edit-pill__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span>${escapeHtml(info.label)}</span>
    `;
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // postMessage the parent (dashboard). The dashboard's Customize
      // panel listens for this and navigates the main window. Using
      // postMessage (not direct navigation) means this still works
      // when the iframe is cross-origin, which it is in production.
      window.parent?.postMessage(
        { type: "aain-edit-section", section: key, target: info.path, kind: info.kind },
        "*",
      );
    });
    section.appendChild(pill);
  });
}

/* ──────────────────────────────────────────────────────────────────
   Nav toggle (mobile)
   ────────────────────────────────────────────────────────────────── */

function wireNavToggle() {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("nav__links--open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Close when clicking a link
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      links.classList.remove("nav__links--open");
      toggle.setAttribute("aria-expanded", "false");
    }),
  );
}

/* ──────────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/* ──────────────────────────────────────────────────────────────────
   Init
   ────────────────────────────────────────────────────────────────── */

async function init() {
  wireNavToggle();

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const isPreview = params?.get("preview") === "1";
  const editMode = isPreview && params?.get("edit") === "1";

  // Resolve which slug to fetch: preview mode passes slug explicitly
  // from the dashboard; normal mode reads it from the bundled config
  // (set by the chapter's hub.config.json).
  const slug =
    (isPreview ? params?.get("slug") : null) ??
    config.hub_id?.trim().toLowerCase() ??
    "";

  // Always try to fetch the bundle — in preview we want live data on
  // top of in-progress URL overrides; in normal mode it's the whole
  // source of truth.
  const bundle = slug ? await fetchBundle(slug) : null;
  const remote = bundle?.config ?? null;
  const savedSections: Record<string, boolean> = remote?.sections ?? {};

  // Theme: URL overrides beat saved config beat bundled defaults.
  const primary =
    (isPreview ? params?.get("primary") : null) ??
    remote?.theme.primary ??
    config.theme.primary_color;
  const accent =
    (isPreview ? params?.get("accent") : null) ??
    remote?.theme.accent ??
    config.theme.accent_color;
  applyTheme({ primary, accent });

  // Logo: in preview, a URL `logo=` param wins (including empty-string
  // = explicitly clear). Otherwise saved config wins.
  if (isPreview && params && params.get("logo") !== null) {
    const logoParam = params.get("logo");
    applyLogo(logoParam && logoParam.length > 0 ? logoParam : null);
  } else {
    applyLogo(remote?.logo_url ?? null);
  }

  // Section visibility: start from saved + fold in preview `off=` list.
  const sectionsToApply: Record<string, boolean> = { ...savedSections };
  if (isPreview && params?.get("off")) {
    for (const key of params
      .get("off")!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sectionsToApply[key] = false;
    }
  }
  applySectionToggles(sectionsToApply);

  // Render everything from the bundle + config (or bundled fallbacks
  // when unresolved). Same pipeline for both preview and normal mode
  // now — the difference is only in which overrides were layered above.
  renderIdentity(remote, bundle?.chapter ?? null);
  renderHeroActions(remote);
  renderAbout(remote?.about ?? null);
  renderStats(bundle?.chapter ?? null, bundle?.badges ?? []);
  renderEvents(bundle?.events ?? [], remote?.tagline ?? null);
  renderLeaderboard(bundle?.leaderboard ?? []);
  renderBadges(bundle?.badges ?? []);
  renderMerch(bundle?.merch ?? []);
  renderProjects(bundle?.projects ?? []);
  renderOfficers(remote?.officers ?? []);
  renderSocials(remote?.social_links ?? {});
  renderHeroNetwork();

  // Learning tree iframes the content repo's tree page — fire-and-
  // forget since the iframe handles its own load / timeout states.
  loadLearningTree();

  // Wire the multi-page tabs AFTER all sections have rendered — so
  // pagesWithContent() sees the final DOM + data state and can hide
  // tabs whose sections are all empty/toggled-off.
  wirePageRouting(pagesWithContent(sectionsToApply));

  // Preview + edit mode → attach clickable "Edit here" pills to every
  // section that maps to a dashboard route. Dashboard parent listens
  // for postMessage and navigates.
  if (editMode) enableEditOverlays();
}

init();
