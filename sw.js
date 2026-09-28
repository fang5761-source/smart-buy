// 智能採買 Service Worker v5 (秒開版)
// 頁面本體：先用快取立即開啟，背景再更新（弱網路/店內訊號差也不會卡住）
// 外部函式庫：快取優先，並獨立存放，之後改版不會被清掉
const APP_CACHE = 'smart-buy-app-v5';
const CDN_CACHE = 'smart-buy-cdn-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== APP_CACHE && key !== CDN_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isAppShell = url.origin === self.location.origin;
  const isStaticCdn = [
    'cdn.tailwindcss.com',
    'unpkg.com',
    'www.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ].includes(url.hostname);

  if (isAppShell) {
    // 頁面導覽（含帶 ?參數 的連結）一律對應到同一份 index.html 快取
    const key = request.mode === 'navigate' ? './index.html' : request;
    event.respondWith(
      caches.open(APP_CACHE).then((cache) =>
        cache.match(key).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response && response.ok && !response.redirected) {
                cache.put(key, response.clone());
              }
              return response;
            })
            .catch(() => null);

          if (cached) {
            // 有快取：立刻回傳，背景更新給下次使用
            event.waitUntil(network);
            return cached;
          }
          // 沒快取（第一次）：走網路，失敗才退回首頁快取
          return network.then((response) => response || cache.match('./index.html'));
        })
      )
    );
    return;
  }

  if (isStaticCdn) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            // 只存成功的回應（含跨網域 opaque），避免把錯誤頁存起來
            if (response && (response.ok || response.type === 'opaque')) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
  }
});
