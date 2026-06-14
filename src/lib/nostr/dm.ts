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

export function buildDirectMessageEvent(
  recipientPubkey: string,
  ciphertext: string,
  extraTags: string[][] = []
): EventTemplate {
  return {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey], ...extraTags],
    content: ciphertext
  };
}

export async function sendDirectMessage(
  recipientPubkey: string,
  message: string,
  extraTags: string[][] = []
): Promise<void> {
  const ciphertext = await signer.nip04.encrypt(recipientPubkey, message);
  const template = buildDirectMessageEvent(recipientPubkey, ciphertext, extraTags);
  const event = await signer.signEvent(template);
  await relayPool.publish(getActiveRelays(), event);
}

export async function decryptDM(event: NostrEvent, userPubkey: string): Promise<DecryptedDM | null> {
  try {
    const isSender = event.pubkey === userPubkey;
    const recipient = event.tags.find(([t]) => t === 'p')?.[1] || '';
    const peerPubkey = isSender ? recipient : event.pubkey;
    if (!peerPubkey) return null;

    const plaintext = await signer.nip04.decrypt(peerPubkey, event.content);
    const listingCoordinate = event.tags.find(([t]) => t === 'a')?.[1];
    const app = event.tags.find(([t]) => t === 'client' || t === 'app')?.[1];

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
