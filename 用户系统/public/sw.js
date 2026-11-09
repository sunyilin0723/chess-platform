// PWA Service Worker：静态资源缓存优先 + 离线壳回退；API/截图/跨域一律走网络
const CACHE = 'chess-pwa-v1';
const SHELL = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（Turnstile 等）直通
  // 数据类不缓存：鉴权/接口/截图走网络，避免陈旧
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/screenshots/')) return;

  if (req.mode === 'navigate') {
    // 页面导航：网络优先，拿不到（离线/断网）回退缓存壳，SPA 路由由前端接管
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 静态资源（css/js/图片）：缓存优先，同时后台刷新（?v=N 升版本会产生新 URL）
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
