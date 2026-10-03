import type { Filter, NostrEvent } from 'nostr-tools';
import { collectEvents, settleEarly } from './requestEvents';
import { relayPool } from './runtime';

export interface ListingFeedOptions {
  categories?: string[];
  geohashPrefix?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export const DEFAULT_LISTING_BACKFILL_DAYS = 90;
/** Per-relay cap on the initial backfill; live events after EOSE are unaffected. */
export const DEFAULT_LISTING_FEED_LIMIT = 500;
/** Per-relay page size when paging back past the live feed. */
export const OLDER_LISTINGS_PAGE_SIZE = 60;
const OLDER_LISTINGS_TIMEOUT_MS = 5000;

export function buildListingFilter(opts: ListingFeedOptions): Filter {
  const filter: Filter = { kinds: [30402] };

  if (opts.categories?.length) {
    filter['#t'] = opts.categories;
  }
  if (opts.geohashPrefix) {
    filter['#g'] = [opts.geohashPrefix];
  }
  if (opts.since !== undefined) {
    filter.since = opts.since;
  }
  if (opts.until !== undefined) {
    filter.until = opts.until;
  }
  if (opts.limit !== undefined) {
    filter.limit = opts.limit;
  }

  return filter;
}

export function subscribeToListings(
  relays: string[],
  filters: ListingFeedOptions,
  onEvent: (event: NostrEvent) => void
): () => void {
  const effectiveSince =
    filters.since ?? Math.floor(Date.now() / 1000) - DEFAULT_LISTING_BACKFILL_DAYS * 24 * 60 * 60;
  const filter = buildListingFilter({
    ...filters,
    since: effectiveSince,
    limit: filters.limit ?? DEFAULT_LISTING_FEED_LIMIT
  });
  const subscription = relayPool.subscription(relays, filter).subscribe((response: any) => {
    if (response !== 'EOSE') {
      onEvent(response);
    }
  });

  return () => subscription.unsubscribe();
}

/**
 * Live NIP-09 deletions of listings. Scoped by the `k` tag so relays don't
 * stream every deletion on the network; deletions without a `k` tag are still
 * caught per listing by the `#a` subscription on the listing page.
 */
export function subscribeToListingDeletions(
  relays: string[],
  since: number,
  onEvent: (event: NostrEvent) => void
): () => void {
  const subscription = relayPool
    .subscription(relays, { kinds: [5], '#k': ['30402'], since })
    .subscribe((response: any) => {
      if (response !== 'EOSE') {
        onEvent(response);
      }
    });

  return () => subscription.unsubscribe();
}

/**
 * One page of listings published at or before `until`, for paging back past
 * the live feed. Relays return their newest matches first, so repeated calls
 * with the oldest seen `created_at` walk back through history.
 */
export async function fetchOlderListings(
  relays: string[],
  filters: Omit<ListingFeedOptions, 'since' | 'until' | 'limit'>,
  until: number,
  limit = OLDER_LISTINGS_PAGE_SIZE
): Promise<NostrEvent[]> {
  if (relays.length === 0) return [];
  return await collectEvents(
    relayPool.request(relays, buildListingFilter({ ...filters, until, limit }), settleEarly(relays)),
    OLDER_LISTINGS_TIMEOUT_MS
  );
}

/**
 * Deletions targeting specific listing events or addresses. Older pages fall
 * outside the live deletion subscription's window, so they're checked directly
 * (by id and address, which also catches deletions without a `k` tag).
 */
export async function fetchListingDeletions(
  relays: string[],
  eventIds: string[],
  addresses: string[]
): Promise<NostrEvent[]> {
  const filters: Filter[] = [];
  if (eventIds.length > 0) filters.push({ kinds: [5], '#e': eventIds });
  if (addresses.length > 0) filters.push({ kinds: [5], '#a': addresses });
  if (relays.length === 0 || filters.length === 0) return [];
  return await collectEvents(
    relayPool.request(relays, filters, settleEarly(relays)),
    OLDER_LISTINGS_TIMEOUT_MS
  );
}

