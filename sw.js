/* Service worker : mode hors ligne + mise à jour avec bandeau.
   À chaque publication, changer VERSION ici ET dans index.html (pied de page, figure.js?v=). */
const VERSION = "1.7.0";
const CACHE = "coach-renfo-" + VERSION;
const FONTS = "coach-renfo-fonts"; // polices Google, conservées d'une version à l'autre
const FILES = ["./", "index.html", "figure.js?v=" + VERSION];

self.addEventListener("install", e => {
  // Pas de skipWaiting ici : la nouvelle version attend le clic sur « Recharger ».
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, {cache: "reload"})))));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("coach-renfo-") && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Cache d'abord (ignoreSearch : figure.js?v=… retrouve son fichier), réseau en repli.
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req, {ignoreSearch: true})).then(hit => hit || fetch(req))
    );
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // Polices : on sert le cache et on le rafraîchit en arrière-plan.
    e.respondWith(
      caches.open(FONTS).then(c =>
        c.match(req).then(hit => {
          const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
          return hit || net;
        })
      )
    );
  }
});
