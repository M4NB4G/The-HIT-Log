/* HIT Log service worker.
   Two jobs:
     1. Make the app open with no signal (basement gym).
     2. Still pick up new versions when there IS signal, so a push to
        GitHub actually reaches the phone instead of being masked by cache.

   Strategy:
     - navigations  -> network first, fall back to cache  (updates win when online)
     - everything else -> cache first, revalidate in background (icons, manifest)

   Bump CACHE whenever you change the shell; the activate handler drops old ones.
*/
const CACHE = "hitlog-v10";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole batch if any single file 404s, which would
      // leave the app with no cache at all. Cache individually instead.
      .then(function (c) {
        return Promise.all(SHELL.map(function (u) {
          return c.add(u).catch(function () { /* skip anything missing */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch cross-origin

  // Page loads: try the network so a new deploy is picked up, fall back to cache offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
          return res;
        })
        .catch(function () {
          return caches.match("./index.html").then(function (hit) {
            return hit || caches.match("./");
          });
        })
    );
    return;
  }

  // Assets: serve instantly from cache, refresh it in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return hit; });
      return hit || net;
    })
  );
});
