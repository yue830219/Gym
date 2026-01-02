const CACHE_NAME = "gym-pro-v3"; // 每次更動請手動改版本號，如 v2, v3...
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Strength.png",
  "./music.mp3",
  "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.css",
  "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js"
];

// 安裝階段：強制把資源塞進快取
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("[Service Worker] Caching all files");
      // 使用 map 逐一添加，避免其中一個失敗導致全部失敗
      return Promise.all(
        FILES_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.error("Failed to cache:", url, err));
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 激活階段：清理舊版本的快取
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log("[Service Worker] Removing old cache", key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 抓取階段：離線時的關鍵
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // 1. 如果快取有，直接回傳
      if (response) return response;
      
      // 2. 如果快取沒有，去網路上抓
      return fetch(event.request).catch(() => {
        // 3. 如果連網也失敗（真正斷網），且又是頁面請求，就回傳首頁快取
        if (event.request.mode === 'navigate') {
          return caches.match("./");
        }
      });
    })
  );
});
