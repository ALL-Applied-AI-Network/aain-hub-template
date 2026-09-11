/* Shared by main.ts and portfolio.ts: both entries build their DOM from
   string templates fed with dashboard data (event titles, member names,
   résumé text), so one escaper keeps the two pages from diverging on what
   counts as safe. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}
