// NC PICKS Service Worker - 오프라인 캐시 지원
// ★v1.1 (2026-07-05): HTML은 네트워크 우선으로 변경(배포 즉시 최신 코드 반영).
//   기존 v1.0은 HTML도 '캐시 우선'이라 코드 배포해도 옛 index.html이 계속 떠서
//   멀티시즌 등 최신 수정이 반영 안 되던 문제(옛 코드 → statement timeout) 해결.
const CACHE_VERSION = 'nc-picks-v1.1';
const CACHE_NAME = `nc-picks-cache-${CACHE_VERSION}`;

// 앱 셸 (아이콘/매니페스트) - 최초 설치 시 캐시. index.html은 네트워크 우선이라 여기 의존 안 함.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// 설치 - 앱 셸 캐시
self.addEventListener('install', (event) => {
  console.log('[SW] 설치 중...', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] 일부 리소스 캐시 실패 (무시):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 활성화 - 옛날 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[SW] 활성화', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME && name.startsWith('nc-picks-cache-')) {
            console.log('[SW] 옛 캐시 삭제:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// fetch 핸들러
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // GET 요청만 처리
  if (event.request.method !== 'GET') return;

  // Supabase API 요청은 네트워크 우선 (오프라인 시 캐시 폴백)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ★v1.1: HTML/네비게이션(index.html, admin.html)은 네트워크 우선 → 항상 최신 코드.
  //   오프라인일 때만 캐시로 폴백. (배포 즉시 반영, 캐시 지연 없음)
  const isHTML = event.request.mode === 'navigate'
    || url.pathname === '/' || url.pathname.endsWith('/')
    || url.pathname.endsWith('.html');
  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 그 외 정적 리소스(아이콘 등)는 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request).then((freshResponse) => {
          if (freshResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, freshResponse.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
