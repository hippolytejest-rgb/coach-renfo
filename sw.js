/* Service worker : mode hors ligne + mise à jour avec bandeau.
   À chaque publication, changer VERSION ici ET dans index.html (figure.js?v= et generator.js?v=). */
const VERSION = "1.28.0";
const CACHE = "coach-renfo-" + VERSION;
const FONTS = "coach-renfo-fonts"; // polices Google, conservées d'une version à l'autre
const PREF = "coach-renfo-pref"; // voix choisie (message de la page), conservée d'une version à l'autre
const VOIX = ["femme", "homme"];
const CARDS = ["quotidien", "echauffement", "recuperation", "biblio"].concat(
  ["quotidien-quick-gym", "quotidien-par-zone", "quotidien-renfo-trail"],
  ["echauffement", "recuperation"].flatMap(r => ["par-zone", "trail", "cyclisme"].map(k => r + "-" + k))
).map(id => "img/cards/" + id + ".svg");
const FILES = ["./", "index.html", "figure.js?v=" + VERSION, "generator.js?v=" + VERSION, "exercises.json", "phrases.json"].concat(VOIX.map(v => "audio/" + v + "/manifest.json"), CARDS);
const fresh = u => new Request(u, {cache: "reload"});

/* Clips audio : seuls ceux de la voix choisie sont mis en cache (les deux voix pèsent ~16 Mo).
   Liste lue dans le manifeste de la voix (tools/gen-audio.py) ; un clip manquant n'empêche pas l'installation. */
const prefVoix = () => caches.open(PREF).then(c => c.match("voix")).then(r => r ? r.text() : "femme").then(v => VOIX.includes(v) ? v : "femme").catch(() => "femme");
function cacheVoix(c, v) {
  return c.match("audio/" + v + "/manifest.json").then(r => r ? r.json() : fetch("audio/" + v + "/manifest.json").then(r => r.json()))
    .then(m => Promise.all([...new Set(Object.values(m))].map(f => "audio/" + v + "/" + f)
      .map(u => c.match(u).then(hit => hit || c.add(fresh(u))).catch(() => {}))))
    .catch(() => {});
}

self.addEventListener("install", e => {
  // Pas de skipWaiting ici : la nouvelle version attend le clic sur « Recharger ».
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(fresh)).then(prefVoix).then(v => cacheVoix(c, v))));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("coach-renfo-") && k !== CACHE && k !== FONTS && k !== PREF).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
  // {voix} : envoyé par la page au chargement et à chaque changement de réglage
  else if (e.data && VOIX.includes(e.data.voix)) {
    const v = e.data.voix;
    e.waitUntil(caches.open(PREF).then(c => c.put("voix", new Response(v)))
      .then(() => caches.open(CACHE)).then(c => cacheVoix(c, v)));
  }
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
