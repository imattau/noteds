import { error } from '@sveltejs/kit';
import { TOP_LEVEL_CATEGORIES } from '$lib/nostr/categories';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  const category = params.category;

  if (!TOP_LEVEL_CATEGORIES.includes(category as (typeof TOP_LEVEL_CATEGORIES)[number])) {
    throw error(404, 'Unknown category');
  }

  return { category };
};
