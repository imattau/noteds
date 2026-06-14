import { build, files, prerendered, version } from '$service-worker';

const CACHE = `noteds-${version}`;
function getAppBase() {
  const scopePath = new URL(self.registration.scope).pathname;
  return scopePath.endsWith('/') ? scopePath.slice(0, -1) : scopePath;
}

function getShellUrls() {
  const base = getAppBase();
  const root = base ? `${base}/` : '/';
  return [root, `${root}index.html`];
}

const PRECACHE = [...new Set([...build, ...files, ...prerendered, ...getShellUrls()])];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') {
    return response;
  }

  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    const [root, index] = getShellUrls();
    const fallback = (await cache.match(root)) ?? (await cache.match(index));
    if (fallback) {
      return fallback;
    }

    throw new Error('Offline and no cached app shell is available.');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  return cacheResponse(request, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of PRECACHE) {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok && response.type === 'basic') {
            await cache.put(url, response.clone());
          }
        } catch {
          // Ignore missing or temporarily unavailable precache entries.
        }
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !isSameOrigin(url)) {
    return;
  }

  // Bypass SvelteKit development, Vite dev assets, HMR, and filesystem paths
  if (
    url.pathname.includes('/.svelte-kit/') ||
    url.pathname.includes('/@vite/') ||
    url.pathname.includes('/@fs/') ||
    url.searchParams.has('token')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
