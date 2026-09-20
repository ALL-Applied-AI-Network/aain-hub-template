/* The platform registry — a mirror of network-api/src/lib/platforms.ts,
   which is the source of truth. Order here is the order the dashboard's
   picker lists them; a chapter's own order comes from its config.

   `kind` is what the landing page groups by: "join" links are invites a
   visitor accepts to hear from the chapter (Discord, Teams, GroupMe…) and
   get the button treatment; "follow" links are feeds and sit as marks in
   the footer; "contact" is the door. */

import { PLATFORM_ICONS } from "./platform-icons";

export type PlatformKind = "join" | "follow" | "contact";

export interface PlatformMeta {
  label: string;
  kind: PlatformKind;
  /** The button text when the chapter gave no label of its own. */
  verb: string;
}

export const PLATFORMS: Record<string, PlatformMeta> = {
  discord: { label: "Discord", kind: "join", verb: "Join the Discord" },
  slack: { label: "Slack", kind: "join", verb: "Join the Slack" },
  teams: { label: "Microsoft Teams", kind: "join", verb: "Join on Teams" },
  groupme: { label: "GroupMe", kind: "join", verb: "Join the GroupMe" },
  whatsapp: { label: "WhatsApp", kind: "join", verb: "Join on WhatsApp" },
  telegram: { label: "Telegram", kind: "join", verb: "Join on Telegram" },
  instagram: { label: "Instagram", kind: "follow", verb: "Instagram" },
  linkedin: { label: "LinkedIn", kind: "follow", verb: "LinkedIn" },
  github: { label: "GitHub", kind: "follow", verb: "GitHub" },
  x: { label: "X", kind: "follow", verb: "X" },
  youtube: { label: "YouTube", kind: "follow", verb: "YouTube" },
  tiktok: { label: "TikTok", kind: "follow", verb: "TikTok" },
  facebook: { label: "Facebook", kind: "follow", verb: "Facebook" },
  twitch: { label: "Twitch", kind: "follow", verb: "Twitch" },
  website: { label: "Website", kind: "follow", verb: "Website" },
  email: { label: "Email", kind: "contact", verb: "Email" },
};

export interface CommunityLink {
  platform: string;
  url: string;
  label?: string | null;
}

/** The mark for a platform; the generic link glyph for one this build
 *  predates, so an unknown platform is still a button and not a gap. */
export function platformIcon(platform: string): string {
  return PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.website;
}

export function platformMeta(platform: string): PlatformMeta {
  return (
    PLATFORMS[platform] ?? {
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      kind: "follow",
      verb: platform,
    }
  );
}

/** The href for a link: email addresses become mailto:, everything else
 *  is the URL the eboard typed (the API has already required https). */
export function communityHref(link: CommunityLink): string {
  return link.platform === "email" && !/^mailto:/i.test(link.url)
    ? `mailto:${link.url}`
    : link.url;
}

/** The legacy seven-key social_links blob as a community list, for a
 *  bundle from an API that predates community_links. */
export function linksFromSocial(social: Record<string, string> | null | undefined): CommunityLink[] {
  const map: Record<string, string> = {
    discord: "discord",
    github: "github",
    instagram: "instagram",
    linkedin: "linkedin",
    twitter: "x",
    youtube: "youtube",
    email: "email",
  };
  const out: CommunityLink[] = [];
  for (const [key, url] of Object.entries(social ?? {})) {
    const platform = map[key];
    if (platform && url) out.push({ platform, url, label: null });
  }
  return out;
}
