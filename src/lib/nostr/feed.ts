import type { Filter, NostrEvent } from 'nostr-tools';
import { relayPool } from './signer';

export interface ListingFeedOptions {
  categories?: string[];
  geohashPrefix?: string;
  since?: number;
}

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
  const filter = buildListingFilter(filters);
  const subscription = relayPool.subscription(relays, filter).subscribe((response: any) => {
    if (response !== 'EOSE') {
      onEvent(response);
    }
  });

  return () => subscription.unsubscribe();
}
