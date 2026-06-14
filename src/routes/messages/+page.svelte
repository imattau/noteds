<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import AuthGate from '$components/AuthGate.svelte';
  import { account } from '$lib/nostr/signer';
  import { fetchDecryptedDMs, sendDirectMessage, type DecryptedDM } from '$lib/nostr/dm';
  import { getCachedBrowseItem } from '$lib/nostr/browseCache';
  import { loadNostrUser, type NostrUser } from '$lib/nostr/metadata';
  import type { ListingInput } from '$lib/nostr/listings';

  let messages = $state<DecryptedDM[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Active chat state
  let activeThreadId = $state<string | null>(null);
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
    loading = true;
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
      markAsRead(activeThreadId);
    }
  });

  $effect(() => {
    if ($account?.pubkey) {
      void loadData();
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
      <div class="flex h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="mx-auto h-12 w-12 text-slate-400">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <h3 class="mt-2 text-sm font-semibold text-slate-900">No conversations</h3>
        <p class="mt-1 text-sm text-slate-500">Contact a seller on a listing card to start a thread.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3 h-[600px]">
        
        <!-- Sidebar: Threads List -->
        <div class="flex flex-col border-r border-slate-200 bg-slate-50/50 md:col-span-1 {activeThreadId ? 'hidden md:flex' : 'flex'}">
          <div class="border-b border-slate-200 px-4 py-3 bg-white">
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Inbox</span>
          </div>
          <div class="flex-1 overflow-y-auto divide-y divide-slate-100">
            {#each threads as thread (thread.id)}
              <button
                type="button"
                class="w-full flex items-start gap-3 px-4 py-4 text-left transition hover:bg-white {activeThreadId === thread.id ? 'bg-white' : ''}"
                onclick={() => {
                  activeThreadId = thread.id;
                }}
              >
                <!-- Avatar -->
                <div class="relative flex-shrink-0">
                  {#if thread.peer?.metadata?.picture}
                    <img
                      src={thread.peer.metadata.picture}
                      alt=""
                      class="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
                    />
                  {:else}
                    <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                      {getInitials(thread.peer, thread.peerPubkey)}
                    </div>
                  {/if}
                  {#if thread.unread}
                    <span class="absolute top-0 right-0 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white"></span>
                  {/if}
                </div>

                <!-- Detail -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-1">
                    <span class="truncate text-sm font-semibold text-slate-900">
                      {thread.peer?.metadata?.display_name || thread.peer?.metadata?.name || thread.peerPubkey.slice(0, 8)}
                    </span>
                    <span class="text-[10px] text-slate-400 white-space-nowrap">
                      {formatDate(thread.lastMessage.created_at)}
                    </span>
                  </div>

                  {#if thread.listing}
                    <p class="truncate text-xs font-medium text-slate-500">
                      🏷️ {thread.listing.title}
                    </p>
                  {/if}

                  <p class="mt-1 truncate text-xs text-slate-600 {thread.unread ? 'font-semibold text-slate-900' : ''}">
                    {thread.lastMessage.plaintext}
                  </p>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Chat View Pane -->
        <div class="flex flex-col md:col-span-2 {activeThreadId ? 'flex' : 'hidden md:flex'}">
          {#if activeThread}
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-white">
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="md:hidden p-1 rounded-full text-slate-500 hover:bg-slate-100"
                  onclick={() => {
                    activeThreadId = null;
                  }}
                  aria-label="Back to threads list"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                </button>
                <div>
                  <h3 class="text-sm font-bold text-slate-900">
                    {activeThread.peer?.metadata?.display_name || activeThread.peer?.metadata?.name || activeThread.peerPubkey.slice(0, 10)}
                  </h3>
                  {#if activeThread.listing}
                    <a href={`${base}/listing/30402:${activeThread.listing.id}`} class="text-xs text-blue-600 font-semibold hover:underline">
                      View Listing: {activeThread.listing.title}
                    </a>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Messages List -->
            <div
              id="chat-scroll-container"
              class="flex-1 overflow-y-auto p-4 bg-slate-50/50 flex flex-col gap-3"
            >
              {#each activeThread.messages as msg (msg.id)}
                {@const isMine = msg.sender === $account?.pubkey}
                <div class="flex flex-col {isMine ? 'items-end' : 'items-start'}">
                  <div class="max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm {isMine ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'}">
                    <p class="whitespace-pre-wrap">{msg.plaintext}</p>
                  </div>
                  <span class="mt-1 text-[10px] text-slate-400">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              {/each}
            </div>

            <!-- Reply Box -->
            <form
              onsubmit={(e) => {
                e.preventDefault();
                void handleSendReply();
              }}
              class="border-t border-slate-200 p-4 bg-white flex gap-2"
            >
              <input
                type="text"
                bind:value={replyText}
                oninput={(e) => replyText = e.currentTarget.value}
                placeholder="Type a secure message..."
                class="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                disabled={sending}
              />
              <button
                type="submit"
                class="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                disabled={sending || !replyText.trim()}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </form>
          {:else}
            <!-- Empty state -->
            <div class="flex flex-1 flex-col items-center justify-center bg-slate-50/20 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="mx-auto h-12 w-12 text-slate-400">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A9 9 0 0 1 12 3v0a9 9 0 0 1 9 9v.75m-.502 8.205A9.003 9.003 0 0 1 12 21a9.003 9.003 0 0 1-8.498-5.795M15 10h.008v.008H15V10Zm-6 0h.008v.008H9V10Zm-3.75 6.75c.9-.24 1.84-.37 2.81-.37.97 0 1.91.13 2.81.37" />
              </svg>
              <h3 class="mt-2 text-sm font-semibold text-slate-900">Select a conversation</h3>
              <p class="mt-1 text-sm text-slate-500">Pick a thread from the list to start messaging.</p>
            </div>
          {/if}
        </div>

      </div>
    {/if}
  </AuthGate>
</div>
