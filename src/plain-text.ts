/* Résumé strings are Markdown (living-resume-view.tsx renders them with
   marked). The portfolio prints them as plain text, so this strips the
   inline syntax instead of pulling a Markdown library into a ≤16 KB bundle.
   Line breaks survive: About splits paragraphs on blank lines. */
export function plainText(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ""))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](?=\S)(.+?)(?<=\S)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
