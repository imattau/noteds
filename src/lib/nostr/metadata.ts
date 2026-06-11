import { nip19 } from 'nostr-tools';

export interface NostrUser {
  pubkey: string;
  npub: string;
  metadata: {
    name?: string;
    display_name?: string;
    picture?: string;
  } | null;
}

export async function loadNostrUser(pubkey: string): Promise<NostrUser> {
  return {
    pubkey,
    npub: nip19.npubEncode(pubkey),
    metadata: null
  };
}
