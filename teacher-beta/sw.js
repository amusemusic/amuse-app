/*
 * AMUSE 강사 (시험판) — 서비스 워커 (teacher-beta/ 폴더만)
 * - 이 폴더의 껍데기(index.html · manifest) + 위 폴더의 아이콘 · 인트로 영상(../intro.mp4)만 저장
 * - 구글 Apps Script(데이터) · 글꼴 · 다른 주소 요청 · POST 는 건드리지 않음 → 강사 · 학생 자료는 절대 저장하지 않음
 * - 화면 열기: 저장본을 바로 보여 주고 뒤에서 새 파일을 받아 둠 → 새 화면은 "다음 번" 열 때부터 (쓰는 도중에 바뀌지 않음)
 * - 저장본 이름 amuse-tbeta-shell-<판> — 기존 강사앱(amuse-shell-*) · 회원 시험판(amuse-mbeta-shell-*) 저장본과 겹치지 않음 (서로 지우지 않음)
 * - intro.mp4 요청 자체는 건드리지 않음 (아이폰 사파리 조각 요청) — 화면이 저장본을 직접 꺼내 씀
 */
var VERSION = 'b8e29714729c';
var CACHE = 'amuse-tbeta-shell-' + VERSION;
var SHELL = ['./', './index.html', './manifest.webmanifest', '../icons/icon-192.png'];
var INTRO = '../intro.mp4';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 화면(./)은 한 번만 받아 ./ · ./index.html 두 이름으로 · 'no-cache' = 바뀌지 않았으면 304
      return fetch(new Request('./', { cache: 'no-cache' })).then(function (res) {
        if (!res || !res.ok || res.type !== 'basic' || res.redirected) throw new Error('shell fetch failed');
        return Promise.all([cache.put('./', res.clone()), cache.put('./index.html', res)]);
      }).then(function () {
        return cache.addAll(SHELL.filter(function (u) { return u !== './' && u !== './index.html'; }).map(function (u) { return new Request(u, { cache: 'no-cache' }); }));
      }).then(function () {
        // 인트로 영상 (통째로 · 실패해도 설치는 계속)
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
        if (k.indexOf('amuse-tbeta-shell-') === 0 && k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function scopePath() { return new URL(self.registration.scope).pathname; }      // …/teacher-beta/
function parentPath() { return scopePath().replace(/[^\/]+\/$/, ''); }          // …/

/** 이 워커가 맡는 요청 → 저장본 키 | null (그 밖은 그냥 통과) */
function keyOf(req, url) {
  var sp = scopePath(), pp = parentPath();
  if (req.mode === 'navigate') return url.pathname === sp || url.pathname === sp + 'index.html' ? './' : null;
  if (url.pathname === sp || url.pathname === sp + 'index.html') return './';
  if (url.pathname === sp + 'manifest.webmanifest') return './manifest.webmanifest';
  if (url.pathname === pp + 'icons/icon-192.png') return '../icons/icon-192.png';
  return null;   // intro.mp4 · 다른 아이콘 · sw.js · 다른 폴더 → 통과
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
  if (req.method !== 'GET') return;                     // POST(데이터) → 그냥 통과
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Apps Script · 구글 · 글꼴 → 그냥 통과 (저장 안 함)
  var key = keyOf(req, url);
  if (!key) return;
  var fetchUrl = key === './' ? scopePath() : url.href.split('#')[0];
  var net = refresh(fetchUrl, key);
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
