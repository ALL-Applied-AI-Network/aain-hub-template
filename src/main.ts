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
  { key: "home", label: "Home", sections: ["hero", "about", "events", "leaderboard"] },
  { key: "learn", label: "Learn", sections: ["learning_tree", "workshops"] },
  { key: "projects", label: "Projects", sections: ["playbooks"] },
  { key: "team", label: "Team", sections: ["officers", "badges"] },
  { key: "merch", label: "Merch", sections: ["merch"] },
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

interface LeaderboardRow {
  name: string;
  points: number;
  events_attended: number;
  rank: number;
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

interface ChapterBundle {
  chapter: { slug: string; name: string; university: string; member_count: number; event_count: number };
  config: RemoteConfig;
  events: EventRow[];
  leaderboard: LeaderboardRow[];
  badges: BadgeRow[];
  merch: MerchRow[];
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
            <div class="podium-card__xp">
              <span class="podium-card__xp-num">${r.points.toLocaleString()}</span>
              <span class="podium-card__xp-unit">XP</span>
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
              <div class="leaderboard-row__name">${escapeHtml(r.name)}</div>
              <div class="leaderboard-row__bar" aria-hidden="true">
                <div class="leaderboard-row__bar-fill" style="width:${pctOfMax}%"></div>
              </div>
              <div class="leaderboard-row__meta">${r.events_attended} events</div>
            </div>
            <div class="leaderboard-row__points">
              ${r.points.toLocaleString()}<span class="leaderboard-row__points-unit">XP</span>
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

async function loadLearningTree() {
  const grid = document.getElementById("learning-grid");
  if (!grid) return;

  // When no content library is configured, bail before firing the
  // fetch — the grid was stuck on "Loading curriculum…" forever,
  // which read as broken.
  if (!config.content_url) {
    renderGridEmpty(
      "learning-grid",
      "Curriculum will appear here",
      "Once the ALL Applied AI Network content library is wired to this site, the learning tree loads from the CDN automatically.",
    );
    return;
  }

  const tree = await fetchJSON<TreeData>(`${config.content_url}/tree.json`);
  const treeLink = document.getElementById("tree-link") as HTMLAnchorElement | null;
  if (treeLink) treeLink.href = `${config.content_url}/tree.html`;

  if (!tree) {
    renderGridEmpty(
      "learning-grid",
      "Couldn't reach the content library",
      "Try refreshing, or visit the full curriculum above.",
    );
    return;
  }

  // Render ALL layers, not just layer 0 — the previous grid was
  // flattening a legitimate tree into a row of top-level links.
  // Now we tier them: layer 0 = Foundations, 1 = Intermediate,
  // 2 = Advanced, 3+ = Specialized. Each tier is a horizontal row
  // with a label on the left so the progression reads visually.
  const nodes = tree.nodes.filter((n) => !isPathExcluded(n.content_path));
  if (!nodes.length && getLocalContentForSection("learning").length === 0) {
    renderGridEmpty(
      "learning-grid",
      "No learning content yet",
      "The network's curriculum loads here as content is published to aain-content.",
    );
    return;
  }

  const byLayer = new Map<number, TreeNode[]>();
  for (const n of nodes) {
    const arr = byLayer.get(n.layer) ?? [];
    arr.push(n);
    byLayer.set(n.layer, arr);
  }
  for (const arr of byLayer.values()) {
    applyCustomOrder(arr);
    if (!config.content?.custom_order?.length) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    }
  }

  const tierLabels: Record<number, string> = {
    0: "Foundations",
    1: "Intermediate",
    2: "Advanced",
    3: "Specialized",
    4: "Specialized",
  };

  // Build the tiered tree. Local-content entries live in a small
  // "From your chapter" strip above the network tiers so they're
  // clearly yours, not the network's.
  const sortedLayers = Array.from(byLayer.keys()).sort((a, b) => a - b);
  const localNodes = getLocalContentForSection("learning");

  let html = '<div class="learning-tree">';

  if (localNodes.length) {
    html += `
      <div class="learning-tier learning-tier--local">
        <div class="learning-tier__label">
          <span class="learning-tier__layer">Chapter</span>
          <span class="learning-tier__name">From your club</span>
        </div>
        <div class="learning-tier__nodes">
          ${localNodes
            .map((lc) =>
              renderLearningNode({
                title: lc.title,
                description: lc.description,
                path: lc.path,
                isLocal: true,
                thumbnail: lc.thumbnail,
              }),
            )
            .join("")}
        </div>
      </div>
    `;
  }

  for (const layer of sortedLayers) {
    const tierNodes = byLayer.get(layer) ?? [];
    if (!tierNodes.length) continue;
    const label = tierLabels[layer] ?? `Layer ${layer}`;
    html += `
      <div class="learning-tier">
        <div class="learning-tier__label">
          <span class="learning-tier__layer">Layer ${layer}</span>
          <span class="learning-tier__name">${escapeHtml(label)}</span>
        </div>
        <div class="learning-tier__nodes">
          ${tierNodes
            .map((n) =>
              renderLearningNode({
                title: n.title,
                description: n.description,
                path: n.content_path,
                difficulty: n.difficulty,
                estimated_minutes: n.estimated_minutes,
                thumbnail: n.thumbnail,
              }),
            )
            .join("")}
        </div>
      </div>
    `;
  }

  html += "</div>";
  grid.innerHTML = html;
  // The outer wrapper is a grid — the tree needs to span its full
  // column so layer rows can use their own horizontal layout.
  grid.classList.add("content-grid--tree");
}

/** Compact card for a single learning-tree node — visually smaller
 *  than the big workshop/playbook cards so a long row of nodes
 *  reads as a tier. */
function renderLearningNode(entry: {
  title: string;
  description?: string;
  path?: string;
  difficulty?: string;
  estimated_minutes?: number;
  isLocal?: boolean;
  thumbnail?: string;
}): string {
  const local = entry.isLocal || (entry.path && isLocalPath(entry.path));
  const href = entry.path
    ? local
      ? `./article.html?local=${encodeURIComponent(entry.path)}`
      : `./article.html?path=${encodeURIComponent(entry.path)}`
    : "#";

  const difficultyDot = entry.difficulty
    ? `<span class="learning-node__dot learning-node__dot--${escapeAttr(entry.difficulty)}" aria-label="${escapeAttr(entry.difficulty)}"></span>`
    : "";
  const time = entry.estimated_minutes
    ? `<span class="learning-node__time">${entry.estimated_minutes} min</span>`
    : "";

  return `
    <a href="${escapeAttr(href)}" class="learning-node${local ? " learning-node--local" : ""}">
      <div class="learning-node__head">
        ${difficultyDot}
        <h3 class="learning-node__title">${escapeHtml(entry.title)}</h3>
      </div>
      ${
        entry.description
          ? `<p class="learning-node__desc">${escapeHtml(entry.description)}</p>`
          : ""
      }
      ${time ? `<div class="learning-node__meta">${time}</div>` : ""}
    </a>
  `;
}

async function loadManifestSection(
  type: "workshop" | "playbook",
  gridId: string,
) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!config.content_url) {
    renderGridEmpty(
      gridId,
      `${type === "workshop" ? "Workshops" : "Playbooks"} will appear here`,
      `Content library isn't connected yet. Once wired, ${type}s load from the CDN automatically.`,
    );
    return;
  }

  const manifest = await fetchJSON<Manifest>(`${config.content_url}/manifest.json`);
  if (!manifest) {
    renderGridEmpty(
      gridId,
      "Couldn't reach the content library",
      "Try refreshing in a moment.",
    );
    return;
  }

  const items = manifest.content
    .filter((c) => c.type === type)
    .filter((c) => !isPathExcluded(c.path));
  const remoteCards = items.map((it) => renderCard(it));
  const sectionKey = type === "workshop" ? "workshops" : "playbooks";
  const localCards = getLocalContentForSection(sectionKey).map((lc) =>
    renderCard({
      title: lc.title,
      description: lc.description,
      thumbnail: lc.thumbnail,
      path: lc.path,
      isLocal: true,
    }),
  );
  const all = [...localCards, ...remoteCards];

  grid.innerHTML = all.length
    ? all.join("")
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__title">No ${type}s yet</div></div>`;
}

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
    title: "Learn",
    desc: "From absolute zero to shipping AI products. Pick a tier below and start anywhere.",
  },
  projects: {
    kicker: "How to run it",
    title: "Projects",
    desc: "Playbooks for hackathons, innovation labs, research groups, and everything in between.",
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
  renderOfficers(remote?.officers ?? []);
  renderSocials(remote?.social_links ?? {});

  // CDN content loads regardless — the section toggles above already
  // removed any section the dashboard turned off.
  await Promise.all([
    loadLearningTree(),
    loadManifestSection("workshop", "workshops-grid"),
    loadManifestSection("playbook", "playbooks-grid"),
  ]);

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
