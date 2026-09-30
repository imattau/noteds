import { isTauri } from '@tauri-apps/api/core';

/**
 * True when running as the Tauri-wrapped Android build. Browser extensions
 * (NIP-07) don't exist inside that WebView, and WebAuthn passkeys aren't
 * reliably supported there either — the Android build uses a NIP-55 signer
 * app (Amber) instead. Computed once; `isTauri()` reflects a static runtime
 * capability, not something that changes during the app's lifetime.
 */
export const isTauriApp = isTauri();
