/**
 * Resolve an asset path against Vite's BASE_URL so it works no matter what
 * sub-path the build is served from (root, /sector-runner/, a CDN prefix, ...).
 *
 * Always pass a RELATIVE path, e.g. assetUrl('assets/kenney/player.png').
 * Never hardcode a leading-slash absolute path anywhere in the game.
 *
 * No assets are loaded in this milestone — this helper just exists so future
 * code has a single correct place to build URLs.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Fetch an image asset and decode it into an ImageBitmap, ready for fast
 * drawImage blits. The caller owns the bitmap and MUST call .close() on it when
 * done (see SpriteSheet.dispose) so the GPU memory is released — leaving these
 * open is the main source of leaks the destroy() contract guards against.
 *
 * Always pass a base-relative path, e.g.
 *   loadImageBitmap('assets/kenney/base/Tilemap/tilemap_packed.png').
 */
export async function loadImageBitmap(path: string): Promise<ImageBitmap> {
  const url = assetUrl(path);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load asset "${url}": ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob);
}
