import { describe, expect, it } from 'vitest';
import { buildListingEvent, parseListingEvent, type ListingInput } from './listings';

const fullInput: ListingInput = {
  id: 'abc-123',
  title: 'Mountain Bike',
  summary: 'Lightly used mountain bike',
  price: { amount: '250', currency: 'USD' },
  location: 'Downtown Austin, TX',
  geohash: '9v6kp',
  categories: ['bicycles', 'sporting-goods'],
  images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  status: 'active',
  content: '# Mountain Bike\n\nGreat condition.'
};

describe('buildListingEvent', () => {
  it('builds a kind 30402 event for published listings', () => {
    const event = buildListingEvent(fullInput, false);
    expect(event.kind).toBe(30402);
    expect(event.content).toBe(fullInput.content);
    expect(event.tags).toContainEqual(['d', 'abc-123']);
    expect(event.tags).toContainEqual(['title', 'Mountain Bike']);
    expect(event.tags).toContainEqual(['summary', 'Lightly used mountain bike']);
    expect(event.tags).toContainEqual(['price', '250', 'USD']);
    expect(event.tags).toContainEqual(['location', 'Downtown Austin, TX']);
    expect(event.tags).toContainEqual(['g', '9v6kp']);
    expect(event.tags).toContainEqual(['t', 'bicycles']);
    expect(event.tags).toContainEqual(['t', 'sporting-goods']);
    expect(event.tags).toContainEqual(['image', 'https://example.com/a.jpg']);
    expect(event.tags).toContainEqual(['image', 'https://example.com/b.jpg']);
    expect(event.tags).toContainEqual(['status', 'active']);
    expect(typeof event.created_at).toBe('number');
  });

  it('builds a kind 30403 event for drafts', () => {
    const event = buildListingEvent(fullInput, true);
    expect(event.kind).toBe(30403);
  });

  it('omits location and g tags when not provided', () => {
    const { location, geohash, ...rest } = fullInput;
    const input: ListingInput = {
      ...rest,
      categories: [...fullInput.categories],
      images: [...fullInput.images]
    };
    const event = buildListingEvent(input, false);
    expect(event.tags.find(([tag]) => tag === 'location')).toBeUndefined();
    expect(event.tags.find(([tag]) => tag === 'g')).toBeUndefined();
  });
});

describe('parseListingEvent', () => {
  it('round-trips a full listing through build and parse', () => {
    const event = { ...buildListingEvent(fullInput, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    expect(parseListingEvent(event)).toEqual(fullInput);
  });

  it('round-trips a listing without optional location/geohash', () => {
    const { location, geohash, ...rest } = fullInput;
    const input: ListingInput = {
      ...rest,
      categories: [...fullInput.categories],
      images: [...fullInput.images]
    };
    const event = { ...buildListingEvent(input, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    const parsed = parseListingEvent(event);
    expect(parsed.location).toBeUndefined();
    expect(parsed.geohash).toBeUndefined();
  });

  it('preserves multiple categories and images in order', () => {
    const event = { ...buildListingEvent(fullInput, false), pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    const parsed = parseListingEvent(event);
    expect(parsed.categories).toEqual(['bicycles', 'sporting-goods']);
    expect(parsed.images).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('defaults status to active when the status tag is missing', () => {
    const event = buildListingEvent(fullInput, false);
    event.tags = event.tags.filter(([tag]) => tag !== 'status');
    const fullEvent = { ...event, pubkey: 'pk', id: 'evid', sig: 'sig' } as any;
    expect(parseListingEvent(fullEvent).status).toBe('active');
  });
});
