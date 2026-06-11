import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { getAllTags, getTagOr } from './utils';

export interface ListingInput {
  id: string;
  title: string;
  summary: string;
  price: { amount: string; currency: string };
  location?: string;
  geohash?: string;
  categories: string[];
  images: string[];
  status: 'active' | 'sold';
  content: string;
}

export function buildListingEvent(input: ListingInput, draft: boolean): EventTemplate {
  const tags: string[][] = [
    ['d', input.id],
    ['title', input.title],
    ['summary', input.summary],
    ['price', input.price.amount, input.price.currency]
  ];

  if (input.location) tags.push(['location', input.location]);
  if (input.geohash) tags.push(['g', input.geohash]);
  for (const category of input.categories) tags.push(['t', category]);
  for (const image of input.images) tags.push(['image', image]);
  tags.push(['status', input.status]);

  return {
    kind: draft ? 30403 : 30402,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: input.content
  };
}

export function parseListingEvent(event: NostrEvent): ListingInput {
  const priceTag = event.tags.find(([tag]) => tag === 'price');
  const location = event.tags.find(([tag]) => tag === 'location')?.[1];
  const geohash = event.tags.find(([tag]) => tag === 'g')?.[1];
  const status = getTagOr(event, 'status', 'active') as 'active' | 'sold';

  return {
    id: getTagOr(event, 'd'),
    title: getTagOr(event, 'title'),
    summary: getTagOr(event, 'summary'),
    price: { amount: priceTag?.[1] || '', currency: priceTag?.[2] || '' },
    ...(location !== undefined ? { location } : {}),
    ...(geohash !== undefined ? { geohash } : {}),
    categories: getAllTags(event, 't'),
    images: getAllTags(event, 'image'),
    status,
    content: event.content
  };
}
