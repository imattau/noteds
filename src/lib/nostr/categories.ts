export const CATEGORY_TREE = {
  'For Sale': ['Electronics', 'Furniture', 'Home & Garden', 'Fashion', 'Baby & Kids', 'Books', 'Sports & Outdoors'],
  Jobs: ['Full-time', 'Part-time', 'Casual', 'Remote', 'Trades', 'Hospitality', 'Office'],
  Housing: ['Apartments', 'Houses', 'Rooms', 'Short-term', 'Commercial'],
  Services: ['Personal Services', 'Home Services', 'Cleaning', 'Tutoring', 'Creative', 'Business Services'],
  'Personal Services': ['Massage', 'Beauty', 'Wellness', 'Companionship'],
  Vehicles: ['Cars', 'Motorcycles', 'Bicycles', 'Parts', 'Boats'],
  Community: ['Events', 'Lost & Found', 'Volunteers', 'Local News', 'Dating'],
  Pets: ['Dogs', 'Cats', 'Birds', 'Fish', 'Accessories'],
  Classes: ['Language', 'Music', 'Fitness', 'Computer', 'Tutoring'],
  Events: ['Concerts', 'Markets', 'Workshops', 'Sports', 'Meetups'],
  Dating: ['Casual', 'Friendship', 'Long-term', 'Marriage'],
  'Free Stuff': ['Furniture', 'Electronics', 'Books', 'Clothing']
} as const satisfies Record<string, readonly string[]>;

export type TopLevelCategory = keyof typeof CATEGORY_TREE;

export const TOP_LEVEL_CATEGORIES = Object.keys(CATEGORY_TREE) as TopLevelCategory[];

export function getSubcategories(category: TopLevelCategory): readonly string[] {
  return CATEGORY_TREE[category] ?? [];
}
