import { nip19, type Event, type EventTemplate } from 'nostr-tools';
import { getEventHash, verifyEvent } from 'nostr-tools/pure';

/**
 * NIP-55 (Amber) signer for the Tauri Android build.
 *
 * Requests go through a small custom plugin (tauri-plugin-amber-opener, see
 * src-tauri/tauri-plugin-amber-opener) that talks to the signer the way
 * native Android apps do, per
 * https://github.com/nostr-protocol/nips/blob/master/55.md:
 *
 * - once the signer's package is known (returned by get_public_key), each
 *   request first tries the signer's ContentResolver endpoint, which answers
 *   silently — no app switch — when the user has remembered the permission;
 * - otherwise the signer is launched with startActivityForResult and the
 *   result comes back in the returned Intent.
 *
 * This replaced the web-app flow (nostrsigner: URL + clipboard read on
 * refocus), which popped "copied"/"pasted from clipboard" toasts for every
 * single decrypt and could pick up a stale clipboard value when a request
 * was dismissed.
 */

export interface AmberSession {
  pubkey: string;
  signerPackage?: string;
}

export class SignerRejectedError extends Error {
  constructor(message = 'Signer rejected the request') {
    super(message);
    this.name = 'SignerRejectedError';
  }
}

interface SignerRequest {
  type: string;
  content?: string;
  pubkey?: string;
  currentUser?: string;
  id?: string;
  signerPackage?: string;
  permissions?: string;
}

interface SignerResponse {
  result: string;
  package?: string | null;
  event?: string | null;
}

// Asked for up front on login so the user can approve them once in the
// signer, after which requests are answered silently via ContentResolver.
const LOGIN_PERMISSIONS = JSON.stringify([
  { type: 'sign_event' },
  { type: 'nip44_encrypt' },
  { type: 'nip44_decrypt' },
  { type: 'nip04_encrypt' },
  { type: 'nip04_decrypt' }
]);

function isHexKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function isHexSignature(value: string): boolean {
  return /^[0-9a-f]{128}$/i.test(value);
}

function isRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rejected|REJECTED/.test(message);
}

export class TauriAmberSigner {
  pubkey?: string;
  signerPackage?: string;

  /** Called whenever the pubkey or signer package changes, so it can be persisted. */
  onSessionChange?: (session: AmberSession) => void;

  nip04: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };
  nip44: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  };

  // Signer requests are serialized: the signer app handles one launched
  // request at a time, and a second launch would replace the first.
  private queue: Promise<unknown> = Promise.resolve();
  private requestCounter = 0;
  private destroyed = false;

  constructor(session?: AmberSession | null) {
    this.pubkey = session?.pubkey;
    this.signerPackage = session?.signerPackage;
    this.nip04 = { encrypt: this.nip04Encrypt.bind(this), decrypt: this.nip04Decrypt.bind(this) };
    this.nip44 = { encrypt: this.nip44Encrypt.bind(this), decrypt: this.nip44Decrypt.bind(this) };
  }

  /** Rejects any further requests; call on logout. */
  destroy(): void {
    this.destroyed = true;
  }

  private request(request: SignerRequest): Promise<SignerResponse> {
    const run = async (): Promise<SignerResponse> => {
      if (this.destroyed) throw new Error('Signer session ended');
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        return await invoke<SignerResponse>('plugin:amber-opener|signer_request', {
          request: {
            ...request,
            id: `noteds-${Date.now()}-${++this.requestCounter}`,
            signerPackage: this.signerPackage
          }
        });
      } catch (error) {
        if (isRejection(error)) throw new SignerRejectedError();
        throw error instanceof Error ? error : new Error(String(error));
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private notifySessionChange(): void {
    if (this.pubkey) {
      this.onSessionChange?.({ pubkey: this.pubkey, signerPackage: this.signerPackage });
    }
  }

  async getPublicKey(): Promise<string> {
    if (this.pubkey) return this.pubkey;
    const response = await this.request({ type: 'get_public_key', permissions: LOGIN_PERMISSIONS });
    const result = response.result;
    let pubkey: string | null = null;
    if (isHexKey(result)) {
      pubkey = result.toLowerCase();
    } else if (result.startsWith('npub') || result.startsWith('nprofile')) {
      const decoded = nip19.decode(result);
      pubkey = decoded.type === 'npub' ? decoded.data : decoded.type === 'nprofile' ? decoded.data.pubkey : null;
    }
    if (!pubkey) throw new Error('Signer did not return a public key');
    this.pubkey = pubkey;
    if (response.package) this.signerPackage = response.package;
    this.notifySessionChange();
    return pubkey;
  }

  async signEvent(draft: EventTemplate): Promise<Event> {
    const pubkey = this.pubkey || (await this.getPublicKey());
    const draftWithId = { ...draft, pubkey, id: getEventHash({ ...draft, pubkey }) };
    const response = await this.request({
      type: 'sign_event',
      content: JSON.stringify(draftWithId),
      currentUser: pubkey
    });
    const sig = response.result;
    if (!isHexSignature(sig)) throw new Error('Expected hex signature');
    const event = { ...draftWithId, sig };
    if (!verifyEvent(event)) throw new Error('Invalid signature');
    return event;
  }

  private async cipherRequest(type: string, peerPubkey: string, content: string): Promise<string> {
    const currentUser = this.pubkey || (await this.getPublicKey());
    const response = await this.request({ type, content, pubkey: peerPubkey, currentUser });
    return response.result;
  }

  nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.cipherRequest('nip04_encrypt', pubkey, plaintext);
  }

  nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.cipherRequest('nip04_decrypt', pubkey, ciphertext);
  }

  nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.cipherRequest('nip44_encrypt', pubkey, plaintext);
  }

  nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.cipherRequest('nip44_decrypt', pubkey, ciphertext);
  }
}
