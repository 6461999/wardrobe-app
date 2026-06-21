/**
 * sw.js — Service Worker
 *
 * 策略：
 *   静态资源（CSS/JS/图标） → Cache First（优先缓存，离线可用）
 *   HTML（index.html）       → Network First（先网络，失败用缓存）
 *   外部 API（remove.bg）     → Network Only（不缓存，离线跳过）
 *
 * 缓存版本号 —— 更新应用时改这个数字即可
 */
const CACHE_NAME = 'wardrobe-v1';

// 预缓存的文件列表（app shell）
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/crypto.js',
  './js/db.js',
  './js/camera.js',
  './js/settings.js',
  './js/ui.js',
  './js/app.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/placeholder.png'
];

// ── 安装：预缓存 App Shell ────────────
self.addEventListener('install', (event) => {
  console.log('👗 SW: 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('👗 SW: 预缓存 App Shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// ── 激活：清理旧缓存 ──────────────────
self.addEventListener('activate', (event) => {
  console.log('👗 SW: 激活');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('👗 SW: 删除旧缓存', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── 请求拦截 ──────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 外部 API 请求 → 只用网络，不缓存
  if (url.hostname === 'api.remove.bg') {
    return; // 让浏览器正常处理
  }

  // HTML → Network First（保证拿到最新版本）
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 静态资源 → Cache First（CSS、JS、图标、字体等）
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|ico|woff2?|json)$/) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 其他请求 → Network First 降级
  event.respondWith(networkFirst(event.request));
});

// ── 策略：Cache First ──────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // 离线且无缓存 → 返回空（SPA 已缓存，通常不会到这里）
    return new Response('Offline', { status: 503 });
  }
}

// ── 策略：Network First ────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // 网络失败 → 尝试缓存
    const cached = await caches.match(request);
    if (cached) return cached;

    // 连缓存都没有 → 返回离线提示
    return new Response(
      '网络不可用，请连接网络后重试。',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}
