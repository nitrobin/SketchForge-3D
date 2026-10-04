// Prefixes a root-relative URL (public/ asset or page URL) with the Next.js basePath,
// so the app also works when hosted under a subpath (e.g. GitHub Pages project site).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function publicPath(path: string): string {
  return `${BASE_PATH}${path}`;
}
