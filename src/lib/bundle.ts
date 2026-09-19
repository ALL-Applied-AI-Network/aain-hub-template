/* The shape of everything the dashboard hands this site.

   Lifted out of main.ts unchanged so the view modules can type against
   the same records main.ts renders — one definition, not a copy per
   view. The authoritative shapes live in the dashboard's
   lib/hub-config.ts; these mirror the public bundle's projection of
   them.

   Types only: nothing here runs, so importing it costs nothing. */

export interface HubConfig {
  hub_name: string;
  hub_acronym: string;
  hub_id: string;
  /** Domain whose subdomains are chapters. Only needed by a fork
   *  self-hosting under its own domain; the network's own default is
   *  all-ai-network.org. */
  hub_domain?: string;
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

export interface LocalContentEntry {
  title: string;
  description: string;
  path: string;
  type: "local";
  section: "learning" | "workshops" | "playbooks";
  thumbnail?: string;
}

export interface ManifestEntry {
  type: "learning" | "playbook" | "workshop" | "template";
  title: string;
  description: string;
  path: string;
  thumbnail?: string;
}

export interface Manifest {
  content: ManifestEntry[];
}

export interface TreeNode {
  id: string;
  title: string;
  description?: string;
  layer: number;
  difficulty: string;
  estimated_minutes: number;
  thumbnail?: string;
  content_path?: string;
}

export interface TreeData {
  nodes: TreeNode[];
}

export interface Officer {
  name: string;
  role: string;
  image_url?: string | null;
  linkedin?: string | null;
  email?: string | null;
}

export interface RemoteConfig {
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

export interface EventRow {
  id: string;
  title: string;
  /** Listed events announce the schedule before their full details go live. */
  publish_status?: "listed" | "published";
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
  /** IANA timezone the event's date/end_date are in. NULL for legacy
   *  events → rendered as UTC (their stored wall-clock). */
  timezone: string | null;
  /** Learning Tree node this event teaches (title is the display
   *  snapshot; ref identifies the node). NULL = not linked. */
  learning_tree_node_ref?: string | null;
  learning_tree_node_title?: string | null;
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
  /** Public URL slug. Decoration only: `?event={uuid}` is the
   *  addressing contract the dashboard mints and middleware unfurls, so
   *  `id` stays the key. Nullable even on a published event — slugs are
   *  minted lazily on first public link — and OPTIONAL because the API
   *  deploys separately from this site, so a live hub can be running
   *  against a bundle route that predates the field. */
  slug?: string | null;
  /** The one joinability signal that is a plain column: a project-based
   *  event is the kind a visitor can still join after the kickoff. The
   *  rest of the participation state lives behind event_phases /
   *  project_config / event_files and is on the flyer, not here. */
  project_based?: boolean;
}

export interface EventPhase {
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

export interface LeaderboardBadge {
  id: string;
  name: string;
  icon: string; // built-in key like "trophy", or full URL for custom uploads
}

export interface LeaderboardRow {
  name: string;
  points: number;
  events_attended: number;
  rank: number;
  badges?: LeaderboardBadge[];
}

export interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  award_count: number;
}

export interface MerchRow {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  // Ordered gallery of image URLs. Newer bundles ship `images`; older
  // ones only have the single `image_url` mirror, so renderMerch falls
  // back to `[image_url]` when `images` is absent.
  images?: string[];
  image_url: string | null;
  // Optional chapter-authored cost label that overrides the default
  // "{cost_points} points" display when non-empty.
  cost_text?: string | null;
  stock: number | null;
}

export interface ProjectFileRow {
  id: string;
  kind: "paper" | "slides" | "video" | "image" | "link" | "other";
  title: string;
  url: string;
  file_size: number | null;
  mime_type: string | null;
}

export interface ProjectLinkedEvent {
  id: string;
  title: string;
  date: string | null;
  end_date: string | null;
}

export interface ProjectRow {
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

export interface ChapterBundle {
  chapter: { slug: string; name: string; university: string; member_count: number; event_count: number };
  config: RemoteConfig;
  events: EventRow[];
  leaderboard: LeaderboardRow[];
  badges: BadgeRow[];
  merch: MerchRow[];
  projects: ProjectRow[];
  /* The bundle also ships `social_feeds` (posts synced from the
     chapter's linked accounts). It is deliberately not typed here and
     nothing renders it: `social_feeds` was `{}` on all twelve chapters
     including the richest, so the socials section was a permanently
     empty grid under a heading that promised posts. If a chapter ever
     syncs one, the type comes back with the section. */
}

/** What a view is handed. `ChapterBundle` is the wire shape; `Bundle`
 *  is the name the view contract uses for it, so a later change to how
 *  the bundle is assembled does not rename a type in five view files. */
export type Bundle = ChapterBundle;
