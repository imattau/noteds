# Changelog

All notable changes to Noteds are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and each version's
section is used as its release notes on GitHub and Zapstore.

## [0.1.8] - 2026-10-03

### Fixed
- Publishing a listing from the Android app no longer fails with "can't
  serialize event with wrong or missing properties". The price is now always
  sent as text.

## [0.1.7] - 2026-10-03

### Fixed
- The Android app no longer slows down the whole device after launch. The
  search model now loads on your first keyword search instead of at startup,
  and runs on the CPU rather than the GPU.

## [0.1.6] - 2026-10-03

### Added
- Your seller rating now shows under Account in Settings.
- Categories can load listings older than the 90-day feed: "Show more"
  reveals what's loaded, then "Load older listings" pages further back.

### Changed
- Profile, review and listing lookups finish as soon as most relays answer,
  instead of waiting on a slow or offline relay (up to about 4 seconds faster).
- Seller profiles load in batches and are cached, refreshing quietly in the
  background once a day.
- My Listings fetches your listings and listing index at the same time.

### Fixed
- A deletion now only hides a listing when the listing's own author issued it.
  Previously anyone could hide another seller's listing.
- A listing the seller republishes after deleting it shows again.

## [0.1.5] - 2026-10-03

### Changed
- Much less relay traffic: the feed no longer refetches on every search edit,
  and only listing deletions are downloaded instead of every deletion on Nostr.
- Lower memory and storage churn from the local listing cache.
- Semantic search loads in the background at startup, and devices that can't
  run it on the GPU go straight to the CPU fallback on later launches.
- Default relays are now relay.damus.io, nos.lol, relay.primal.net and
  offchain.pub. The offline relay.nostr.band was removed, and purplepag.es is
  only used for profile lookups.

### Fixed
- Category "Load more" now pages through listings instead of narrowing them.
- Listings deleted from My Listings also disappear from the listing page.

## [0.1.4] - 2026-10-03

### Changed
- Signing with Amber uses the native NIP-55 flow instead of clipboard round
  trips.
