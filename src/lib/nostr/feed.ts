import type { Filter, NostrEvent } from 'nostr-tools';
import { relayPool } from './signer';

export interface ListingFeedOptions {
  categories?: string[];
  geohashPrefix?: string;
  since?: number;
}

export const DEFAULT_LISTING_BACKFILL_DAYS = 90;

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

  return filter;
}

export function subscribeToListings(
  relays: string[],
  filters: ListingFeedOptions,
  onEvent: (event: NostrEvent) => void
): () => void {
  const effectiveSince =
    filters.since ?? Math.floor(Date.now() / 1000) - DEFAULT_LISTING_BACKFILL_DAYS * 24 * 60 * 60;
  const filter = buildListingFilter({ ...filters, since: effectiveSince });
  const subscription = relayPool.subscription(relays, filter).subscribe((response: any) => {
    if (response !== 'EOSE') {
      onEvent(response);
    }
  });

  return () => subscription.unsubscribe();
}
