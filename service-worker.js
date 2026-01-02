const CACHE_NAME = "gym-pro-v1";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Strength.png",
  "https://github.com/yue830219/Gym/raw/refs/heads/main/music.mp3",
  "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.css",
  "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
