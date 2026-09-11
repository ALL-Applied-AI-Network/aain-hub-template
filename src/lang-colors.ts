/* GitHub linguist colours for the repo-card language dot. The name is
   always printed beside the dot: colour is never the only signal. */
export const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "Jupyter Notebook": "#DA5B0B",
  HTML: "#e34c26",
  CSS: "#663399",
  Shell: "#89e051",
  Ruby: "#701516",
  R: "#198CE7",
  Dart: "#00B4AB",
  Scala: "#c22d40",
  Lua: "#6b6bd0",
};

/** Unknown languages fall back to the tertiary text colour. */
export function langColor(language: string): string {
  return LANG_COLORS[language] ?? "var(--text-tertiary)";
}
