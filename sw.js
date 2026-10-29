/*
 * AMUSE 강사 — 서비스 워커 (아주 작게)
 * - 이 폴더의 껍데기 파일(index.html · manifest · 아이콘)만 다룸: 네트워크 먼저, 안 되면 저장본
 * - 구글 Apps Script(iframe) 등 다른 주소의 요청은 절대 건드리지 않음
 * - intro.mp4(인트로 영상)는 일부러 다루지 않음: 아이폰 사파리는 영상을 조각(Range)으로 달라고 하는데,
 *   저장본을 통째로 돌려주면 재생이 안 됨 → 브라우저 보통 캐시에 맡김 (오프라인이면 어차피 앱도 못 열어 영상이 필요 없음)
 * - v2: 감싸기 v2 (인트로 영상 · 가장자리 색 · 두근거리는 로고 없앰) — 이름을 바꿔 휴대폰이 새 파일을 받게 함
 */
var CACHE = 'amuse-shell-v2';
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k.indexOf('amuse-shell-') === 0 && k !== CACHE) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// 이 서비스 워커 범위 안의 상대 경로 ('', 'index.html', 'icons/…')
function shellPath(url) {
  var scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return null;
  var rel = url.pathname.slice(scope.pathname.length);
  if (rel === '' || rel === 'index.html') return './';
  return SHELL.indexOf(rel) >= 0 ? rel : null;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Apps Script · 구글 · 글꼴 등은 그냥 통과
  var key = req.mode === 'navigate' ? (shellPath(url) ? './' : null) : shellPath(url);
  if (!key) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok && res.type === 'basic' && !res.redirected) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { return cache.put(key, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.open(CACHE).then(function (cache) {
          return cache.match(key)
            .then(function (hit) { return hit || cache.match(req, { ignoreSearch: true }); })
            .then(function (hit) { return hit || Response.error(); });
        });
      })
  );
});
