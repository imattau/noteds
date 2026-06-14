import { describe, expect, it } from 'vitest';
import { buildSellerReviewEvent, parseSellerReviewEvent, SELLER_REVIEW_KIND } from './reviews';

describe('seller reviews', () => {
  it('builds an addressable review event for a seller', () => {
    const event = buildSellerReviewEvent({
      id: 'review-1',
      sellerPubkey: 'a'.repeat(64),
      rating: 6,
      content: 'Good transaction.'
    });

    expect(event.kind).toBe(SELLER_REVIEW_KIND);
    expect(event.tags).toContainEqual(['d', 'review-1']);
    expect(event.tags).toContainEqual(['p', 'a'.repeat(64)]);
    expect(event.tags).toContainEqual(['rating', '5']);
    expect(event.content).toBe('Good transaction.');
  });

  it('parses a seller review event', () => {
    const parsed = parseSellerReviewEvent({
      id: 'event-id',
      kind: SELLER_REVIEW_KIND,
      pubkey: 'b'.repeat(64),
      created_at: 1234,
      content: 'Nice seller',
      sig: 'sig',
      tags: [
        ['d', 'review-2'],
        ['p', 'a'.repeat(64)],
        ['rating', '4']
      ]
    });

    expect(parsed).toEqual({
      id: 'review-2',
      sellerPubkey: 'a'.repeat(64),
      reviewerPubkey: 'b'.repeat(64),
      rating: 4,
      content: 'Nice seller',
      anonymous: false,
      created_at: 1234,
      eventId: 'event-id'
    });
  });

  it('marks anonymous reviews from the anon tag', () => {
    const parsed = parseSellerReviewEvent({
      id: 'event-id',
      kind: SELLER_REVIEW_KIND,
      pubkey: 'b'.repeat(64),
      created_at: 1234,
      content: 'Anonymous note',
      sig: 'sig',
      tags: [
        ['d', 'review-3'],
        ['p', 'a'.repeat(64)],
        ['rating', '5'],
        ['anon', '1']
      ]
    });

    expect(parsed?.anonymous).toBe(true);
  });
});
