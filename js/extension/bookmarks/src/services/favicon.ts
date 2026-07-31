type FaviconInput = {
  url?: string;
  domain?: string;
  override?: string;
};

export function getFaviconPageUrls(pageUrl?: string): string[] {
  const value = pageUrl?.trim();
  if (!value) return [];

  const candidates = new Set<string>();
  candidates.add(value);
  try {
    const normalized = new URL(value);
    normalized.hash = '';
    candidates.add(normalized.toString());
    if (['http:', 'https:'].includes(normalized.protocol)) {
      candidates.add(`${normalized.origin}/`);
    }
  } catch {}

  return [...candidates];
}

function getNativeChromiumFaviconUrl(pageUrl: string, size = 32): string | undefined {
  if (!pageUrl) return undefined;
  if (globalThis.location?.protocol !== 'chrome-extension:') {
    return undefined;
  }

  const nativeUrl = new URL('/_favicon/', globalThis.location.origin);
  nativeUrl.searchParams.set('pageUrl', pageUrl);
  nativeUrl.searchParams.set('size', String(size));
  return nativeUrl.toString();
}

export function withFaviconRefreshToken(source: string, token: number): string {
  if (!token) return source;

  try {
    const url = new URL(source);
    if (url.protocol !== 'chrome-extension:' || url.pathname !== '/_favicon/') {
      return source;
    }
    url.searchParams.set('_refresh', String(token));
    return url.toString();
  } catch {
    return source;
  }
}

export function getFaviconSources(input: FaviconInput): string[] {
  const sources = new Set<string>();

  if (input.override) {
    sources.add(input.override);
  }

  for (const pageUrl of getFaviconPageUrls(input.url)) {
    const nativeChromiumUrl = getNativeChromiumFaviconUrl(pageUrl);
    if (nativeChromiumUrl) {
      sources.add(nativeChromiumUrl);
    }
  }

  return [...sources];
}
