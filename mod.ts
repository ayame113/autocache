import { Handler } from "https://deno.land/std@0.158.0/http/mod.ts";

// キャッシュ期限を保存しておくためのカスタムヘッダー
const CACHE_HEADER_KEY = "X-Autocache-lib-cache-until";
const cacheKey = Deno.env.get("DENO_DEPLOYMENT_ID") ?? crypto.randomUUID();

const cachePromise = caches.open(cacheKey);
export function withCache(handler: Handler): Handler {
  return async (req, connInfo) => {
    const cache = await cachePromise;
    const cacheResponse = await cache.match(req);
    if (cacheResponse) {
      // キャッシュ期限
      const cacheUntil = cacheResponse.headers.get(CACHE_HEADER_KEY);
      if (cacheUntil && Date.now() < +cacheUntil) {
        // キャッシュ期限内ならそのレスポンスを返す
        return cacheResponse;
      } else {
        // キャッシュ期限を過ぎていたらキャッシュを破棄する
        cache.delete(req);
      }
    }
    const serverResponse = await handler(req, connInfo);
    // キャッシュ期限のunixtimeが返る。falseの時はキャッシュしない
    const cacheUntil = getCacheControl(serverResponse.headers);
    if (cacheUntil) {
      queueMicrotask(() => {
        // キャッシュ期限を保存
        serverResponse.headers.set(CACHE_HEADER_KEY, cacheUntil.toString());
        cache.put(req, serverResponse);
      });
    }
    return serverResponse.clone();
  };
}

// https://developers.cloudflare.com/cache/about/default-cache-behavior/
// TODO: Am I implementing this correctly? needs a test.

// Default Cache Behavior
// Cloudflare respects the origin web server’s cache headers in the following order unless an Edge Cache TTL page rule overrides the headers.
//
// Cloudflare does not cache the resource when:
// The Cache-Control header is set to private, no-store, no-cache, or max-age=0.
// The Set-Cookie header exists.
// Cloudflare does cache the resource when:
// The Cache-Control header is set to public and max-age is greater than 0. Note that Cloudflare does cache the resource even if there is no Cache-Control header based on status codes.
// The Expires header is set to a future date.
function getCacheControl(headers: Headers) {
  const control = headers.get("Cache-Control");
  if (!control) {
    return false;
  }
  let isPublic = false;
  let maxAge = 0;
  for (const directive of control.split(",")) {
    const trimmed = directive.trim();
    if (trimmed === "public") {
      isPublic = true;
    } else if (trimmed.startsWith("max-age")) {
      maxAge = Number(trimmed.slice("max-age=".length));
    }
  }
  if (isPublic) {
    if (0 < maxAge) {
      return Date.now() + maxAge;
    }
    return false;
  }
  const expires = headers.get("Expires");
  if (expires) {
    return new Date(expires).getTime();
  }
  return false;
}
