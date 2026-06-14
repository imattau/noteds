<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { base } from '$app/paths';
  import AuthGate from '$components/AuthGate.svelte';
  import { account } from '$lib/nostr/signer';
  import { fetchDecryptedDMs, sendDirectMessage, getCachedDecryptedDMs, setCachedDecryptedDMs, type DecryptedDM } from '$lib/nostr/dm';
  import { getCachedBrowseItem } from '$lib/nostr/browseCache';
  import { loadNostrUser, type NostrUser } from '$lib/nostr/metadata';
  import type { ListingInput } from '$lib/nostr/listings';

  let messages = $state<DecryptedDM[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  // Active chat state derived from URL query parameters to support back button/navigation
  let activeThreadId = $derived(page.url.searchParams.get('thread'));
  let replyText = $state('');
  let sending = $state(false);

  // Cached listing and user metadata
  let listingCache = $state<Record<string, ListingInput>>({});
  let userCache = $state<Record<string, NostrUser>>({});

  // Local storage read tracker
  let lastReadMap = $state<Record<string, number>>({});

  // Parse a thread key for grouping messages: peerPubkey | coordinate
  interface Thread {
    id: string; // "peerPubkey" or "peerPubkey:coordinate"
    peerPubkey: string;
    listingCoordinate?: string;
    messages: DecryptedDM[];
    lastMessage: DecryptedDM;
    listing?: ListingInput;
    peer?: NostrUser;
    unread: boolean;
  }

  let threads = $derived.by<Thread[]>(() => {
    if (!$account) return [];
    const groups: Record<string, DecryptedDM[]> = {};

    for (const msg of messages) {
      const isSender = msg.sender === $account.pubkey;
      const peer = isSender ? msg.recipient : msg.sender;
      if (!peer) continue;

      // Group by peer and coordinate if coordinate exists, otherwise just peer
      const groupKey = msg.listingCoordinate ? `${peer}:${msg.listingCoordinate}` : peer;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(msg);
    }

    return Object.entries(groups).map(([groupKey, threadMsgs]) => {
      const sorted = [...threadMsgs].sort((a, b) => a.created_at - b.created_at);
      const lastMsg = sorted[sorted.length - 1];
      const parts = groupKey.split(':');
      const peerPubkey = parts[0];
      const listingCoordinate = parts.slice(1).join(':') || undefined;

      const lastRead = lastReadMap[groupKey] ?? 0;
      const hasUnread = lastMsg.sender !== $account.pubkey && lastMsg.created_at * 1000 > lastRead;

      return {
        id: groupKey,
        peerPubkey,
        listingCoordinate,
        messages: sorted,
        lastMessage: lastMsg,
        listing: listingCoordinate ? listingCache[listingCoordinate] : undefined,
        peer: userCache[peerPubkey],
        unread: hasUnread
      };
    }).sort((a, b) => b.lastMessage.created_at - a.lastMessage.created_at);
  });

  let activeThread = $derived(threads.find((t) => t.id === activeThreadId));

  async function loadData() {
    if (!$account) return;
    if (messages.length === 0) {
      loading = true;
    }
    error = null;

    try {
      // 1. Fetch DMs
      const fetched = await fetchDecryptedDMs($account.pubkey);
      messages = fetched;

      // 2. Load read timestamps from localStorage
      const readMap: Record<string, number> = {};
      for (const msg of fetched) {
        const isSender = msg.sender === $account.pubkey;
        const peer = isSender ? msg.recipient : msg.sender;
        const groupKey = msg.listingCoordinate ? `${peer}:${msg.listingCoordinate}` : peer;
        const key = `noteds:lastRead:${groupKey}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          readMap[groupKey] = Number(stored);
        }
      }
      lastReadMap = readMap;

      // 3. Fetch auxiliary metadata (listings & users)
      const uniqueCoordinates = [...new Set(fetched.map((m) => m.listingCoordinate).filter(Boolean) as string[])];
      const uniquePubkeys = [
        ...new Set([
          ...fetched.map((m) => m.sender),
          ...fetched.map((m) => m.recipient)
        ].filter((p) => p !== $account?.pubkey))
      ];

      // Load listings in background
      for (const coord of uniqueCoordinates) {
        const parts = coord.split(':');
        if (parts.length === 3) {
          const [, pubkey, dTag] = parts;
          void getCachedBrowseItem(pubkey, dTag).then((item) => {
            if (item) {
              listingCache = { ...listingCache, [coord]: item.listing };
            }
          });
        }
      }

      // Load users in background
      for (const pubkey of uniquePubkeys) {
        void loadNostrUser(pubkey).then((user) => {
          if (user) {
            userCache = { ...userCache, [pubkey]: user };
          }
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load messages.';
    } finally {
      loading = false;
    }
  }

  function markAsRead(threadId: string) {
    const now = Date.now();
    localStorage.setItem(`noteds:lastRead:${threadId}`, now.toString());
    lastReadMap = { ...lastReadMap, [threadId]: now };
  }

  $effect(() => {
    if (activeThreadId) {
      untrack(() => {
        markAsRead(activeThreadId);
      });
    }
  });

  $effect(() => {
    if ($account?.pubkey) {
      untrack(() => {
        const cached = getCachedDecryptedDMs($account.pubkey!);
        if (cached.length > 0) {
          messages = cached;
          loading = false;
        } else {
          loading = true;
        }
        void loadData();
      });
    }
  });

  async function handleSendReply() {
    if (!activeThread || !replyText.trim() || !$account) return;
    sending = true;

    try {
      await sendDirectMessage(activeThread.peerPubkey, replyText, {
        client: 'noteds',
        listing: activeThread.listingCoordinate
      });

      // Optimistically insert locally to event list
      const mockEvent: DecryptedDM = {
        id: crypto.randomUUID(),
        sender: $account.pubkey,
        recipient: activeThread.peerPubkey,
        ciphertext: '',
        plaintext: replyText,
        created_at: Math.floor(Date.now() / 1000),
        listingCoordinate: activeThread.listingCoordinate,
        app: 'noteds',
        tags: []
      };

      messages = [mockEvent, ...messages];
      setCachedDecryptedDMs($account.pubkey, messages);
      replyText = '';

      // Auto scroll to bottom
      setTimeout(() => {
        const container = document.getElementById('chat-scroll-container');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send reply.');
    } finally {
      sending = false;
    }
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function getInitials(user?: NostrUser, fallbackPubkey?: string): string {
    const label = user?.metadata?.display_name || user?.metadata?.name || fallbackPubkey || '';
    if (label.startsWith('npub')) return label.slice(0, 5).toUpperCase();
    return label.slice(0, 2).toUpperCase();
  }
</script>

<svelte:head>
  <title>Messages - noteds</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold text-slate-900">Messages</h1>
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
      onclick={loadData}
    >
      Refresh
    </button>
  </div>

  <AuthGate>
  {#if loading}
    <div class="flex h-[400px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <p class="text-sm text-slate-500">Loading your secure messages…</p>
    </div>
  {:else if error}
    <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
      <p class="text-sm font-medium text-rose-800">{error}</p>
    </div>
  {:else if threads.length === 0}
    <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div class="mx-auto flex max-w-md flex-col items-center text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-7 w-7">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
        </div>
        <h3 class="mt-4 text-base font-semibold text-slate-950">No conversations yet</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">Contact a seller on a listing card to start a thread. New conversations will appear here once the first message arrives.</p>
      </div>
    </div>
  {:else}
    <div class="grid min-h-[72vh] grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside class="flex flex-col border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
        <div class="border-b border-slate-200 bg-white px-4 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Inbox</p>
              <h2 class="mt-1 text-lg font-semibold text-slate-950">Conversations</h2>
            </div>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
              {threads.length}
            </span>
          </div>
          <p class="mt-2 text-xs leading-5 text-slate-500">Threads are grouped by seller and listing so the context stays attached to the conversation.</p>
        </div>

        <div class="flex-1 overflow-y-auto p-2">
          <div class="space-y-2">
            {#each threads as thread (thread.id)}
              <button
                type="button"
                class={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  activeThreadId === thread.id
                    ? 'border-slate-900 bg-white shadow-sm'
                    : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'
                }`}
                onclick={() => {
                  void goto(`?thread=${encodeURIComponent(thread.id)}`, { replaceState: true, noScroll: true });
                }}
              >
                <div class="flex items-start gap-3">
                  <div class="relative flex-shrink-0">
                    {#if thread.peer?.metadata?.picture}
                      <img
                        src={thread.peer.metadata.picture}
                        alt=""
                        class="h-11 w-11 rounded-2xl object-cover ring-1 ring-slate-200"
                      />
                    {:else}
                      <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-xs font-semibold text-white">
                        {getInitials(thread.peer, thread.peerPubkey)}
                      </div>
                    {/if}
                    {#if thread.unread}
                      <span class="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-teal-500"></span>
                    {/if}
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate text-sm font-semibold text-slate-950">
                        {thread.peer?.metadata?.display_name || thread.peer?.metadata?.name || thread.peerPubkey.slice(0, 8)}
                      </span>
                      <span class="shrink-0 text-[10px] text-slate-400 white-space-nowrap">
                        {formatDate(thread.lastMessage.created_at)}
                      </span>
                    </div>

                    {#if thread.listing}
                      <p class="mt-1 truncate text-xs font-medium text-slate-500">
                        {thread.listing.title}
                      </p>
                    {/if}

                    <p class={`mt-2 truncate text-xs ${thread.unread ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                      {thread.lastMessage.plaintext}
                    </p>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <section class={`flex min-h-0 flex-col ${activeThreadId ? 'flex' : 'hidden lg:flex'}`}>
        {#if activeThread}
          <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
            <div class="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  class="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 lg:hidden"
                  onclick={() => {
                    void goto('?', { replaceState: true, noScroll: true });
                  }}
                aria-label="Back to conversations"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>

              <div class="min-w-0">
                <h3 class="truncate text-sm font-semibold text-slate-950">
                  {activeThread.peer?.metadata?.display_name || activeThread.peer?.metadata?.name || activeThread.peerPubkey.slice(0, 10)}
                </h3>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
                    {activeThread.messages.length} messages
                  </span>
                  {#if activeThread.listing}
                    <a href={`${base}/listing/30402:${activeThread.listing.id}`} class="font-medium text-sky-700 hover:underline">
                      View listing
                    </a>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <div
            id="chat-scroll-container"
            class="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-4"
          >
            <div class="flex flex-col gap-3">
              {#each activeThread.messages as msg (msg.id)}
                {@const isMine = msg.sender === $account?.pubkey}
                <div class={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm lg:max-w-[70%] ${
                      isMine
                        ? 'rounded-tr-none bg-slate-900 text-white'
                        : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    <p class="whitespace-pre-wrap leading-6">{msg.plaintext}</p>
                  </div>
                  <span class="mt-1 text-[10px] text-slate-400">
                    {isMine ? 'You' : activeThread.peer?.metadata?.display_name || activeThread.peer?.metadata?.name || 'Seller'} · {formatTime(msg.created_at)}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <form
            onsubmit={(e) => {
              e.preventDefault();
              void handleSendReply();
            }}
            class="sticky bottom-0 border-t border-slate-200 bg-white p-4"
          >
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={replyText}
                oninput={(e) => (replyText = e.currentTarget.value)}
                placeholder="Type a secure message..."
                class="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                disabled={sending}
              />
              <button
                type="submit"
                class="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                disabled={sending || !replyText.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        {:else}
          <div class="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.04),_transparent_40%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-8 text-center">
            <div class="max-w-sm">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-7 w-7">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A9 9 0 0 1 12 3v0a9 9 0 0 1 9 9v.75m-.502 8.205A9.003 9.003 0 0 1 12 21a9.003 9.003 0 0 1-8.498-5.795M15 10h.008v.008H15V10Zm-6 0h.008v.008H9V10Zm-3.75 6.75c.9-.24 1.84-.37 2.81-.37.97 0 1.91.13 2.81.37" />
                </svg>
              </div>
              <h3 class="mt-4 text-base font-semibold text-slate-950">Select a conversation</h3>
              <p class="mt-2 text-sm leading-6 text-slate-500">Choose a thread from the inbox to view the listing context and continue the conversation.</p>
            </div>
          </div>
        {/if}
      </section>
    </div>
  {/if}
  </AuthGate>
</div>
