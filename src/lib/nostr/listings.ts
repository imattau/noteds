import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { getAllTags, getTagOr } from './utils';

export interface ListingImage {
  url: string;
  sources: string[];
}

export interface ListingSubcategory {
  parent: string;
  value: string;
}

export const MAX_LISTING_IMAGES = 8;

export interface ListingInput {
  id: string;
  title: string;
  summary: string;
  price: { amount: string; currency: string };
  location?: string;
  geohash?: string;
  categories: string[];
  subcategories?: ListingSubcategory[];
  images: ListingImage[];
  status: 'active' | 'sold';
  content: string;
}

function sanitizeHttpsUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function buildListingEvent(input: ListingInput, draft: boolean): EventTemplate {
  const images = input.images.slice(0, MAX_LISTING_IMAGES);
  const tags: string[][] = [
    ['d', input.id],
    ['title', input.title],
    ['summary', input.summary],
    ['price', input.price.amount, input.price.currency]
  ];

  if (input.location) tags.push(['location', input.location]);
  if (input.geohash) tags.push(['g', input.geohash]);
  for (const category of input.categories) tags.push(['t', category]);
  for (const subcategory of input.subcategories ?? []) {
    tags.push(['sc', subcategory.parent, subcategory.value]);
  }
  for (const image of images) {
    const sources = [
      image.url,
      ...image.sources.filter((source) => source !== image.url)
    ]
      .map((source) => sanitizeHttpsUrl(source))
      .filter((source): source is string => source !== null);
    if (sources.length > 0) {
      tags.push(['image', ...sources]);
    }
  }
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
  const subcategories = event.tags
    .filter(([tag]) => tag === 'sc')
    .map((tag) => ({
      parent: tag[1],
      value: tag[2]
    }))
    .filter((subcategory): subcategory is ListingSubcategory => Boolean(subcategory.parent && subcategory.value));
  const images = event.tags
    .filter(([tag]) => tag === 'image')
    .map((tag) => {
      const sources = tag
        .slice(1)
        .map((value) => sanitizeHttpsUrl(value))
        .filter((value): value is string => value !== null);
      if (sources.length === 0) {
        return null;
      }
      return {
        url: sources[0],
        sources
      };
    })
    .filter((value): value is ListingImage => value !== null);

  return {
    id: getTagOr(event, 'd'),
    title: getTagOr(event, 'title'),
    summary: getTagOr(event, 'summary'),
    price: { amount: priceTag?.[1] || '', currency: priceTag?.[2] || '' },
    ...(location !== undefined ? { location } : {}),
    ...(geohash !== undefined ? { geohash } : {}),
    categories: getAllTags(event, 't'),
    subcategories,
    images,
    status,
    content: event.content
  };
}
