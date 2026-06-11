import { error } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

export const load: PageLoad = ({ params }) => {
  let decoded;
  try {
    decoded = nip19.decode(params.naddr);
  } catch {
    throw error(404, 'Invalid listing address');
  }

  if (decoded.type !== 'naddr') {
    throw error(404, 'Invalid listing address');
  }

  const { kind, pubkey, identifier } = decoded.data;
  return { kind, pubkey, identifier };
};
