import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools/pure';
import { getTagOr } from './utils';
import { getActiveRelays } from './relays';
import { collectEvents } from './requestEvents';
import { eventStore, relayPool } from './runtime';
import { signer } from './signer';

// Custom addressable kind for seller reviews. NIP-01 reserves 30000-39999 for
// addressable events, so this lets each review have a unique d tag while still
// being queryable by seller pubkey.
export const SELLER_REVIEW_KIND = 34550;
export const SELLER_REVIEW_LOAD_TIMEOUT_MS = 5000;

export interface SellerReviewInput {
  id: string;
  sellerPubkey: string;
  rating: number;
  content: string;
}

export interface PublishSellerReviewOptions {
  anonymous?: boolean;
}

export interface SellerReview {
  id: string;
  sellerPubkey: string;
  reviewerPubkey: string;
  rating: number;
  content: string;
  anonymous: boolean;
  created_at: number;
  eventId: string;
}

function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 5;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

function parseRating(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

export function buildSellerReviewEvent(input: SellerReviewInput): EventTemplate {
  return {
    kind: SELLER_REVIEW_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', input.id],
      ['p', input.sellerPubkey],
      ['rating', String(clampRating(input.rating))]
    ],
    content: input.content.trim()
  };
}

export function parseSellerReviewEvent(event: NostrEvent): SellerReview | null {
  const sellerPubkey = getTagOr(event, 'p');
  const id = getTagOr(event, 'd');
  const rating = parseRating(getTagOr(event, 'rating'));
  if (!sellerPubkey || !id || rating === null) {
    return null;
  }

  return {
    id,
    sellerPubkey,
    reviewerPubkey: event.pubkey,
    rating,
    content: event.content.trim(),
    anonymous: getTagOr(event, 'anon') === '1',
    created_at: event.created_at,
    eventId: event.id
  };
}

function buildAnonymousProfileEvent(pubkey: string): EventTemplate {
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify({
      name: 'Anonymous',
      display_name: 'Anonymous'
    }),
    tags: []
  };
}

async function publishEvent(event: NostrEvent): Promise<void> {
  await relayPool.publish(getActiveRelays(), event);
  eventStore.add(event);
}

export async function publishSellerReview(input: SellerReviewInput, options: PublishSellerReviewOptions = {}): Promise<NostrEvent> {
  if (!options.anonymous) {
    const event = await signer.signEvent(buildSellerReviewEvent(input));
    await publishEvent(event);
    return event;
  }

  const secretKey = generateSecretKey();
  const reviewerPubkey = getPublicKey(secretKey);
  const profileEvent = finalizeEvent(buildAnonymousProfileEvent(reviewerPubkey), secretKey);
  await publishEvent(profileEvent);

  const reviewTemplate = buildSellerReviewEvent(input);
  const anonymousReviewEvent = finalizeEvent(
    {
      ...reviewTemplate,
      tags: [...reviewTemplate.tags, ['anon', '1']]
    },
    secretKey
  );
  await publishEvent(anonymousReviewEvent);
  return anonymousReviewEvent;
}

export async function loadSellerReviews(sellerPubkey: string): Promise<SellerReview[]> {
  const events = await collectEvents(
    relayPool.request(getActiveRelays(), {
      kinds: [SELLER_REVIEW_KIND],
      '#p': [sellerPubkey]
    }),
    SELLER_REVIEW_LOAD_TIMEOUT_MS
  );

  const reviews = new Map<string, NostrEvent>();
  for (const event of events) {
    eventStore.add(event);
    const parsed = parseSellerReviewEvent(event);
    if (!parsed) continue;
    const key = `${parsed.reviewerPubkey}:${parsed.id}`;
    const current = reviews.get(key);
    if (!current || current.created_at < event.created_at || (current.created_at === event.created_at && current.id > event.id)) {
      reviews.set(key, event);
    }
  }

  return Array.from(reviews.values())
    .map((event) => parseSellerReviewEvent(event))
    .filter((review): review is SellerReview => review !== null)
    .sort((a, b) => b.created_at - a.created_at);
}
