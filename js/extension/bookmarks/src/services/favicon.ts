type FaviconInput = {
  url?: string;
  domain?: string;
  override?: string;
};

function normalizeHostname(input?: string): string | undefined {
  if (!input) return undefined;
  return input.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim() || undefined;
}

export function resolveHostname(input: FaviconInput): string | undefined {
  if (input.domain) {
    return normalizeHostname(input.domain);
  }

  if (!input.url) {
    return undefined;
  }

  try {
    return normalizeHostname(new URL(input.url).hostname);
  } catch {
    return normalizeHostname(input.url);
  }
}

function getPageOrigin(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getNativeChromiumFaviconUrl(pageUrl?: string, size = 32): string | undefined {
  if (!pageUrl) return undefined;
  if (globalThis.location?.protocol !== 'chrome-extension:') {
    return undefined;
  }

  const nativeUrl = new URL('/_favicon/', globalThis.location.origin);
  nativeUrl.searchParams.set('pageUrl', pageUrl);
  nativeUrl.searchParams.set('size', String(size));
  return nativeUrl.toString();
}

export function getFaviconSources(input: FaviconInput): string[] {
  const sources = new Set<string>();

  if (input.override) {
    sources.add(input.override);
  }

  const nativeChromiumUrl = getNativeChromiumFaviconUrl(input.url);
  if (nativeChromiumUrl) {
    sources.add(nativeChromiumUrl);
  }

  const pageOrigin = getPageOrigin(input.url);
  if (pageOrigin) {
    sources.add(`${pageOrigin}/favicon.ico`);
  }

  const hostname = resolveHostname(input);
  if (!hostname) {
    return [...sources];
  }

  sources.add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`);
  sources.add(`https://icons.duckduckgo.com/ip3/${hostname}.ico`);
  return [...sources];
}
