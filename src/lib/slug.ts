/* Which record is this hostname for?

   The network serves every chapter site AND every member portfolio at
   {label}.all-ai-network.org from one deployment, so the hostname is the
   identity — never a value baked at build time. main.ts and portfolio.ts
   share this so a label resolves the same way on both pages. */

/** Subdomains of the hub domain that are network services, not records.
 *  Without this, loading the build at dashboard.all-ai-network.org would
 *  go looking for a chapter called "dashboard". */
export const RESERVED_LABELS = new Set([
  "www", "api", "app", "dashboard", "sponsors", "sponsor", "admin",
  "mail", "docs", "status", "cdn", "assets",
]);

/** The single subdomain label of `hubDomain`, or "" when this page is the
 *  apex, a nested label, a reserved service, or some other domain. */
export function hostnameSlug(hubDomain = "all-ai-network.org"): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname.toLowerCase();
  // The apex is the marketing site, not a chapter.
  if (host === hubDomain) return "";
  if (!host.endsWith(`.${hubDomain}`)) return "";
  const label = host.slice(0, host.length - hubDomain.length - 1);
  // Only a single label: a.b.all-ai-network.org is not a chapter.
  if (!label || label.includes(".")) return "";
  if (RESERVED_LABELS.has(label)) return "";
  return label;
}

/** True only when this page is iframed by the dashboard. Preview overrides
 *  (?slug=, theme params) exist for the dashboard's Customize iframe;
 *  honouring them at top level let anyone paint another chapter's identity
 *  onto this hostname and divert its sponsor leads (security audit
 *  2026-08-18, finding 6), so require that we are genuinely embedded. */
export function embeddedByDashboard(): boolean {
  return (
    window.parent !== window &&
    (document.referrer === "" ||
      document.referrer.startsWith("https://dashboard.all-ai-network.org/"))
  );
}

/** The preview gate: `?preview=1` counts only inside the dashboard iframe. */
export function isDashboardPreview(params: URLSearchParams | null): boolean {
  return params?.get("preview") === "1" && embeddedByDashboard();
}
