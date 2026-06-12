# Nostr Classifieds Platform — Design

Working name: **noteds** (Nostr "notes" + classifieds). Can be renamed before repo creation.

## 1. Overview & Architecture

A Nostr-based classifieds web app implementing NIP-99 listings, with relay-side
tag filtering for category and location search. Built as a SvelteKit static
site, mirroring the stack and Nostr infrastructure of the existing `wikistr`
project so auth code can be reused directly.

**Stack**:
- SvelteKit + `adapter-static` (static deploy, no backend server)
- `@nostr/tools` for event signing/encoding (NIP-04/NIP-44/NIP-19)
- `applesauce-core` (EventStore), `applesauce-relay` (RelayPool),
  `applesauce-loaders` (address loader) for relay communication
- `idb-keyval` for local persistence (drafts, account cache)
- Tailwind for styling

**Scope for this phase**: a working web client covering login, browsing/searching
listings, creating/publishing listings (with drafts), and contacting sellers via DM.
Out of scope for this phase: Lightning/Zap payments, moderation/reputation systems,
a dedicated marketplace relay, NIP-15 stalls/inventory.

**UI/UX**: Mobile-first responsive layouts (cards stack on mobile, grid on
desktop), modern clean styling via Tailwind, Svelte transitions for page
navigation, list filtering (`animate:flip`), and modals (scale/fade).

## 2. Auth & Identity

Ported from `wikistr`'s `src/lib/passkeyIdentity.ts` and `src/lib/nostr.ts`,
supporting three signer sources, tried in order:

1. **Passkey identity (primary)**: A Nostr keypair is generated or imported,
   then encrypted using a WebAuthn passkey's PRF extension output and stored
   in `localStorage`. Unlocking re-derives the encryption key via a passkey
   assertion, decrypts the nsec, and builds an in-memory signer for the
   session (kept in `sessionStorage` while unlocked).
2. **NIP-07 extension**: If `window.nostr` is already present (browser
   extension), use it directly.
3. **NIP-46 bunker**: If neither of the above is available, fall back to a
   remote signer connection using the NIP-46 APIs from `nostr-tools`.

A unified `signer` object exposes `getPublicKey`, `signEvent`, and
`nip04`/`nip44` encrypt/decrypt, used uniformly throughout the app regardless
of which signer source is active.

Account/profile state (via `loadNostrUser`) is reactive via a Svelte store and
cached in `idb-keyval` for fast reload. An `AuthGate` component wraps any
action that requires a signer, prompting the user to connect/unlock if none is
active.

## 3. Data Model (NIP-99)

**Published listing — `kind:30402`**:
```json
{
  "kind": 30402,
  "tags": [
    ["d", "<uuid>"],
    ["title", "..."],
    ["summary", "..."],
    ["price", "250", "USD"],
    ["location", "Downtown Austin, TX"],
    ["g", "9q8yy"],
    ["t", "bicycles"],
    ["image", "<url>"],
    ["status", "active"]
  ],
  "content": "Markdown description..."
}
```

**Draft — `kind:30403`**: same shape, same `d` tag, written/updated while
editing. Publishing replaces the draft with a `kind:30402` event sharing the
same `d` tag (so it remains editable as a replaceable event).

**Geohash (`g` tag)**: derived from a location pick (map widget or geocoded
location text) via a geohash library, encoded at fixed precision (6
characters) for proximity search.

**Local state**:
- Drafts cached in `idb-keyval`, mirroring relay-stored `kind:30403` events
- Relay list (curated defaults + user-added custom relays) in `localStorage`,
  following wikistr's `custom-relays` pattern
- Search/filter state synced to URL query params (shareable/bookmarkable)

## 4. Pages & Components

- **`/` — Feed**: Responsive grid/list of listing cards (image, title, price,
  location, category). Subscribes to `kind:30402` events with increasing time
  windows for "load more" / infinite scroll.
- **`/listing/[naddr]`** — Listing detail: full markdown description, image
  gallery, price/location/category, seller profile, "Contact seller" (NIP-04
  DM).
- **`/create`** — Listing form: title, markdown description (editor +
  preview), price + currency, category (tag picker), location (text + map
  picker → geohash), image upload (NIP-96/Blossom). Save Draft / Publish
  actions.
- **`/drafts`** — User's `kind:30403` drafts; edit or publish.
- **`/my-listings`** — User's published listings; edit or mark sold (`status`
  tag).
- **`/settings`** — Auth management (passkey/extension/bunker), relay list
  management.
- **Search/filter bar** (sticky, on feed): keyword text input, category
  dropdown, "near me" toggle (geolocation → geohash prefix filter with
  adjustable radius).

**Shared components**: `ListingCard`, `ListingForm`, `SearchBar`,
`RelayManager`, `AuthGate`, `ImageUploader`.

## 5. Search

- **Category filter**: relay-side, `{ kinds: [30402], '#t': [category] }`.
- **Proximity filter**: relay-side, `{ '#g': [geohashPrefix] }`, with
  adjustable prefix length controlling search radius.
- **Keyword filter**: client-side substring match over title/summary/content
  on the in-memory `EventStore` results, debounced.
- All filters combine with AND logic; filter state syncs to URL query params.

## 6. Image Upload (NIP-96/Blossom)

`ImageUploader` lets the user pick a file and uploads it to a configurable
Blossom server (default: a known public server, overridable in settings),
authorizing the upload via a NIP-98 signed auth event using the active signer.
On success, the returned URL is added as an `image` tag (multiple images
supported; the first is the card thumbnail). Upload failures are shown inline
and don't block saving the listing.

## 7. Error Handling

- **No active signer**: `AuthGate` shows a connect/unlock prompt instead of
  performing the action.
- **Relay failures**: per-relay errors are non-fatal; the pool continues with
  remaining relays. A banner/toast indicates degraded connectivity if all
  configured relays fail.
- **Upload failures**: inline error in `ImageUploader`; the listing can still
  be saved/published without that image.

## 8. Testing

- Unit tests (Vitest) for: geohash encoding, NIP-99 event/tag construction,
  signer logic with mocked WebAuthn/PRF.
- Manual end-to-end testing in-browser against public relays for
  publish/feed/search/DM flows.

## 9. Repo & Deployment

- New public GitHub repo under `imattau` (name TBD, default `noteds`),
  created via `gh repo create`.
- SvelteKit `adapter-static` build, deployable to any static host (e.g.
  GitHub Pages, Netlify, Vercel static).
