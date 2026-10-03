import type { Filter, NostrEvent } from 'nostr-tools';
import { relayPool } from './runtime';

export interface ListingFeedOptions {
  categories?: string[];
  geohashPrefix?: string;
  since?: number;
  limit?: number;
}

export const DEFAULT_LISTING_BACKFILL_DAYS = 90;
/** Per-relay cap on the initial backfill; live events after EOSE are unaffected. */
export const DEFAULT_LISTING_FEED_LIMIT = 500;

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
