import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { getActiveRelays } from './relays';
import { relayPool } from './runtime';
import { signer } from './signer';
import { collectEvents } from './requestEvents';

export interface DecryptedDM {
  id: string;
  sender: string;
  recipient: string;
  ciphertext: string;
  plaintext: string;
  created_at: number;
  listingCoordinate?: string; // e.g. 30402:pubkey:d-tag
  app?: string;
  tags: string[][];
}

interface DMContentPayload {
  client?: string;
  listing?: string;
  text: string;
}

export function buildDirectMessageEvent(
  recipientPubkey: string,
  ciphertext: string
): EventTemplate {
  return {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: ciphertext
  };
}

export async function sendDirectMessage(
  recipientPubkey: string,
  message: string,
  metadata?: { client?: string; listing?: string }
): Promise<void> {
  const payload: DMContentPayload = {
    ...metadata,
    text: message
  };
  const plaintext = JSON.stringify(payload);
  const ciphertext = await signer.nip04.encrypt(recipientPubkey, plaintext);
  const template = buildDirectMessageEvent(recipientPubkey, ciphertext);
  const event = await signer.signEvent(template);
  await relayPool.publish(getActiveRelays(), event);
}

export async function decryptDM(event: NostrEvent, userPubkey: string): Promise<DecryptedDM | null> {
  try {
    const isSender = event.pubkey === userPubkey;
    const recipient = event.tags.find(([t]) => t === 'p')?.[1] || '';
    const peerPubkey = isSender ? recipient : event.pubkey;
    if (!peerPubkey) return null;

    const decryptedRaw = await signer.nip04.decrypt(peerPubkey, event.content);
    let plaintext = decryptedRaw;
    let listingCoordinate: string | undefined = undefined;
    let app: string | undefined = undefined;

    try {
      const parsed = JSON.parse(decryptedRaw) as DMContentPayload;
      if (parsed && typeof parsed === 'object' && 'text' in parsed) {
        plaintext = parsed.text;
        listingCoordinate = parsed.listing;
        app = parsed.client;
      }
    } catch {
      // Graceful fallback for non-JSON or external client DMs
    }

    return {
      id: event.id,
      sender: event.pubkey,
      recipient,
      ciphertext: event.content,
      plaintext,
      created_at: event.created_at,
      listingCoordinate,
      app,
      tags: event.tags
    };
  } catch (err) {
    console.error('Failed to decrypt DM', event.id, err);
    return null;
  }
}

export async function fetchDecryptedDMs(userPubkey: string): Promise<DecryptedDM[]> {
  const events = (await collectEvents(
    relayPool.request(getActiveRelays(), [
      { kinds: [4], authors: [userPubkey] },
      { kinds: [4], '#p': [userPubkey] }
    ]),
    5000
  )) as NostrEvent[];

  const decrypted: DecryptedDM[] = [];
  for (const event of events) {
    const decryptedEvent = await decryptDM(event, userPubkey);
    if (decryptedEvent) {
      decrypted.push(decryptedEvent);
    }
  }

  // Sort newest first
  return decrypted.sort((a, b) => b.created_at - a.created_at);
}
