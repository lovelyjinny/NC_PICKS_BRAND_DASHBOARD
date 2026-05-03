// NC PICKS Service Worker - 오프라인 캐시 지원
const CACHE_VERSION = 'nc-picks-v1.0';
const CACHE_NAME = `nc-picks-cache-${CACHE_VERSION}`;

// 앱 셸 (HTML/아이콘/매니페스트) - 최초 설치 시 캐시
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// 설치 - 앱 셸 캐시
self.addEventListener('install', (event) => {
  console.log('[SW] 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 앱 셸 캐시 중');
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] 일부 리소스 캐시 실패 (무시):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 활성화 - 옛날 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[SW] 활성화');
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

// fetch 핸들러 - 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // GET 요청만 처리
  if (event.request.method !== 'GET') return;
  
  // Supabase API 요청은 네트워크 우선 (오프라인 시 캐시 폴백)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 성공한 응답을 캐시에 저장 (다음에 오프라인 시 사용)
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // 네트워크 실패 시 캐시에서 제공
          console.log('[SW] 오프라인, 캐시에서 제공:', url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // 정적 리소스는 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 백그라운드에서 최신 버전 갱신 시도
        fetch(event.request).then((freshResponse) => {
          if (freshResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, freshResponse.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }
      
      // 캐시에 없으면 네트워크에서 가져오기
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // 둘 다 실패 (HTML 요청이면 메인 페이지로)
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
