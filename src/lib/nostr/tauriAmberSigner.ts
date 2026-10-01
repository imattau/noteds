import { nip19, type Event, type EventTemplate } from 'nostr-tools';
import { getEventHash, verifyEvent } from 'nostr-tools/pure';

/**
 * NIP-55 (Amber) signer for the Tauri Android build.
 *
 * The standard browser integration for NIP-55 signer apps launches them via
 * `window.open('intent://...#Intent;scheme=nostrsigner;...;end')`, which is
 * Chrome-specific `intent://` syntax. Tauri's Android WebView doesn't
 * resolve that and fails with ERR_UNKNOWN_URL_SCHEME.
 *
 * Launching the plain `nostrsigner:` scheme via Tauri's stock opener plugin
 * gets past that, but Amber then rejects the request as malformed: per
 * https://github.com/nostr-protocol/nips/blob/master/55.md, Amber only
 * parses request parameters from the URL's own query string when the
 * launching Intent carries the `Browser.EXTRA_APPLICATION_ID` extra — the
 * marker a real browser sets when it resolves an `intent://` link. Without
 * it, Amber assumes a native-app request and looks for parameters as Intent
 * extras instead, finds none, and rejects it. Tauri's opener plugin has no
 * way to attach that extra, so this uses a small custom plugin
 * (tauri-plugin-amber-opener, see src-tauri/tauri-plugin-amber-opener) that
 * builds the Intent with it — then reads the result back from the clipboard
 * the same way, once the app regains focus.
 */
function buildNostrSignerUri(
  content: string | null,
  params: Record<string, string | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const base = content ? `nostrsigner:${encodeURIComponent(content)}` : 'nostrsigner:';
  return `${base}?${search.toString()}`;
}

function isHexKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function isHexSignature(value: string): boolean {
  return /^[0-9a-f]{128}$/i.test(value);
}

/**
 * Package name of Amber, whose content provider authorities are
 * `<package>.<REQUEST_TYPE>` (NIP-55 content resolver method).
 */
const SIGNER_PACKAGE = 'com.greenart7c3.nostrsigner';

/**
 * Permissions requested up front on get_public_key so the signer can offer
 * to remember them, letting later requests run via the content resolver.
 */
const REQUESTED_PERMISSIONS = JSON.stringify([
  { type: 'sign_event' },
  { type: 'nip04_encrypt' },
  { type: 'nip04_decrypt' },
  { type: 'nip44_encrypt' },
  { type: 'nip44_decrypt' }
]);

interface SignerQueryResult {
  status: 'ok' | 'rejected' | 'unavailable';
  result?: string;
}

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

export class TauriAmberSigner {
  pubkey?: string;

  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };

  private pendingRequest: PendingRequest | null = null;
  // Intent requests switch to the signer app and read the answer back from
  // the clipboard, so only one can be in flight at a time.
  private intentQueue: Promise<unknown> = Promise.resolve();

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.nip04 = { encrypt: this.nip04Encrypt.bind(this), decrypt: this.nip04Decrypt.bind(this) };
    this.nip44 = { encrypt: this.nip44Encrypt.bind(this), decrypt: this.nip44Decrypt.bind(this) };
  }

  private onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    if (!this.pendingRequest) return;
    setTimeout(() => {
      // navigator.clipboard.readText() is gated by the WebView's own
      // permission model (often denied there even though the page never
      // prompts for it) — Tauri's native clipboard plugin reads the OS
      // clipboard directly instead.
      import('@tauri-apps/plugin-clipboard-manager')
        .then(({ readText }) => readText())
        .then((result) => this.pendingRequest?.resolve(result ?? ''))
        .catch((error) => this.pendingRequest?.reject(error));
    }, 200);
  };

  /** Removes the visibilitychange listener; call on logout. */
  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private requestViaIntent(uri: string): Promise<string> {
    const run = async (): Promise<string> => {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await new Promise<string>((resolve, reject) => {
        this.pendingRequest = { resolve, reject };
        invoke('plugin:amber-opener|open_amber_url', { url: uri }).catch(reject);
      }).finally(() => {
        this.pendingRequest = null;
      });
      if (result.length === 0) throw new Error('Empty clipboard');
      return result;
    };
    const next = this.intentQueue.then(run, run);
    this.intentQueue = next.catch(() => undefined);
    return next;
  }

  /**
   * Asks the signer's content provider to handle the request in the
   * background. Succeeds only when the user chose "remember my choice" in
   * the signer; returns null otherwise so the caller can use the intent flow.
   */
  private async requestViaProvider(
    type: string,
    payload: string,
    peerPubkey = ''
  ): Promise<string | null> {
    if (!this.pubkey) return null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const response = await invoke<SignerQueryResult>('plugin:amber-opener|query_signer', {
        uri: `content://${SIGNER_PACKAGE}.${type}`,
        args: [payload, peerPubkey, this.pubkey]
      });
      return response?.status === 'ok' && response.result ? response.result : null;
    } catch {
      return null;
    }
  }

  private async request(
    uri: string,
    provider?: { type: string; payload: string; peerPubkey?: string }
  ): Promise<string> {
    if (provider) {
      const silent = await this.requestViaProvider(provider.type, provider.payload, provider.peerPubkey);
      if (silent) return silent;
    }
    return this.requestViaIntent(uri);
  }

  async getPublicKey(): Promise<string> {
    if (this.pubkey) return this.pubkey;
    const uri = buildNostrSignerUri(null, {
      type: 'get_public_key',
      compressionType: 'none',
      returnType: 'signature',
      permissions: REQUESTED_PERMISSIONS
    });
    const result = await this.requestViaIntent(uri);
    if (isHexKey(result)) {
      this.pubkey = result;
      return result;
    }
    if (result.startsWith('npub') || result.startsWith('nprofile')) {
      const decoded = nip19.decode(result);
      const pubkey = decoded.type === 'npub' ? decoded.data : decoded.type === 'nprofile' ? decoded.data.pubkey : null;
      if (!pubkey) throw new Error('Expected npub or nprofile from clipboard');
      this.pubkey = pubkey;
      return pubkey;
    }
    throw new Error('Expected clipboard to have pubkey');
  }

  async signEvent(draft: EventTemplate): Promise<Event> {
    const pubkey = this.pubkey || (await this.getPublicKey());
    const draftWithId = { ...draft, id: getEventHash({ ...draft, pubkey }) };
    const uri = buildNostrSignerUri(JSON.stringify(draftWithId), {
      type: 'sign_event',
      current_user: pubkey,
      compressionType: 'none',
      returnType: 'signature'
    });
    const sig = await this.request(uri, {
      type: 'SIGN_EVENT',
      payload: JSON.stringify(draftWithId)
    });
    if (!isHexSignature(sig)) throw new Error('Expected hex signature');
    const event = { ...draftWithId, sig, pubkey };
    if (!verifyEvent(event)) throw new Error('Invalid signature');
    return event;
  }

  private cryptoRequest(
    type: 'nip04_encrypt' | 'nip04_decrypt' | 'nip44_encrypt' | 'nip44_decrypt',
    pubkey: string,
    content: string
  ): Promise<string> {
    const uri = buildNostrSignerUri(content, {
      type,
      pubKey: pubkey,
      current_user: this.pubkey,
      compressionType: 'none',
      returnType: 'signature'
    });
    return this.request(uri, { type: type.toUpperCase(), payload: content, peerPubkey: pubkey });
  }

  nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.cryptoRequest('nip04_encrypt', pubkey, plaintext);
  }

  nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.cryptoRequest('nip04_decrypt', pubkey, ciphertext);
  }

  nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.cryptoRequest('nip44_encrypt', pubkey, plaintext);
  }

  nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.cryptoRequest('nip44_decrypt', pubkey, ciphertext);
  }
}
