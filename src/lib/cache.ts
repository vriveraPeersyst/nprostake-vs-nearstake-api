/**
 * Cache successful responses on Vercel's CDN so repeated calls (the mobile app
 * polls every minute) don't run the function. The data only moves per epoch
 * (~7h) and with prices, so 5 minutes fresh + 1 hour stale is plenty.
 */
export const CDN_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "Vercel-CDN-Cache-Control": "max-age=300, stale-while-revalidate=3600",
};
