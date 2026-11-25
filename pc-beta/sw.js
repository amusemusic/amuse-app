/*
 * AMUSE PC OS 시험판 — 서비스 워커 (이 폴더 범위만)
 * - 화면 파일(index.html) + 메뉴 화면 묶음(pages-<판>.json · 판마다 이름이 다름) + 예전 화면(legacy.html) + 아이콘 + 인트로 영상(../intro.mp4)만 저장
 *   학생 · 결제 자료(구글 Apps Script 답)는 절대 저장하지 않음 (POST 는 그냥 통과)
 * - 화면 열기: 저장본을 바로 보여 주고 뒤에서 새 파일을 받아 저장본을 바꿔 둠 → 새 화면은 "다음 번" 열 때부터 (쓰는 도중에 바뀌지 않음)
 *   서버 화면 판이 다르면 화면이 이 워커를 새로 받게 한 뒤 다시 엶 (op_shim 판 맞추기)
 * - 저장본 이름 amuse-op-shell-<판> — 이 시험판의 예전 저장본(amuse-op-shell-*)만 지움 · 다른 앱 저장본은 건드리지 않음
 */
var VERSION = '354f25f86a65';
var PAGES = 'pages-f22c88f7abc5.json';
var CACHE = 'amuse-op-shell-' + VERSION;
var CLEAN = 'amuse-op-shell-';
var ICON = '../icons/icon-192.png';
var INTRO = '../intro.mp4';
var LEGACY = 'legacy.html';

function scopePath() { return new URL(self.registration.scope).pathname; }
function pathOf(rel) { return new URL(rel, self.registration.scope).pathname; }
function okRes(res) { return res && res.ok && res.type === 'basic' && !res.redirected; }

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return fetch(new Request('./', { cache: 'no-cache' })).then(function (res) {
        if (!okRes(res)) throw new Error('shell fetch failed');
        return Promise.all([cache.put('./', res.clone()), cache.put('./index.html', res)]);
      }).then(function () {
        // 메뉴 화면 묶음 · 예전 화면 (꼭 있어야 함: 못 받으면 이번 설치를 멈추고 다음에 다시 — 그동안 지금 판이 그대로 동작)
        return Promise.all([PAGES, LEGACY].map(function (rel) {
          return fetch(new Request(rel, { cache: 'no-cache' })).then(function (res) {
            if (!okRes(res)) throw new Error(rel + ' fetch failed');
            return cache.put(rel, res);
          });
        }));
      }).then(function () {
        return fetch(new Request(ICON, { cache: 'no-cache' })).then(function (res) {
          if (okRes(res)) return cache.put(ICON, res);
        }).catch(function () {});
      }).then(function () {
        return fetch(new Request(INTRO)).then(function (res) {
          if (res && res.ok && res.status === 200 && res.type === 'basic') return cache.put(INTRO, res);
        }).catch(function () {});
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(CLEAN) === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/** 이 워커가 맡는 요청 → 저장본 키 | null (그 밖은 그냥 통과) */
function keyOf(req, url) {
  var sp = scopePath();
  if (url.pathname === sp || url.pathname === sp + 'index.html') return './';
  if (url.pathname === sp + LEGACY) return LEGACY;
  if (req.mode !== 'navigate' && url.pathname === pathOf(PAGES)) return PAGES;
  if (req.mode !== 'navigate' && url.pathname === pathOf(ICON)) return ICON;
  return null;
}

function refresh(url, key) {
  return fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' })).then(function (res) {
    if (okRes(res)) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put(key, copy.clone());
        if (key === './') cache.put('./index.html', copy);
      });
    }
    return res;
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var key = keyOf(req, url);
  if (!key) return;
  // 메뉴 화면 묶음은 판마다 이름이 달라 바뀌지 않음 → 저장본만 (없으면 인터넷)
  if (key === PAGES) {
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match(PAGES).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (okRes(res)) cache.put(PAGES, res.clone()); return res; });
      });
    }));
    return;
  }
  var net = refresh(key === './' ? scopePath() : key === LEGACY ? pathOf(LEGACY) : url.href.split('#')[0], key);
  event.waitUntil(net.then(function () {}, function () {}));
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(key).then(function (hit) {
        if (hit) return hit;
        return net.catch(function () { return Response.error(); });
      });
    })
  );
});
