/*
 * AMUSE OS — 서비스 워커 (os/ 폴더만)
 * - 이 폴더(os/)의 껍데기 파일(index.html · manifest)만 다룸 — 아이콘 · 영상은 위 폴더 것(../)을 같이 씀
 * - 구글 Apps Script(iframe) 등 다른 주소의 요청은 절대 건드리지 않음
 * - v4 (빨리 열기): 저장본을 바로 보여 주고, 뒤에서 새 파일을 받아 저장본을 바꿔 둠 (stale-while-revalidate)
 *     → 아이콘을 누르면 인터넷을 기다리지 않고 바로 검정 화면 · 인트로 · 앱 불러오기가 시작됨
 *     → 감싸기 파일을 새로 올리면 "그다음 번" 실행부터 보임 (올리는_방법.md)
 *     저장본이 없으면(처음 · 지워짐) 예전처럼 인터넷에서
 * - intro.mp4(인트로 영상): 요청은 여전히 건드리지 않음 (아이폰 사파리는 영상을 조각(Range)으로 달라고 하는데
 *   저장본을 통째로 돌려주면 재생이 안 됨). 대신 설치할 때 통째로 저장해 두고, index.html 이 저장본을 꺼내
 *   blob 으로 틂 (조각 요청이 생기지 않음). 저장이 안 돼도 설치는 그대로 (영상은 인터넷에서)
 * - 이름(CACHE)을 바꾸면 휴대폰이 새 파일을 받음: v1 처음 (강사앱 v4 와 같은 방식)
 * - 강사앱 서비스 워커(../sw.js · amuse-shell-*)와 저장본 이름이 겹치지 않음 → 서로 지우지 않음
 */
var CACHE = 'amuse-os-shell-v1';
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest'
];
var INTRO = '../intro.mp4';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }))
          .then(function () {
            // 인트로 영상 (통째로 · 실패해도 설치는 계속)
            return fetch(new Request(INTRO, { cache: 'reload' }))
              .then(function (res) {
                if (res && res.ok && res.status === 200 && res.type === 'basic') return cache.put(INTRO, res);
              })
              .catch(function () {});
          });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k.indexOf('amuse-os-shell-') === 0 && k !== CACHE) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// 이 서비스 워커 범위(os/) 안의 상대 경로 ('', 'index.html', 'manifest.webmanifest')
function shellPath(url) {
  var scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return null;
  var rel = url.pathname.slice(scope.pathname.length);
  if (rel === '' || rel === 'index.html') return './';
  return SHELL.indexOf(rel) >= 0 ? rel : null;
}

/** 인터넷에서 받아 저장본을 바꿔 둠 (정상 응답만)
 *  no-cache: 브라우저 보통 캐시(GitHub Pages 10분)에 있어도 서버에 바뀌었는지 물어봄 (안 바뀌었으면 304 로 짧게) */
function refresh(req, key) {
  return fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(function (res) {
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) { return cache.put(key, copy); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Apps Script · 구글 · 글꼴 등은 그냥 통과
  var key = req.mode === 'navigate' ? (shellPath(url) ? './' : null) : shellPath(url);
  if (!key) return;

  var net = refresh(req, key);
  event.waitUntil(net.then(function () {}, function () {}));   // 저장본을 보여 준 뒤에도 새 파일 받기는 끝까지

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(key)
        .then(function (hit) { return hit || cache.match(req, { ignoreSearch: true }); })
        .then(function (hit) {
          if (hit) return hit;                                   // 저장본 바로
          return net.catch(function () { return Response.error(); });   // 처음: 인터넷 (안 되면 오류)
        });
    })
  );
});
