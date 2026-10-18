/**
 * The site root's service worker. Do not delete this file: see README.md.
 *
 * Rattlesnake lived at mattankama.github.io/ until October 2026 and registered an
 * offline worker at this exact URL, /sw.js, covering the whole site. Phones that
 * used it still have that worker, and still check this URL for a newer version.
 * This file is that newer version. It replaces Rattlesnake's old worker and:
 *
 * 1. Deletes the old worker's offline copy of Rattlesnake. That is Cache Storage
 *    only. It never touches IndexedDB, which is where the workouts are kept.
 * 2. Keeps the home page available offline, so a Home Screen icon from before the
 *    move still opens with no signal, and index.html can send it to /rattlesnake/.
 * 3. Leaves every other request alone: the apps under this site handle their own.
 *
 * This page never registers this worker itself. Only phones that already had
 * Rattlesnake's old one pick it up, as an update.
 */

const CACHE = "site-root-v1";

// The old worker's cache: "rattlesnake-" and a 12-character build token. Today's
// Rattlesnake, at /rattlesnake/, names its caches "rattlesnake:/rattlesnake/:...",
// which this does not match.
const OLD_RATTLESNAKE = /^rattlesnake-[0-9a-f]{12}$/;

// Pages that open this site's home page offline: the home page itself, and
// Rattlesnake's old addresses, which an open copy of the old app can still visit.
const OFFLINE_HOME = new Set([
    "/",
    "/index.html",
    "/progress",
    "/progress/",
    "/routine/",
    "/session/",
]);

self.addEventListener("install", (event) => {
    // If the home page cannot be fetched (no signal), install fails and the old
    // worker stays in charge. The browser tries again on a later visit.
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.add("/"))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((name) => OLD_RATTLESNAKE.test(name) || (name.startsWith("site-root-") && name !== CACHE))
                        .map((name) => caches.delete(name)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.mode !== "navigate") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !OFFLINE_HOME.has(url.pathname)) return;

    // Network first, so the page is always current online. "no-cache" makes the
    // browser check with GitHub even when it holds a copy younger than Pages'
    // ten-minute max-age, which right after the move would be old Rattlesnake.
    // Offline, the copy kept at install: in an old Home Screen icon it goes
    // straight on to /rattlesnake/.
    event.respondWith(
        fetch(new Request(request, { cache: "no-cache" }))
            .then((response) => {
                if (response.ok && url.pathname === "/") {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put("/", copy));
                }
                return response;
            })
            .catch(() =>
                caches
                    .open(CACHE)
                    .then((cache) => cache.match("/"))
                    .then((cached) => cached || Response.error()),
            ),
    );
});
