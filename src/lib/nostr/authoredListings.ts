import { getActiveRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';
import { parseListingEvent, type ListingInput } from './listings';

export const AUTHORED_LISTINGS_LOAD_TIMEOUT_MS = 5000;

export interface AuthoredListing {
  listing: ListingInput;
  created_at: number;
  eventId: string;
}

export async function loadAuthoredListings(pubkey: string): Promise<AuthoredListing[]> {
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

  return result.sort((a, b) => b.created_at - a.created_at);
}
