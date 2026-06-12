import { TOP_LEVEL_CATEGORIES, getSubcategories, type TopLevelCategory } from './categories';
import type { ListingFilters } from './searchParams';
import type { ListingInput } from './listings';

export interface BrowseItem {
  listing: ListingInput;
  created_at: number;
  eventId: string;
  pubkey: string;
}

export interface CategoryBrowseEntry {
  category: TopLevelCategory;
  totalCount: number;
  subcategories: Array<{ value: string; count: number }>;
}

function matchesKeyword(item: BrowseItem, keyword: string) {
  const needle = keyword.toLowerCase();
  return (
    item.listing.title.toLowerCase().includes(needle) ||
    item.listing.summary.toLowerCase().includes(needle) ||
    item.listing.content.toLowerCase().includes(needle) ||
    (item.listing.location ?? '').toLowerCase().includes(needle)
  );
}

function matchesLocation(item: BrowseItem, location: string) {
  const needle = location.toLowerCase();
  return (item.listing.location ?? '').toLowerCase().includes(needle);
}

function matchesGeohash(item: BrowseItem, geohashPrefix: string) {
  return item.listing.geohash?.startsWith(geohashPrefix) ?? false;
}

// A geocoded location selection sets both `location` (display text) and
// `geohashPrefix`, but listings often populate only one of `location`/`geohash`.
// Requiring both would wrongly exclude items that match on just one dimension.
function matchesLocationFilters(item: BrowseItem, filters: ListingFilters) {
  if (!filters.location && !filters.geohashPrefix) {
    return true;
  }
  if (filters.location && matchesLocation(item, filters.location)) {
    return true;
  }
  if (filters.geohashPrefix && matchesGeohash(item, filters.geohashPrefix)) {
    return true;
  }
  return false;
}

function matchesCategories(item: BrowseItem, categories: string[]) {
  return categories.every((category) => item.listing.categories.includes(category));
}

function matchesSubcategories(item: BrowseItem, subcategories: string[]) {
  return subcategories.every((entry) =>
    item.listing.subcategories?.some((subcategory) => `${subcategory.parent}::${subcategory.value}` === entry)
  );
}

export function buildBrowseCounts(items: BrowseItem[], filters: ListingFilters, categoryScope?: string) {
  const filteredItems: BrowseItem[] = [];

  for (const item of items) {
    if (filters.keyword && !matchesKeyword(item, filters.keyword)) {
      continue;
    }
    if (!matchesLocationFilters(item, filters)) {
      continue;
    }
    if (categoryScope && !item.listing.categories.includes(categoryScope)) {
      continue;
    }

    filteredItems.push(item);
  }

  const categoryCounts = new Map<string, number>();
  const subcategoryCounts = new Map<string, Map<string, number>>();

  for (const item of filteredItems) {
    const categories = item.listing.categories;
    const subcategories = item.listing.subcategories ?? [];

    for (const category of categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }

    for (const subcategory of subcategories) {
      if (!subcategoryCounts.has(subcategory.parent)) {
        subcategoryCounts.set(subcategory.parent, new Map<string, number>());
      }

      const parentCounts = subcategoryCounts.get(subcategory.parent)!;
      parentCounts.set(subcategory.value, (parentCounts.get(subcategory.value) ?? 0) + 1);
    }
  }

  const selectedItems = filters.categories?.length
    ? filteredItems.filter((item) => matchesCategories(item, filters.categories ?? []))
    : filteredItems;

  const fullyFilteredItems = filters.subcategories?.length
    ? selectedItems.filter((item) => matchesSubcategories(item, filters.subcategories ?? []))
    : selectedItems;

  const categoryBrowseEntries: CategoryBrowseEntry[] = TOP_LEVEL_CATEGORIES.map((category) => {
    const parentCounts = subcategoryCounts.get(category) ?? new Map<string, number>();
    return {
      category,
      totalCount: categoryCounts.get(category) ?? 0,
      subcategories: getSubcategories(category).map((value) => ({
        value,
        count: parentCounts.get(value) ?? 0
      }))
    };
  });

  return {
    filteredItems,
    selectedItems: fullyFilteredItems,
    categoryBrowseEntries
  };
}
