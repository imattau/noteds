# Android build (Tauri)

Noteds ships as an Android app by wrapping the existing SvelteKit static
build with [Tauri v2](https://v2.tauri.app/). There's no local Android
SDK/NDK in this project's dev environment, so all Android scaffolding and
packaging happens in CI (`.github/workflows/android.yml`). Locally, only the
desktop-level Tauri scaffold (`src-tauri/`) is used, e.g. to run
`cargo check` or regenerate icons — never `tauri android build`.

The generated Gradle/Android Studio project (`src-tauri/gen/android`) is
**not committed**. CI runs `tauri android init` fresh on every run; any
Android customization (permissions, SDK versions, app icon) should go
through `src-tauri/tauri.conf.json`, not hand-edited generated files.

Tauri serves the SvelteKit static build from `../build` (the
`adapter-static` output). That build normally gets a `/noteds` base path
when `GITHUB_ACTIONS=true` (for the GitHub Pages deploy), which would break
asset loading inside the Tauri WebView — so the app uses a dedicated
`npm run build:tauri` script that forces `BASE_PATH=` before invoking Vite.
`src-tauri/tauri.conf.json`'s `beforeBuildCommand` calls this automatically;
no separate "build frontend" CI step is needed.

## Triggering a build

- **Debug APK**: automatic on every push to `main`, or manually via
  Actions → "Android build" → "Run workflow" (leave `release` unchecked).
- **Signed release (APK + AAB)**: Actions → "Android build" → "Run workflow"
  with `release` checked, or push a `v*` tag (e.g. `v0.1.0`), which also
  attaches the build to a GitHub Release.

Download artifacts from the workflow run's "Artifacts" section (or from the
Release page for tagged builds).

## Signing secrets

The release job needs these repo secrets:

- `ANDROID_KEYSTORE_BASE64` — the release keystore, base64-encoded
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Noteds reuses the same signing key already used for
[imattau/scrollstr](https://github.com/imattau/scrollstr) and
[imattau/Mangatsu](https://github.com/imattau/Mangatsu) — copy those secret
values into this repo rather than generating a new keystore:

```bash
gh secret set ANDROID_KEYSTORE_BASE64 --repo imattau/noteds < keystore.b64
gh secret set ANDROID_KEYSTORE_PASSWORD --repo imattau/noteds
gh secret set ANDROID_KEY_ALIAS --repo imattau/noteds
gh secret set ANDROID_KEY_PASSWORD --repo imattau/noteds
```

GitHub secrets can't be read back once set (by anyone, including tooling),
so the actual keystore/passwords need to come from wherever they were
originally saved (password manager, the `.keystore`/`.jks` file itself),
not from `gh secret list`, which only shows secret *names*.

To generate a brand new keystore instead (only if the shared key shouldn't
be reused after all):

```bash
keytool -genkeypair -v -keystore release.keystore -alias noteds \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore > keystore.b64
```

## Zapstore release

Tag pushes (`v*`) also broadcast the release to [Zapstore](https://zapstore.dev/)
(a Nostr-based app store) using [`zsp`](https://github.com/zapstore/zsp),
configured via [`zapstore.yaml`](../zapstore.yaml) at the repo root. This
mirrors the [imattau/scrollstr](https://github.com/imattau/scrollstr) and
[imattau/Mangatsu](https://github.com/imattau/Mangatsu) setups and reuses
their `ZAPSTORE_NSEC` — the same publisher identity is used across all
three apps, so followers of one on Zapstore can discover the others.

Required secret: `ZAPSTORE_NSEC` (the publisher's Nostr private key, used to
sign the release announcement event).

- Automatic: any `v*` tag push builds the signed release, attaches it to a
  GitHub Release, and immediately broadcasts it to Zapstore relays.
- Manual re-broadcast without a new tag: `workflow_dispatch` with `release:
  true` and `publish_to_zapstore: true`.
- The `Validate Zapstore config` step (`zsp publish --check zapstore.yaml`)
  runs on every release build regardless of trigger, so config mistakes
  surface even on ad-hoc runs that don't actually publish. Until the first
  tagged release exists, this check fails with a `source_failed` error
  because it can't find a GitHub Release yet — that's expected and resolves
  itself once `v0.1.0` (or similar) is tagged for the first time.

## Known smoke-test checklist (first real device install)

These aren't blockers for the CI/build setup, but should be verified on an
actual Android device/emulator before relying on the app day-to-day:

- **Signer App (Amber/NIP-55) login**: on the Android build, `isTauri()`
  (`src/lib/platform.ts`) hides the NIP-07 extension and passkey login
  options — neither works reliably inside Tauri's Android WebView — and
  shows "Signer App" instead. That path launches Amber via a custom native
  plugin (`src-tauri/tauri-plugin-amber-opener`) rather than the
  `intent://` trick browsers use, because Amber requires the launching
  Intent to carry `Browser.EXTRA_APPLICATION_ID`, which only a real browser
  sets. Confirm on a real device: Amber launches, returns control to
  noteds, and the pubkey/signature comes back correctly via the OS
  clipboard (`@tauri-apps/plugin-clipboard-manager`, not the Web Clipboard
  API — `navigator.clipboard.readText()` is unreliable inside the WebView).
  See `src/lib/nostr/tauriAmberSigner.ts`. This is ported from
  [imattau/Mangatsu](https://github.com/imattau/Mangatsu)'s working
  implementation but hasn't been verified against noteds' own build yet.
- **OPFS availability**: the local browse graph
  ([Polypack](https://github.com/0xx0lostcause0xx0/polypack)) persists to
  OPFS when available and falls back to memory otherwise — confirm which
  path Android's WebView takes and that the in-memory fallback performs
  acceptably if OPFS isn't supported there.
- **WebGPU/WASM embeddings**: the browser embedding provider tries WebGPU
  first, then WASM, then the deterministic local baseline — confirm at
  least one of these loads inside the Android WebView rather than always
  falling back.
- **Relay connectivity (WebSocket)**: confirm `wss://` connections to
  configured relays aren't blocked by the WebView's network stack or the
  app's CSP (`connect-src` in `src-tauri/tauri.conf.json`).
