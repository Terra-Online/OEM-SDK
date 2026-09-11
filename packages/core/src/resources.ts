import { invalid } from './errors';

/**
 * Resolves a manifest asset against one configured CDN origin.
 *
 * Only relative paths are accepted so a manifest cannot redirect requests to
 * an untrusted origin or a parent directory.
 */
export function resolveOEMAsset(base: string, assetPath: string): string {
  if (typeof base !== 'string' || typeof assetPath !== 'string' || !assetPath.trim()) invalid('resource.path', 'Expected a relative resource path');
  if (/^[a-z][a-z\d+.-]*:/i.test(assetPath) || assetPath.startsWith('//') || /[\\\x00-\x20]/.test(assetPath)) {
    invalid('resource.path', 'Resource paths must be relative to their configured origin');
  }
  let decoded: string;
  try { decoded = decodeURIComponent(assetPath); } catch { return invalid('resource.path', 'Invalid URL encoding'); }
  if (decoded.split(/[/?#]/).includes('..') || decoded.includes('\\')) invalid('resource.path', 'Resource traversal is not allowed');
  let origin: URL;
  try { origin = new URL(base); } catch { return invalid('resources.baseUrl', 'Expected an absolute HTTP(S) resource base'); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) invalid('resources.baseUrl', 'Expected an HTTP(S) resource base');
  return `${base.replace(/\/$/, '')}/${assetPath.replace(/^\//, '')}`;
}

