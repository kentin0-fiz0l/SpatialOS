/**
 * Pure helpers for the MCP server, kept apart from index.ts (which starts listening on
 * import) so they can be unit-tested.
 */

import { timingSafeEqual } from 'node:crypto';

/** Close codes the server sends; the browser client decides whether to reconnect by these. */
export const CLOSE_CODES = {
  /** Token or origin rejected. The client must not retry: nothing will change by itself. */
  UNAUTHORIZED: 1008,
  /** Another tab took over. The client must not retry, or the two tabs evict each other forever. */
  SUPERSEDED: 4000,
} as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Only pages served from this machine may drive the scene. Browsers set Origin and
 * scripts can't forge it, so this blocks any web page you happen to have open from
 * opening the socket. A missing Origin (non-browser client) is accepted: the token
 * check still applies, and local processes are not the threat this guards against.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname === '::1' ? '[::1]' : url.hostname);
  } catch {
    return false;
  }
}

/** Constant-time token comparison; a plain !== leaks match length through timing. */
export function tokenMatches(presented: string | null, expected: string): boolean {
  if (presented === null) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ALLOWED_SCHEMES = new Set(['https:', 'http:', 'data:']);

/** Reject javascript:, file:, blob: and non-image data: URIs before they reach the scene. */
export function validateImageUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL format: ${urlString}`);
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new Error(`Invalid URL scheme: ${url.protocol}. Only https:, http:, and data: are allowed.`);
  }
  if (url.protocol === 'data:') {
    // url.protocol is lower-cased by the parser, but the MIME type is not: compare case-insensitively.
    const mime = urlString.slice('data:'.length).split(/[;,]/, 1)[0];
    if (!/^image\//i.test(mime)) {
      throw new Error('data: URIs must be image/* MIME type');
    }
  }
}

/** Message for the LLM when the browser isn't there. Has to name the real app URL. */
export const BROWSER_NOT_CONNECTED =
  'Browser not connected. Open the SpatialOS app (http://localhost:5173) and check the status bar shows "MCP: Connected".';
