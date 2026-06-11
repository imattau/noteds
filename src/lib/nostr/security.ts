export function sanitizeRelayUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return null;
  }

  if (!parsed.hostname || parsed.hostname === 'undefined' || parsed.hostname === 'null') {
    return null;
  }

  return parsed.toString();
}

export function isSecureRelayUrl(url: string): boolean {
  return sanitizeRelayUrl(url) !== null;
}

export function filterSecureRelays(relays: string[]): string[] {
  return relays
    .map((url) => sanitizeRelayUrl(url))
    .filter((url): url is string => url !== null);
}
