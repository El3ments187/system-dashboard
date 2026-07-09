/** Read a CSS custom property off the document root, trimmed. */
export function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
