/*
 * AMUSE 회원페이지 (member/) — 서비스 워커 (정식판 화면 · 이 폴더 범위만)
 * - 화면 파일(index.html) 하나 + 아이콘 하나 + 인트로 영상(intro.mp4 · 통째로)만 저장 — 회원 · 강사 자료(구글 Apps Script 답)는 절대 저장하지 않음
 * - 화면 열기: 저장본을 바로 보여 주고 뒤에서 새 파일을 받아 저장본을 바꿔 둠 → 새 화면은 "다음 번" 열 때부터 (쓰는 도중에 바뀌지 않음)
 * - 저장본 이름 amuse-member-shell-app-<판> — 이 앱의 예전 저장본(amuse-member-shell-*)만 지움 · 다른 앱(OS · 상담 · 시험판 · 다른 쪽 앱) 저장본은 건드리지 않음
 * - 이 폴더 화면 주소(./ · ./index.html)만 맡음 — 다른 폴더(os/ · cso/ · consult/ · member/ · member-beta/ · teacher-beta/) · legacy.html · intro.mp4 요청 · POST · 다른 주소는 그냥 통과
 * - intro.mp4 요청 자체는 건드리지 않음 (아이폰 사파리 조각 요청) — 화면이 저장본을 직접 꺼내 씀
 */
var VERSION = '0f3dd165ab4f';
var CACHE = 'amuse-member-shell-app-' + VERSION;
var CLEAN = 'amuse-member-shell-';
var ICON = '../icons/icon-192.png';
var INTRO = '../intro.mp4';

function scopePath() { return new URL(self.registration.scope).pathname; }
function pathOf(rel) { return new URL(rel, self.registration.scope).pathname; }

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 화면은 한 번만 받아 ./ · ./index.html 두 이름으로 · 'no-cache' = 바뀌지 않았으면 304 (낡은 판을 넣지 않음)
      return fetch(new Request('./', { cache: 'no-cache' })).then(function (res) {
        if (!res || !res.ok || res.type !== 'basic' || res.redirected) throw new Error('shell fetch failed');
        return Promise.all([cache.put('./', res.clone()), cache.put('./index.html', res)]);
      }).then(function () {
        // 아이콘 (없어도 설치는 계속)
        return fetch(new Request(ICON, { cache: 'no-cache' })).then(function (res) {
          if (res && res.ok && res.type === 'basic' && !res.redirected) return cache.put(ICON, res);
        }).catch(function () {});
      }).then(function () {
        // 인트로 영상 (통째로 · 실패해도 설치는 계속 · 보통 캐시 모드: 방금 받은 영상이 있으면 그것)
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
  if (req.mode !== 'navigate' && url.pathname === pathOf(ICON)) return ICON;
  return null;
}

function refresh(url, key) {
  return fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' })).then(function (res) {
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
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
  var net = refresh(key === './' ? scopePath() : url.href.split('#')[0], key);
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
