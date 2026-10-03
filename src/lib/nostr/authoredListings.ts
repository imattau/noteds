import { getActiveRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';
import { parseListingEvent, type ListingInput } from './listings';
import { cacheBrowseItems } from './browseCache';
import { queryBrowseItemsBySeller } from './browseCacheStore';

export const AUTHORED_LISTINGS_LOAD_TIMEOUT_MS = 5000;

export interface AuthoredListing {
  listing: ListingInput;
  created_at: number;
  eventId: string;
}

/**
 * Relay-only fetch of every listing the pubkey has published, canonicalised to
 * the newest version of each. Results are also written to the browse cache.
 */
export async function fetchAuthoredListings(pubkey: string): Promise<AuthoredListing[]> {
  const events = await collectEvents(
    relayPool.request(getActiveRelays(), {
      kinds: [30402],
      authors: [pubkey]
    }),
    AUTHORED_LISTINGS_LOAD_TIMEOUT_MS
  );

  const dTagValues = new Set<string>();
  for (const event of events) {
    dTagValues.add(parseListingEvent(event).id);
    eventStore.add(event);
  }

  const result: AuthoredListing[] = [];
  for (const dTagValue of dTagValues) {
    const canonical = eventStore.getReplaceable(30402, pubkey, dTagValue);
    if (!canonical) continue;
    result.push({
      listing: parseListingEvent(canonical),
      created_at: canonical.created_at,
      eventId: canonical.id
    });
  }

  const sorted = result.sort((a, b) => b.created_at - a.created_at);
  if (sorted.length > 0) {
    void cacheBrowseItems(
      sorted.map((item) => ({
        listing: item.listing,
        pubkey,
        created_at: item.created_at,
        eventId: item.eventId
      }))
    );
  }
  return sorted;
}

/** Authored listings from relays, falling back to the local graph cache when relays return none. */
export async function loadAuthoredListings(pubkey: string): Promise<AuthoredListing[]> {
  let cached: AuthoredListing[] = [];
  try {
    cached = (await queryBrowseItemsBySeller(pubkey)).map((item) => ({
      listing: item.listing,
      created_at: item.created_at,
      eventId: item.eventId
    }));
  } catch {
    // Relay data remains the source of truth when local graph storage is unavailable.
  }

  const fetched = await fetchAuthoredListings(pubkey);
  if (fetched.length > 0) return fetched;
  return cached.sort((a, b) => b.created_at - a.created_at);
}
