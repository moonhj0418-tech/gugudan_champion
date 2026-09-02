/**
 * 구구단 챔피언 - Service Worker (PWA 1단계)
 *
 * 목적: 앱 껍데기(HTML/폰트/아이콘)를 폰에 캐시해 초기 화면을 즉시 띄운다.
 *
 * 캐시 전략
 *   - 백엔드 API (script.google.com / firestore 등) : 캐시 안 함. 항상 네트워크.
 *   - 페이지(HTML)  : network-first (3초 타임아웃) → 실패하면 캐시본
 *                     → 온라인이면 "한 번만 열어도" 항상 최신이 적용된다.
 *                     → 오프라인이거나 느리면 캐시본으로 즉시 표시된다.
 *   - 폰트/아이콘 등 : cache-first (한 번 받으면 계속 재사용, 뒤에서 갱신)
 *
 * ※ 안드로이드 APK도 이 주소를 불러오는 방식이라, 여기 캐시가 앱의 오프라인도 담당한다.
 *
 * 배포할 때마다 CACHE_VERSION 을 올린다. (옛 캐시 자동 정리)
 */

const CACHE_VERSION = 'v8-1';
const NAV_TIMEOUT_MS = 3000;
const CACHE_NAME = `gugudan-${CACHE_VERSION}`;

// 설치 시 미리 받아둘 파일 (상대 경로 — GitHub Pages 하위 경로에서도 동작)
const PRECACHE_URLS = [
  './',
  './index.html',
  './firebase-config.js',
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

  // 페이지 이동(HTML) → network-first (최신 우선, 실패 시 캐시)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  // 그 외 정적 리소스(폰트/아이콘/CSS 등) → cache-first + 백그라운드 갱신
  event.respondWith(staleWhileRevalidate(req, null));
});

/**
 * 네트워크를 먼저 시도하고(최대 NAV_TIMEOUT_MS), 실패/지연되면 캐시본을 준다.
 * HTML 전용 — 배포 직후 한 번만 열어도 최신이 적용되게 하기 위함.
 */
async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  // ⚠️ navigate 모드 Request는 cache.put()의 키로 쓸 수 없다(TypeError).
  //    그래서 URL 문자열로 요청하고, 저장도 문자열 키로 한다.
  //    no-store 로 브라우저 HTTP 캐시까지 건너뛰어 "항상 최신"을 보장한다.
  const fromNetwork = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
    .then((res) => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        cache.put(fallbackUrl || req.url, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null); // 실패해도 race가 깨지지 않도록

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));

  const fast = await Promise.race([fromNetwork, timeout]);
  if (fast) return fast;

  // 네트워크 실패 또는 느림 → 캐시본
  const cached =
    (fallbackUrl ? await cache.match(fallbackUrl) : undefined) ||
    (await cache.match(req.url, { ignoreSearch: true }));
  if (cached) return cached;

  // 캐시도 없으면 네트워크를 끝까지 기다려 본다
  const late = await fromNetwork;
  if (late) return late;

  return new Response('오프라인 상태예요. 인터넷에 연결한 뒤 다시 열어주세요.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

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
