import type { EventTemplate } from 'nostr-tools';
import { getActiveRelays } from './relays';
import { relayPool } from './runtime';
import { signer } from './signer';

export function buildDirectMessageEvent(recipientPubkey: string, ciphertext: string): EventTemplate {
  return {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: ciphertext
  };
}

export async function sendDirectMessage(recipientPubkey: string, message: string): Promise<void> {
  const ciphertext = await signer.nip04.encrypt(recipientPubkey, message);
  const template = buildDirectMessageEvent(recipientPubkey, ciphertext);
  const event = await signer.signEvent(template);
  await relayPool.publish(getActiveRelays(), event);
}
