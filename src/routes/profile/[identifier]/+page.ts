import { error } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';

function decodeProfileIdentifier(identifier: string): string {
  if (/^[0-9a-f]{64}$/.test(identifier)) {
    return identifier;
  }

  const decoded = nip19.decode(identifier);
  if (decoded.type === 'npub') {
    return decoded.data;
  }

  if (decoded.type === 'nprofile') {
    return decoded.data.pubkey;
  }

  throw error(404, 'Invalid profile address');
}

export const load: PageLoad = ({ params }) => {
  try {
    const pubkey = decodeProfileIdentifier(params.identifier);
    return {
      pubkey,
      npub: nip19.npubEncode(pubkey)
    };
  } catch {
    throw error(404, 'Invalid profile address');
  }
};
