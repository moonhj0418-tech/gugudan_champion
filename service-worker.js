/**
 * 구구단 챔피언 - Service Worker (PWA 1단계)
 *
 * 목적: 앱 껍데기(HTML/폰트/아이콘)를 폰에 캐시해 초기 화면을 즉시 띄운다.
 *
 * 캐시 전략
 *   - 백엔드 API (script.google.com / firestore 등) : 캐시 안 함. 항상 네트워크.
 *   - 페이지(HTML)  : stale-while-revalidate
 *                     → 캐시본을 즉시 보여주고, 뒤에서 새 버전을 받아둔다.
 *                     → 새로 배포하면 "앱을 두 번 열었을 때" 최신이 적용된다.
 *   - 폰트/아이콘 등 : cache-first (한 번 받으면 계속 재사용, 뒤에서 갱신)
 *
 * 배포할 때마다 CACHE_VERSION 을 올린다. (옛 캐시 자동 정리)
 */

const CACHE_VERSION = 'v6-1';
const CACHE_NAME = `gugudan-${CACHE_VERSION}`;

// 설치 시 미리 받아둘 파일 (상대 경로 — GitHub Pages 하위 경로에서도 동작)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// 캐시하면 안 되는 도메인 (동적 데이터)
const NO_CACHE_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api.telegram.org',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch((err) => {
        // 일부 파일이 실패해도 설치는 계속 (예: 오프라인 상태에서 설치)
        console.warn('[SW] precache 일부 실패:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('gugudan-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 이외(POST 등)는 건드리지 않음
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 백엔드 API는 항상 네트워크
  if (NO_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // 확장 프로그램 등 http(s) 아닌 요청 무시
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 페이지 이동(HTML) → stale-while-revalidate
  if (req.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(req, './index.html'));
    return;
  }

  // 그 외 정적 리소스(폰트/아이콘/CSS 등) → cache-first + 백그라운드 갱신
  event.respondWith(staleWhileRevalidate(req, null));
});

/**
 * 캐시본이 있으면 즉시 반환하고, 네트워크로 받아온 새 응답을 캐시에 저장.
 * 캐시본이 없으면 네트워크 응답을 기다렸다가 반환.
 */
async function staleWhileRevalidate(req, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true })
    || (fallbackUrl ? await cache.match(fallbackUrl) : undefined);

  const network = fetch(req)
    .then((res) => {
      // 정상 응답만 캐시 (opaque/에러 제외)
      if (res && res.status === 200 && res.type !== 'opaque') {
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    network; // 백그라운드로 갱신만 하고 기다리지 않음
    return cached;
  }

  const res = await network;
  if (res) return res;

  // 오프라인 + 캐시 없음
  if (fallbackUrl) {
    const fb = await cache.match(fallbackUrl);
    if (fb) return fb;
  }
  return new Response('오프라인 상태예요. 인터넷에 연결한 뒤 다시 열어주세요.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
