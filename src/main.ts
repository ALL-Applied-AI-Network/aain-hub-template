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
  // sections[] only lists *data-driven* sections — the ones that can
  // be toggled off or hidden when their data array is empty. Pillars
  // and per-page CTA bands aren't here because they're hardcoded
  // decorations and don't influence whether a page is "empty."
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
  // Pillars + per-page CTA bands intentionally aren't here — they're
  // hardcoded decorations without data-section, so the click-to-edit
  // overlay never finds them and there's nothing for the eboard to
  // tweak per-section in the dashboard.
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
  cta_tertiary_label: string | null;
  cta_tertiary_href: string | null;
  officers: Officer[];
  social_links: Record<string, string>;
  updated_at: string | null;
}

interface EventRow {
  id: string;
  title: string;
  /** Markdown — small subset (bold/italic/links/bullets) rendered
   *  via renderInlineMarkdown. Hub site mirrors what the dashboard
   *  preview shows. */
  description: string | null;
  type: string;
  /** Start. Required. */
  date: string;
  /** Optional end timestamp for multi-day events. NULL = single-
   *  point event (the legacy case). */
  end_date: string | null;
  /** Free-text address. Hub site auto-links to a Google Maps search
   *  so visitors can pull it up on their phone. */
  location: string | null;
  /** Optional join URL for virtual / hybrid events (Zoom, Meet, …). */
  virtual_url: string | null;
  /** Format toggle: in_person | virtual | hybrid. Drives which
   *  pills render (map link vs. "Join virtually"). NULL falls
   *  through to in_person semantics. */
  format: "in_person" | "virtual" | "hybrid" | null;
  /** Cover photo URL. NULL = no header image. */
  image_url: string | null;
  points_attend: number;
  points_win: number | null;
  /** Wave 3b — points at an umbrella event. NULL = standalone. */
  parent_event_id: string | null;
  /** Wave 3c — viewer chapter's role on this event:
   *  "host"    = chapter created the event
   *  "co_host" = chapter accepted a co-host invitation; render with
   *              host attribution so visitors know who's running it.
   *  Older bundles may not include this — treat absent as host. */
  my_role?: "host" | "co_host";
  /** Wave 3c — the chapter that created the event. Renders next to
   *  the title on co-hosted events ("hosted by MSOE AI Club") so
   *  attribution is clear when more than one chapter is involved. */
  host_chapter?: { id: string; name: string; slug: string } | null;
  /** Wave 4a — phases inside this event (multi-phase projects).
   *  When present + non-empty, the card renders a phase timeline
   *  under the description so members see all checkpoints at once
   *  instead of trying to piece together separate event cards. */
  phases?: EventPhase[];
}

interface EventPhase {
  id: string;
  name: string;
  description: string | null;
  date_start: string;
  date_end: string | null;
  format: "in_person" | "virtual" | "hybrid" | "milestone";
  location: string | null;
  virtual_url: string | null;
  has_check_in: boolean;
  points_attend: number;
  ordering: number;
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

interface ProjectFileRow {
  id: string;
  kind: "paper" | "slides" | "video" | "image" | "link" | "other";
  title: string;
  url: string;
  file_size: number | null;
  mime_type: string | null;
}

interface ProjectLinkedEvent {
  id: string;
  title: string;
  date: string | null;
  end_date: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  year: string | null;
  event_id?: string | null;
  event?: ProjectLinkedEvent | null;
  files?: ProjectFileRow[];
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

/**
 * Hero CTAs — three persona-targeted buttons so the landing page
 * speaks to every audience at once without burying them in nav clicks:
 *   1. Primary   → prospective members ("Join our next event")
 *   2. Secondary → partners/sponsors ("Become a partner")
 *   3. Tertiary  → curious learners ("Start learning")
 *
 * Each slot accepts a chapter-authored label+href from the dashboard;
 * when blank, falls back to a sensible default that anchors into the
 * relevant section so a freshly deployed site still feels complete.
 */
function renderHeroActions(remote: RemoteConfig | null) {
  const container = document.getElementById("hero-actions");
  if (!container) return;
  container.innerHTML = "";

  type HeroCta = {
    label: string;
    href: string;
    style: "primary" | "ghost" | "ghost-accent";
  };

  // Each slot falls back to its persona default when the eboard
  // hasn't filled it in, so every fresh chapter site ships with
  // three distinct audience CTAs from day one. Label overrides keep
  // the eboard's voice; href overrides route to their Discord / merch
  // / Typeform / whatever.
  const pick = (
    label: string | null | undefined,
    href: string | null | undefined,
    fallbackLabel: string,
    fallbackHref: string,
    style: HeroCta["style"],
  ): HeroCta => {
    const l = label?.trim();
    const h = href?.trim();
    return {
      label: l && l.length > 0 ? l : fallbackLabel,
      href: h && h.length > 0 ? h : fallbackHref,
      style,
    };
  };

  const eventsAnchor = document.getElementById("events") ? "#events" : "#home";
  // Partner CTA defaults to #sponsor (in-site modal posted to the
  // dashboard inbox), since every network-connected chapter gets
  // persistent inquiry storage "for free" — surviving eboard
  // turnover, unlike a per-officer mailto. Eboards who prefer a
  // raw mailto can override via Customize → Hero CTAs.
  const buttons: HeroCta[] = [
    // 1 — prospective members
    pick(
      remote?.cta_primary_label,
      remote?.cta_primary_href,
      "Join our next event",
      eventsAnchor,
      "primary",
    ),
    // 2 — partners / sponsors
    pick(
      remote?.cta_secondary_label,
      remote?.cta_secondary_href,
      "Become a partner",
      "#sponsor",
      "ghost",
    ),
    // 3 — curious learners
    pick(
      remote?.cta_tertiary_label,
      remote?.cta_tertiary_href,
      "Start learning",
      "#learn",
      "ghost-accent",
    ),
  ];

  for (const b of buttons) {
    const a = document.createElement("a");
    const styleClass =
      b.style === "primary"
        ? "btn--primary"
        : b.style === "ghost-accent"
          ? "btn--ghost btn--ghost-accent"
          : "btn--ghost";
    a.className = `btn ${styleClass}`;
    a.href = b.href;
    // Only true externals open in a new tab — anchor + mailto + tel
    // stay in the current window.
    if (/^https?:\/\//.test(b.href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.textContent = b.label;
    container.appendChild(a);
  }
}

/* ──────────────────────────────────────────────────────────────────
   "What we do" pillars — four-up explainer that answers "what is
   this organization, actually?" for anyone landing on the home page
   cold. Lives between the hero stat strip and the events grid so
   visitors always have the gist before they start scanning events or
   the leaderboard. Content is hardcoded on the template today — the
   next iteration makes this dashboard-editable alongside the About
   markdown, but every chapter says the same four things so the
   defaults carry real weight.
   ────────────────────────────────────────────────────────────────── */

interface Pillar {
  title: string;
  desc: string;
  href: string;
  icon: string;
}

const PILLARS: Pillar[] = [
  {
    title: "Weekly events",
    desc: "Workshops, speaker nights, and build sessions — hands-on applied-AI every week, open to any student.",
    href: "#events",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  },
  {
    title: "Ship real projects",
    desc: "Innovation Labs cohorts, hackathon teams, and research collabs. Members graduate with a portfolio of shipped work.",
    href: "#projects",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  },
  {
    title: "Open curriculum",
    desc: "A full applied-AI skill map, free forever. Follow the learning tree from zero to shipping production AI.",
    href: "#learn",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  },
  {
    title: "Recognition built in",
    desc: "Every event check-in, project, and award earns points — redeem for merch, unlock badges, climb the leaderboard.",
    href: "#badges",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>`,
  },
];

function renderPillars() {
  const grid = document.getElementById("pillars-grid");
  if (!grid) return;
  grid.innerHTML = PILLARS.map(
    (p) => `
      <a class="pillar-card" href="${escapeAttr(p.href)}">
        <div class="pillar-card__icon" aria-hidden="true">${p.icon}</div>
        <div class="pillar-card__title">${escapeHtml(p.title)}</div>
        <p class="pillar-card__desc">${escapeHtml(p.desc)}</p>
      </a>
    `,
  ).join("");
}

/* ──────────────────────────────────────────────────────────────────
   Per-page CTA bands — at the bottom of each non-home tab, give
   visitors a clear next step. Projects visitors hear "how to
   participate"; Team visitors hear "how to reach us / join the
   eboard"; Learn visitors hear "attend an event to go deeper";
   Merch visitors hear "earn points to redeem."
   ────────────────────────────────────────────────────────────────── */

interface PageCtaBandCopy {
  kicker: string;
  title: string;
  desc: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const PAGE_CTA_BANDS: Record<string, PageCtaBandCopy> = {
  projects: {
    kicker: "Build with us",
    title: "Want to ship a project with the chapter?",
    desc: "Members pitch ideas every semester and team up into Innovation Labs cohorts. Show up to a meeting, propose a project, recruit collaborators — eboard helps you scope it end-to-end.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Meet the eboard", href: "#team" },
  },
  team: {
    kicker: "Get in touch",
    title: "Running something? Reach out.",
    desc: "Sponsoring events, guest-speaking, recruiting our members, or joining the eboard — we reply fast. The whole eboard is a student team, and we love outside-of-class opportunities to build together.",
    primary: { label: "Become a partner", href: "#sponsor" },
    secondary: { label: "See our projects", href: "#projects" },
  },
  learn: {
    kicker: "Go deeper",
    title: "Pair the curriculum with a weekly build session.",
    desc: "The tree covers the theory; our workshops and speaker nights cover the applied side. Come to one, no prior experience needed — every track starts from zero.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Check the leaderboard", href: "#home" },
  },
  merch: {
    kicker: "Earn & redeem",
    title: "Merch is earned, not bought.",
    desc: "Every event check-in, shipped project, and recognition earns points you can spend here. See any eboard member at a meeting to redeem — no online checkout, no shipping, all in-person.",
    primary: { label: "See upcoming events", href: "#events" },
    secondary: { label: "Leaderboard", href: "#home" },
  },
};

function renderPageCtaBands() {
  for (const [pageKey, copy] of Object.entries(PAGE_CTA_BANDS)) {
    const band = document.querySelector<HTMLElement>(
      `.page-cta-band[data-page="${pageKey}"]`,
    );
    if (!band) continue;
    const secondaryHtml = copy.secondary
      ? `<a class="btn btn--ghost" href="${escapeAttr(copy.secondary.href)}">${escapeHtml(copy.secondary.label)}</a>`
      : "";
    band.innerHTML = `
      <div class="page-cta-band__inner">
        <div class="page-cta-band__copy">
          <div class="page-cta-band__kicker">${escapeHtml(copy.kicker)}</div>
          <h2 class="page-cta-band__title">${escapeHtml(copy.title)}</h2>
          <p class="page-cta-band__desc">${escapeHtml(copy.desc)}</p>
        </div>
        <div class="page-cta-band__actions">
          <a class="btn btn--primary" href="${escapeAttr(copy.primary.href)}">${escapeHtml(copy.primary.label)}</a>
          ${secondaryHtml}
        </div>
      </div>
    `;
  }
}

/* ──────────────────────────────────────────────────────────────────
   Sponsor inquiry modal — triggered by the `#sponsor` hash route,
   which is the default href for the hero's partner CTA. Posts to
   the dashboard's public sponsor endpoint so inquiries land in the
   chapter's Inbox tab instead of a disappearing mailto thread.

   Why network-hosted instead of mailto: eboard leadership turns over
   every year or two, and any email history tied to a graduating
   officer's inbox leaves with them. A network-hosted inbox persists
   across that turnover so the next eboard inherits the full history.

   Falls back to an alert if no slug is resolvable (e.g., a fork of
   the template deployed without linking to the dashboard). No silent
   swallow — better for a visitor to see "couldn't send, email us at
   …" than to click and get nothing.
   ────────────────────────────────────────────────────────────────── */

let sponsorModalState: {
  slug: string;
  chapterName: string;
  fallbackEmail: string | null;
} | null = null;

function setupSponsorModal(
  slug: string | null,
  chapterName: string,
  remote: RemoteConfig | null,
) {
  // Remove any previous modal DOM so preview-mode hot swaps don't
  // leave stacked modals in the tree.
  document.getElementById("sponsor-modal-root")?.remove();

  if (!slug) {
    sponsorModalState = null;
    return;
  }
  sponsorModalState = {
    slug,
    chapterName,
    fallbackEmail: remote?.social_links?.email ?? null,
  };

  const root = document.createElement("div");
  root.id = "sponsor-modal-root";
  root.className = "sponsor-modal-root";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "sponsor-modal-title");
  root.innerHTML = `
    <div class="sponsor-modal__backdrop" data-close="true" aria-hidden="true"></div>
    <div class="sponsor-modal__panel" role="document">
      <button
        type="button"
        class="sponsor-modal__close"
        aria-label="Close"
        data-close="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="sponsor-modal__head">
        <div class="sponsor-modal__kicker">Partnership inquiry</div>
        <h2 class="sponsor-modal__title" id="sponsor-modal-title">
          Work with ${escapeHtml(chapterName)}
        </h2>
        <p class="sponsor-modal__desc">
          Sponsor an event, bring a speaker, recruit our members, or propose
          something else. Your note lands directly in the eboard's inbox —
          they'll get back within a few days.
        </p>
      </div>
      <form class="sponsor-modal__form" novalidate>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-name">Your name *</label>
          <input class="sponsor-field__input" id="sponsor-name" name="name" type="text" required maxlength="200" autocomplete="name" />
        </div>
        <div class="sponsor-field sponsor-field--row">
          <div class="sponsor-field__col">
            <label class="sponsor-field__label" for="sponsor-email">Email *</label>
            <input class="sponsor-field__input" id="sponsor-email" name="email" type="email" required maxlength="320" autocomplete="email" />
          </div>
          <div class="sponsor-field__col">
            <label class="sponsor-field__label" for="sponsor-company">Company / organization</label>
            <input class="sponsor-field__input" id="sponsor-company" name="company" type="text" maxlength="200" autocomplete="organization" />
          </div>
        </div>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-phone">Phone (optional)</label>
          <input class="sponsor-field__input" id="sponsor-phone" name="phone" type="tel" maxlength="50" autocomplete="tel" placeholder="Optional — easier than email if it's time-sensitive" />
        </div>
        <div class="sponsor-field">
          <label class="sponsor-field__label" for="sponsor-message">Message *</label>
          <textarea class="sponsor-field__input sponsor-field__textarea" id="sponsor-message" name="message" required minlength="10" maxlength="5000" rows="5" placeholder="What would you like to partner on? The more detail, the faster we can reply."></textarea>
        </div>
        <!-- Honeypot — display:none on the CSS side, real users never touch
             this, bots that auto-fill every field will. Server drops any
             submission with content here. -->
        <div class="sponsor-field__honeypot" aria-hidden="true">
          <label>Website <input name="website" type="text" tabindex="-1" autocomplete="off" /></label>
        </div>
        <div class="sponsor-modal__status" role="status" aria-live="polite"></div>
        <div class="sponsor-modal__actions">
          <button type="button" class="btn btn--ghost" data-close="true">Cancel</button>
          <button type="submit" class="btn btn--primary sponsor-modal__submit">
            <span class="sponsor-modal__submit-label">Send inquiry</span>
          </button>
        </div>
      </form>
      <div class="sponsor-modal__success" hidden>
        <div class="sponsor-modal__success-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 class="sponsor-modal__success-title">Got it — thanks for reaching out.</h3>
        <p class="sponsor-modal__success-desc">
          The eboard has your note and typically replies within a few days.
          If anything's urgent, feel free to email us directly.
        </p>
        <button type="button" class="btn btn--primary" data-close="true">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const form = root.querySelector("form") as HTMLFormElement;
  const statusEl = root.querySelector(".sponsor-modal__status") as HTMLElement;
  const successEl = root.querySelector(".sponsor-modal__success") as HTMLElement;
  const submitBtn = root.querySelector(".sponsor-modal__submit") as HTMLButtonElement;
  const submitLabel = root.querySelector(".sponsor-modal__submit-label") as HTMLElement;

  // Close handlers — delegate through the root so each [data-close]
  // element (backdrop + X button + Cancel + success Close) wires up
  // with one listener.
  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-close]")) closeSponsorModal();
  });

  // Esc to close, focus-trap-lite within the modal while open.
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSponsorModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.classList.remove("sponsor-modal__status--error");

    const fd = new FormData(form);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      company: String(fd.get("company") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim() || null,
      message: String(fd.get("message") ?? "").trim(),
      website: String(fd.get("website") ?? ""),
    };

    if (!body.name || !body.email || !body.message) {
      statusEl.textContent = "Please fill in the required fields.";
      statusEl.classList.add("sponsor-modal__status--error");
      return;
    }
    if (body.message.length < 10) {
      statusEl.textContent = "Add a bit more detail — 10 characters minimum.";
      statusEl.classList.add("sponsor-modal__status--error");
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = "Sending…";
    try {
      const res = await fetch(
        `${DASHBOARD_ORIGIN}/api/public/sponsor/${encodeURIComponent(slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        statusEl.textContent =
          (data && typeof data.error === "string" && data.error) ||
          "Couldn't send — please try again.";
        statusEl.classList.add("sponsor-modal__status--error");
        submitBtn.disabled = false;
        submitLabel.textContent = "Send inquiry";
        return;
      }
      // Swap to success state. Keep the modal open so the visitor
      // reads the confirmation rather than a flash that vanishes.
      form.hidden = true;
      successEl.hidden = false;
    } catch {
      statusEl.textContent =
        "Network error — please try again, or email the eboard directly.";
      statusEl.classList.add("sponsor-modal__status--error");
      submitBtn.disabled = false;
      submitLabel.textContent = "Send inquiry";
    }
  });
}

function openSponsorModal() {
  const root = document.getElementById("sponsor-modal-root");
  if (!root || !sponsorModalState) {
    // No modal available — fall back to mailto if the chapter has one
    // configured, else quietly surface the #team page where the
    // eboard emails live.
    const email = sponsorModalState?.fallbackEmail;
    if (email) {
      window.location.href = `mailto:${email}?subject=Partnership inquiry`;
    } else {
      window.location.hash = "#team";
    }
    return;
  }
  root.hidden = false;
  document.body.classList.add("sponsor-modal-open");
  const nameInput = root.querySelector("#sponsor-name") as HTMLInputElement | null;
  // Defer focus so it fires after the browser paints the modal.
  setTimeout(() => nameInput?.focus(), 30);
}

function closeSponsorModal() {
  const root = document.getElementById("sponsor-modal-root");
  if (!root) return;
  root.hidden = true;
  document.body.classList.remove("sponsor-modal-open");
  // Reset form state so a second open starts fresh. Preserves the
  // content the user typed only if the submit failed — but once
  // they've closed the modal, assume they're starting over.
  const form = root.querySelector("form") as HTMLFormElement | null;
  const success = root.querySelector(".sponsor-modal__success") as HTMLElement | null;
  const status = root.querySelector(".sponsor-modal__status") as HTMLElement | null;
  const submitBtn = root.querySelector(".sponsor-modal__submit") as HTMLButtonElement | null;
  const submitLabel = root.querySelector(".sponsor-modal__submit-label") as HTMLElement | null;
  if (form && success && success.hidden === false) {
    form.reset();
    form.hidden = false;
    success.hidden = true;
  }
  if (status) {
    status.textContent = "";
    status.classList.remove("sponsor-modal__status--error");
  }
  if (submitBtn && submitLabel) {
    submitBtn.disabled = false;
    submitLabel.textContent = "Send inquiry";
  }

  // Clear the hash so re-triggering the CTA re-opens, not no-ops.
  if (window.location.hash === "#sponsor") {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

function wireSponsorHashRoute() {
  function maybeOpen() {
    if (window.location.hash === "#sponsor") openSponsorModal();
  }
  window.addEventListener("hashchange", maybeOpen);
  // Also fire on initial load so a deep link to #sponsor opens the modal.
  maybeOpen();
}

function renderStats(
  chapter: ChapterBundle["chapter"] | null,
  projects: ProjectRow[],
) {
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
  // Members / events / projects is the "how big is this chapter"
  // trio a prospective member or partner cares about — swapped in
  // from badges (which told visitors about the recognition system,
  // but not the scale of the chapter). Badges are still their own
  // full section below the leaderboard.
  const map: Record<string, string> = {
    members: formatCount(chapter.member_count),
    events: formatCount(chapter.event_count),
    projects: formatCount(projects.length),
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
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\n/g, "<br />");
}

/**
 * Richer markdown for places that get fuller content (event
 * descriptions). Mirrors the renderer used in the dashboard's
 * Create Event preview pane so eboards see exactly what the hub
 * site will show. Supported: paragraphs (blank-line splits),
 * `**bold**`, `_italic_` / `*italic*`, `[link](https://…)`, and
 * `- ` / `* ` bullet lists. Escapes HTML before processing.
 */
function renderRichMarkdown(src: string): string {
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const inline = (s: string): string =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );
  const lines = escaped.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line.length === 0) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
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

/**
 * Render the events grid. Each card now reflects every field the
 * dashboard captures — cover image, date range for multi-day,
 * location with auto-Maps link, format chip + virtual join button
 * for hybrid / virtual, co-host attribution when this site is
 * surfacing another chapter's event, and a "Part of <Umbrella>"
 * badge for child events whose parent shipped in the same bundle.
 *
 * Description renders through the same markdown subset the About
 * section uses — bold / italic / links / bullets — so what the
 * eboard sees in the create-form preview matches what visitors see.
 */
function renderEvents(events: EventRow[], _tagline: string | null | undefined) {
  const grid = document.getElementById("events-grid");
  if (!grid) return;
  if (!events.length) {
    hideSection("events");
    return;
  }

  // Build a parent lookup so child events can label "Part of X."
  // Falls back to nothing if the parent isn't in the same window
  // (e.g. last week's umbrella, this week's child).
  const byId = new Map<string, EventRow>();
  for (const ev of events) byId.set(ev.id, ev);

  grid.innerHTML = events.map((e) => renderEventCard(e, byId)).join("");
}

function renderEventCard(
  e: EventRow,
  byId: Map<string, EventRow>,
): string {
  const start = new Date(e.date);
  const end = e.end_date ? new Date(e.end_date) : null;
  const isMultiDay =
    end !== null &&
    Number.isFinite(end.getTime()) &&
    (end.getFullYear() !== start.getFullYear() ||
      end.getMonth() !== start.getMonth() ||
      end.getDate() !== start.getDate());

  const month = start
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const day = start.getDate();
  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end
    ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;
  const endLabel = end
    ? end.toLocaleDateString("en-US", {
        month:
          end.getMonth() === start.getMonth() ? undefined : "short",
        day: "numeric",
      })
    : null;

  // Date chip on the left — adds a "→ N" range stripe for multi-day.
  const dateChip = `
    <div class="event-card__date${isMultiDay ? " event-card__date--range" : ""}" aria-label="${month} ${day}${endLabel ? ` to ${endLabel}` : ""}">
      <div class="event-card__date-month">${month}</div>
      <div class="event-card__date-day">${day}</div>
      ${
        isMultiDay && endLabel
          ? `<div class="event-card__date-range">→ ${escapeHtml(endLabel)}</div>`
          : ""
      }
    </div>
  `;

  // Description renders through the richer paragraphs+bullets
  // markdown pass so what the dashboard preview shows matches what
  // visitors see (the create form's toolbar inserts `- ` lists and
  // blank-line paragraph splits).
  const desc = e.description
    ? `<div class="event-card__desc">${renderRichMarkdown(e.description)}</div>`
    : "";

  // Format → which pills render. in_person + (default) → just map.
  // virtual → just join. hybrid → both stacked.
  const fmt = e.format ?? "in_person";
  const showLocation =
    (fmt === "in_person" || fmt === "hybrid") &&
    e.location &&
    e.location.trim().length > 0;
  const showVirtual =
    (fmt === "virtual" || fmt === "hybrid") &&
    e.virtual_url &&
    e.virtual_url.trim().length > 0;

  const formatChip =
    fmt === "virtual" || fmt === "hybrid"
      ? `<span class="event-card__format-chip event-card__format-chip--${fmt}">${
          fmt === "virtual" ? "Virtual" : "Hybrid"
        }</span>`
      : "";

  const locationPill = showLocation
    ? `<a class="event-card__pill event-card__pill--map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location ?? "")}" target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>${escapeHtml(e.location ?? "")}</span>
      </a>`
    : "";

  const virtualPill = showVirtual
    ? `<a class="event-card__pill event-card__pill--virtual" href="${escapeAttr(e.virtual_url ?? "")}" target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        <span>Join virtually</span>
      </a>`
    : "";

  // Co-host attribution: when this hub is surfacing another chapter's
  // event, credit the host so visitors know who organized it.
  const cohostBadge =
    e.my_role === "co_host" && e.host_chapter
      ? `<div class="event-card__cohost">Hosted by <strong>${escapeHtml(e.host_chapter.name)}</strong></div>`
      : "";

  // Parent badge: "Part of <Umbrella>" — only if the parent is in
  // the same bundle (same window). Otherwise quietly omit.
  const parent = e.parent_event_id ? byId.get(e.parent_event_id) : null;
  const parentBadge = parent
    ? `<div class="event-card__parent">Part of <strong>${escapeHtml(parent.title)}</strong></div>`
    : "";

  // Cover image up top when set. 16:9 aspect ratio matches the
  // dashboard preview and most marketing photos.
  const cover = e.image_url
    ? `<div class="event-card__cover"><img src="${escapeAttr(e.image_url)}" alt="" loading="lazy" /></div>`
    : "";

  // Meta line: time + points (or "no points" when QR was off, which
  // we infer client-side from points_attend === 0; the bundle never
  // surfaces QR-disabled events with points anyway).
  const timeLabel =
    isMultiDay && endTime ? `${startTime} → ${endTime}` : startTime;
  const meta = `${timeLabel} · ${e.points_attend} ${e.points_attend === 1 ? "pt" : "pts"}`;

  // Phase timeline — when the event has phases (kickoff → midpoint →
  // finals → due-date), render them as a numbered checkpoint list
  // under the description. Each row carries its own format chip and
  // a short relative date so members can see the whole arc at once.
  // Sorted by the bundle endpoint (ordering, then date_start), so we
  // just render in order.
  const phases = (e.phases ?? []).slice();
  const phaseTimeline = phases.length
    ? `<div class="event-card__phases" aria-label="Event phases">
        <div class="event-card__phases-heading">${phases.length}-part project</div>
        <ol class="event-card__phase-list">
          ${phases.map((p, i) => renderPhaseRow(p, i + 1)).join("")}
        </ol>
      </div>`
    : "";

  return `
    <article class="event-card${cover ? " event-card--with-cover" : ""}" role="listitem">
      ${cover}
      <div class="event-card__inner">
        ${dateChip}
        <div class="event-card__body">
          <div class="event-card__type-row">
            <span class="event-card__type">${escapeHtml(e.type ?? "event")}</span>
            ${formatChip}
          </div>
          ${parentBadge}
          <h3 class="event-card__title">${escapeHtml(e.title)}</h3>
          ${cohostBadge}
          ${desc}
          ${phaseTimeline}
          ${locationPill || virtualPill ? `<div class="event-card__pills">${locationPill}${virtualPill}</div>` : ""}
          <div class="event-card__meta">${meta}</div>
        </div>
      </div>
    </article>
  `;
}

/** Render a single phase row inside the event-card phase timeline.
 *  Format milestone → no chip, just the "Milestone" pill (no
 *  check-in expected). in_person / virtual / hybrid → coloured chip
 *  + location or "Virtual" hint, matching how the parent event card
 *  surfaces format. Points are only shown when has_check_in (otherwise
 *  the row is a checkpoint without attendance). */
function renderPhaseRow(p: EventPhase, num: number): string {
  const start = new Date(p.date_start);
  const end = p.date_end ? new Date(p.date_end) : null;
  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDayEnd =
    end !== null &&
    end.getFullYear() === start.getFullYear() &&
    end.getMonth() === start.getMonth() &&
    end.getDate() === start.getDate();
  const endStr = end
    ? sameDayEnd
      ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : end.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const whenLabel = endStr
    ? sameDayEnd
      ? `${startStr} · ${startTime} → ${endStr}`
      : `${startStr} → ${endStr}`
    : `${startStr} · ${startTime}`;

  const formatLabel =
    p.format === "in_person"
      ? "In person"
      : p.format === "virtual"
        ? "Virtual"
        : p.format === "hybrid"
          ? "Hybrid"
          : "Milestone";
  const formatChip = `<span class="event-card__phase-chip event-card__phase-chip--${p.format}">${formatLabel}</span>`;

  const locText =
    (p.format === "in_person" || p.format === "hybrid") &&
    p.location &&
    p.location.trim().length > 0
      ? `<span class="event-card__phase-loc">${escapeHtml(p.location)}</span>`
      : "";

  const pointsText =
    p.has_check_in && p.points_attend > 0
      ? `<span class="event-card__phase-points">+${p.points_attend} ${p.points_attend === 1 ? "pt" : "pts"}</span>`
      : "";

  const descBlock = p.description
    ? `<div class="event-card__phase-desc">${escapeHtml(p.description)}</div>`
    : "";

  return `
    <li class="event-card__phase-row event-card__phase-row--${p.format}">
      <div class="event-card__phase-num" aria-hidden="true">${num}</div>
      <div class="event-card__phase-body">
        <div class="event-card__phase-head">
          <span class="event-card__phase-name">${escapeHtml(p.name)}</span>
          ${formatChip}
          ${pointsText}
        </div>
        <div class="event-card__phase-when">${escapeHtml(whenLabel)}${locText ? " · " : ""}${locText}</div>
        ${descBlock}
      </div>
    </li>
  `;
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

  const calendarIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;

  // Inline kind icons — small enough to read in a list, distinct
  // enough that "paper" and "slides" don't blur together at a glance.
  function fileKindIcon(kind: ProjectFileRow["kind"]): string {
    switch (kind) {
      case "paper":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`;
      case "slides":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" ry="2"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="12" y1="18" x2="12" y2="22"/></svg>`;
      case "video":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
      case "image":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
      case "link":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }
  }

  function fileKindLabel(kind: ProjectFileRow["kind"]): string {
    switch (kind) {
      case "paper":
        return "Paper";
      case "slides":
        return "Slides";
      case "video":
        return "Video";
      case "image":
        return "Image";
      case "link":
        return "Link";
      default:
        return "File";
    }
  }

  grid.innerHTML = projects
    .map((p) => {
      const photo = p.image_url
        ? `<img src="${escapeAttr(p.image_url)}" alt="" loading="lazy" />`
        : `<div class="project-card__photo-placeholder">${packageIcon}</div>`;
      const year = p.year
        ? `<span class="project-card__year">${escapeHtml(p.year)}</span>`
        : "";

      const files = p.files ?? [];
      const hasFiles = files.length > 0;
      const hasEvent = !!p.event;

      // When the card carries files or an event chip we drop the
      // anchor-wrap pattern (which would swallow the file links) and
      // turn link_url into a discrete button at the bottom. Plain
      // single-link cards keep the click-anywhere UX.
      const useFullCardLink = !hasFiles && !hasEvent && !!p.link_url;
      const linkWrap = useFullCardLink
        ? `<a class="project-card" href="${escapeAttr(p.link_url!)}" target="_blank" rel="noopener noreferrer" role="listitem">`
        : `<div class="project-card${hasFiles || hasEvent ? " project-card--rich" : ""}" role="listitem">`;
      const linkClose = useFullCardLink ? `</a>` : `</div>`;

      const eventChip = hasEvent
        ? `<span class="project-card__chip project-card__chip--event" title="${escapeAttr(p.event!.title)}">${calendarIcon}<span class="project-card__chip-text">From ${escapeHtml(p.event!.title)}</span></span>`
        : "";

      const filesList = hasFiles
        ? `<ul class="project-card__files" aria-label="Project attachments">
            ${files
              .map(
                (f) => `
                  <li class="project-card__file">
                    <a class="project-card__file-link" href="${escapeAttr(f.url)}" target="_blank" rel="noopener noreferrer">
                      <span class="project-card__file-icon" aria-hidden="true">${fileKindIcon(f.kind)}</span>
                      <span class="project-card__file-meta">
                        <span class="project-card__file-title">${escapeHtml(f.title)}</span>
                        <span class="project-card__file-kind">${escapeHtml(fileKindLabel(f.kind))}</span>
                      </span>
                      <span class="project-card__file-go" aria-hidden="true">${externalIcon}</span>
                    </a>
                  </li>`,
              )
              .join("")}
          </ul>`
        : "";

      // Standalone "view" button for rich cards. Plain cards rely on
      // the surrounding anchor-wrap (useFullCardLink branch above).
      const linkButton = useFullCardLink
        ? `<span class="project-card__link">${externalIcon} View</span>`
        : p.link_url
          ? `<a class="project-card__view" href="${escapeAttr(p.link_url)}" target="_blank" rel="noopener noreferrer">${externalIcon}<span>View project</span></a>`
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
            ${eventChip}
            ${filesList}
            ${linkButton}
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

  // Show/hide sections by data-page attribute. We query [data-page]
  // (not [data-section]) so decoration blocks like the "what we do"
  // pillars and per-page CTA bands — which carry data-page but
  // intentionally NOT data-section, so they sit outside the eboard's
  // section-toggle and empty-data-warning systems — still flip
  // visibility on page change. Anything without data-page defaults
  // to "home" so nothing is orphaned.
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
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
  renderPillars();
  renderPageCtaBands();
  // Sponsor inquiry modal — mounted once; triggered via the
  // `#sponsor` hash route which the hero's partner CTA points to.
  setupSponsorModal(
    slug || null,
    bundle?.chapter?.name ?? remote?.hub_name ?? config.hub_name,
    remote,
  );
  wireSponsorHashRoute();
  renderAbout(remote?.about ?? null);
  renderStats(bundle?.chapter ?? null, bundle?.projects ?? []);
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
