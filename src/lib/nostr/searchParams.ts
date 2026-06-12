export interface ListingFilters {
  keyword?: string;
  location?: string;
  categories?: string[];
  subcategories?: string[];
  geohashPrefix?: string;
}

export function parseFiltersFromSearchParams(params: URLSearchParams): ListingFilters {
  const filters: ListingFilters = {};

  const keyword = params.get('q');
  if (keyword) {
    filters.keyword = keyword;
  }

  const location = params.get('loc');
  if (location) {
    filters.location = location;
  }

  const cat = params.get('cat');
  if (cat) {
    const categories = cat.split(',').filter((category) => category.length > 0);
    if (categories.length > 0) {
      filters.categories = categories;
    }
  }

  const sub = params.get('sub');
  if (sub) {
    const subcategories = sub.split(',').filter((subcategory) => subcategory.length > 0);
    if (subcategories.length > 0) {
      filters.subcategories = subcategories;
    }
  }

  const geo = params.get('geo');
  if (geo) {
    filters.geohashPrefix = geo;
  }

  return filters;
}

export function filtersToSearchParams(filters: ListingFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set('q', filters.keyword);
  }
  if (filters.location) {
    params.set('loc', filters.location);
  }
  if (filters.categories?.length) {
    params.set('cat', filters.categories.join(','));
  }
  if (filters.subcategories?.length) {
    params.set('sub', filters.subcategories.join(','));
  }
  if (filters.geohashPrefix) {
    params.set('geo', filters.geohashPrefix);
  }

  return params;
}
