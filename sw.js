/* Service worker : mode hors ligne + mise à jour avec bandeau.
   À chaque publication, changer VERSION ici ET dans index.html (figure.js?v= et generator.js?v=). */
const VERSION = "1.27.0";
const CACHE = "coach-renfo-" + VERSION;
const FONTS = "coach-renfo-fonts"; // polices Google, conservées d'une version à l'autre
const CARDS = ["quotidien", "echauffement", "recuperation", "biblio"].concat(
  ["quotidien-quick-gym", "quotidien-par-zone", "quotidien-renfo-trail"],
  ["echauffement", "recuperation"].flatMap(r => ["par-zone", "trail", "cyclisme"].map(k => r + "-" + k))
).map(id => "img/cards/" + id + ".svg");
const FILES = ["./", "index.html", "figure.js?v=" + VERSION, "generator.js?v=" + VERSION, "exercises.json", "phrases.json", "audio/manifest.json"].concat(CARDS);
const fresh = u => new Request(u, {cache: "reload"});

self.addEventListener("install", e => {
  // Pas de skipWaiting ici : la nouvelle version attend le clic sur « Recharger ».
  // Clips audio : liste lue dans le manifeste (tools/gen-audio.py) ; un clip manquant n'empêche pas l'installation
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(fresh))
    .then(() => c.match("audio/manifest.json")).then(r => r.json())
    .then(m => Promise.all([...new Set(Object.values(m))].map(f => c.add(fresh("audio/" + f)).catch(() => {}))))));
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
    // Les images de img/ et les clips de audio/ absents du cache y sont rangés au premier chargement.
    const isImg = url.pathname.includes("/img/") || url.pathname.includes("/audio/");
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(r => {
        if (isImg && r.ok) c.put(req, r.clone());
        return r;
      })))
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
