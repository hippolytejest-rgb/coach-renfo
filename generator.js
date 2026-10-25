/* Générateur de séances : fonctions pures, sans accès à l'interface.
   buildSession({exercices, duree, avecEchauffement, avecRetour}, deps)
   - exercices : identifiants de exercises.json (jamais retirés de la séance)
   - duree : minutes visées (±1 min, mesuré avec expand())
   - deps (facultatif) : {expand, bibliotheque} ; par défaut les globales expand() et EXERCISES de la page. */

const GEN = {
  ORDER: ["échauffement", "mobilité", "équilibre", "renfo", "gainage", "étirement", "retour au calme"],
  ROUNDS: [1, 3], WORK: [30, 50], REST: [15, 30],
  TOL: 60,            // tolérance sur la durée, en secondes
  NATURAL: {work: 40, rest: 20}  // à durée équivalente, on garde les valeurs les plus courantes
};

function genRank(type) {
  const i = GEN.ORDER.indexOf(type);
  return i < 0 ? GEN.ORDER.indexOf("gainage") + 0.5 : i;
}

// Programme au format PROGRAMS pour des paramètres donnés.
function genProgram(parts, p) {
  const blk = (name, ids, extra) => ids.length ? [{name, rounds: 1, rest: 10, transition: 15, items: ids.map(ex => ({ex})), ...extra}] : [];
  return {
    name: "Séance générée", sub: "", prep: 10, switchTime: 5,
    blocks: [
      ...blk("Échauffement", parts.echauffement),
      ...blk("Mobilité", parts.mobilite),
      ...(parts.circuit.length ? [{
        name: "Circuit", rounds: p.rounds, rest: p.rest, roundRest: p.rest + 30, transition: 15,
        items: parts.circuit.map(ex => ({ex, work: p.work}))
      }] : []),
      ...blk("Étirements", parts.etirement),
      ...blk("Retour au calme", parts.retour)
    ]
  };
}

function genMeasure(parts, p, expand) {
  const prog = genProgram(parts, p);
  return {prog, secs: expand(prog).reduce((a, s) => a + s.dur, 0)};
}

function buildSession(opts, deps) {
  deps = deps || {};
  const expand_ = deps.expand || (typeof expand !== "undefined" ? expand : null);
  const lib = deps.bibliotheque || (typeof EXERCISES !== "undefined" ? EXERCISES : null);
  if (!expand_ || !lib) throw new Error("buildSession : expand() et la bibliothèque sont nécessaires.");
  const avertissements = [];
  const cible = Math.round((opts.duree || 0) * 60);

  // Sélection : doublons et identifiants inconnus écartés (avec avertissement)
  const ids = [...new Set(opts.exercices || [])];
  const connus = ids.filter(id => lib[id]);
  ids.filter(id => !lib[id]).forEach(id => avertissements.push(`Exercice inconnu ignoré : « ${id} ».`));
  // ordreLibre : le circuit garde l'ordre fourni (génération automatique) ; sinon tri par type
  const choisis = opts.ordreLibre ? connus : connus.map((id, i) => ({id, i})).sort((a, b) =>
    genRank(lib[a.id].type) - genRank(lib[b.id].type) || a.i - b.i).map(x => x.id);
  const typeOf = id => lib[id].type;
  const parts = {
    echauffement: choisis.filter(id => typeOf(id) === "échauffement"),
    mobilite: choisis.filter(id => typeOf(id) === "mobilité"),
    circuit: choisis.filter(id => ["équilibre", "renfo", "gainage"].includes(typeOf(id)) || genRank(typeOf(id)) === genRank("gainage") + 0.5),
    etirement: choisis.filter(id => typeOf(id) === "étirement"),
    retour: choisis.filter(id => typeOf(id) === "retour au calme")
  };
  if (!choisis.length) {
    return {programme: null, duree: 0, avertissements: ["Aucun exercice sélectionné."], proposition: null, parametres: null, ajoutes: []};
  }

  // Ajouts automatiques depuis la bibliothèque (seuls exercices que le générateur peut retirer)
  const ajoutes = [], optionnels = [];
  const premier = type => Object.keys(lib).find(id => lib[id].type === type && !choisis.includes(id));
  if (opts.avecEchauffement && !parts.echauffement.length) {
    const id = premier("échauffement"); if (id) {parts.echauffement.push(id); ajoutes.push(id)}
    else avertissements.push("Aucun exercice d'échauffement dans la bibliothèque.");
    if (!parts.mobilite.length && cible >= 20 * 60) {
      Object.keys(lib).filter(k => lib[k].type === "mobilité" && !lib[k].unilateral && !(lib[k].equipment || []).some(e => e !== "aucun"))
        .slice(0, 2).forEach(k => {parts.mobilite.push(k); ajoutes.push(k); optionnels.push(k)});
    }
  }
  if (opts.avecRetour && !parts.retour.length) {
    const id = premier("retour au calme"); if (id) {parts.retour.push(id); ajoutes.push(id)}
    else avertissements.push("Aucun exercice de retour au calme dans la bibliothèque.");
  }

  const minP = {rounds: GEN.ROUNDS[0], work: GEN.WORK[0], rest: GEN.REST[0]};
  const maxP = {rounds: GEN.ROUNDS[1], work: GEN.WORK[1], rest: GEN.REST[1]};

  // Trop long même au minimum : on retire d'abord les mobilités ajoutées automatiquement, jamais les exercices choisis
  while (optionnels.length && genMeasure(parts, minP, expand_).secs > cible + GEN.TOL) {
    const id = optionnels.pop();
    parts.mobilite.splice(parts.mobilite.indexOf(id), 1); ajoutes.splice(ajoutes.indexOf(id), 1);
  }

  const mini = genMeasure(parts, minP, expand_), maxi = genMeasure(parts, maxP, expand_);
  let best = null, proposition = null;
  if (!parts.circuit.length || mini.secs > cible + GEN.TOL) {
    best = {p: minP, ...mini};   // sans circuit rien à ajuster ; trop long : on garde le minimum
  } else if (maxi.secs < cible - GEN.TOL) {
    best = {p: maxP, ...maxi};   // trop court : on garde le maximum
  } else {
    for (let rounds = GEN.ROUNDS[0]; rounds <= GEN.ROUNDS[1]; rounds++)
      for (let work = GEN.WORK[0]; work <= GEN.WORK[1]; work++)
        for (let rest = GEN.REST[0]; rest <= GEN.REST[1]; rest++) {
          const p = {rounds, work, rest}, m = genMeasure(parts, p, expand_), ecart = Math.abs(m.secs - cible);
          // d'abord l'écart à la cible (par tranches de 15 s), puis la proximité des valeurs usuelles, puis l'écart exact
          const score = [Math.floor(ecart / 15), Math.abs(work - GEN.NATURAL.work) + Math.abs(rest - GEN.NATURAL.rest) + (rounds === 2 ? 0 : 1), ecart];
          if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2]))))
            best = {p, ...m, score};
        }
  }

  const min = m => Math.round(m / 60);
  if (best.secs > cible + GEN.TOL) {
    proposition = {duree: min(best.secs)};
    avertissements.push(`Trop long : ces exercices demandent au minimum ${min(mini.secs)} min pour ${min(cible)} min demandées. ` +
      `Proposition : viser ${proposition.duree} min, ou retirer des exercices.`);
  } else if (best.secs < cible - GEN.TOL) {
    proposition = {duree: min(best.secs)};
    avertissements.push(`Trop court : au maximum ${min(maxi.secs)} min avec ces exercices pour ${min(cible)} min demandées. ` +
      `Proposition : ajouter des exercices, ou viser ${proposition.duree} min.`);
  }

  const programme = best.prog;
  programme.name = `Séance ${min(best.secs)} min`;
  programme.sub = parts.circuit.length
    ? `${best.p.rounds} tour${best.p.rounds > 1 ? "s" : ""} · ${best.p.work} s de travail · ${best.p.rest} s de repos`
    : "Séance générée";
  return {programme, duree: best.secs, avertissements, proposition,
    parametres: parts.circuit.length ? best.p : null, ajoutes};
}

/* ---------- Génération automatique ---------- */

GEN.ZONES = {
  "jambes": ["quadriceps", "ischio-jambiers", "mollets"],
  "fessiers-hanches": ["fessiers", "hanches"],
  "pied-cheville": ["pied-cheville"],
  "tronc": ["tronc"],
  "haut-corps": ["dos", "épaules", "bras"],
  "corps-entier": ["fessiers", "ischio-jambiers", "quadriceps", "mollets", "pied-cheville", "hanches", "tronc", "dos", "épaules", "bras"]
};
GEN.ZONE_LABELS = {"jambes": "Jambes", "fessiers-hanches": "Fessiers et hanches", "pied-cheville": "Pied et cheville",
  "tronc": "Tronc", "haut-corps": "Haut du corps", "corps-entier": "Corps entier"};
GEN.TYPES_AUTO = ["mobilité", "équilibre", "renfo", "gainage", "étirement"]; // échauffement et retour au calme : ajoutés par buildSession
GEN.TOUJOURS = ["aucun", "tapis", "mur", "chaise", "step"];
GEN.MIN_EXOS = 3;
GEN.MAX_PAR_TYPE = {"mobilité": 2, "étirement": 2}; // blocs séparés du circuit : on les limite
GEN.MAX_SUITE = 2;                                  // jamais plus de 2 exercices du même type d'affilée

// Générateur pseudo-aléatoire à graine (mulberry32) et jitter stable par (graine, exercice)
function genRand(seed) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296};
}
function genHash(str) {let h = 2166136261; for (let i = 0; i < str.length; i++) {h ^= str.charCodeAt(i); h = Math.imul(h, 16777619)} return h >>> 0}
const genJitter = (seed, id) => genRand((seed ^ genHash(id)) >>> 0)();

function genZonesOf(e, zones) {return zones.filter(z => (e.muscles || []).some(m => GEN.ZONES[z].includes(m)))}

// Exercices admissibles : zones, matériel (null = pas de limite), impact.
function genPool(lib, o) {
  const dispo = o.materiel ? new Set([...GEN.TOUJOURS, ...o.materiel]) : null;
  return Object.keys(lib).filter(id => {
    const e = lib[id];
    return GEN.TYPES_AUTO.includes(e.type)
      && (!dispo || (e.equipment || ["aucun"]).every(q => dispo.has(q)))
      && (!o.sansImpact || (e.impact || "aucun") === "aucun")
      && genZonesOf(e, o.zones).length > 0;
  });
}

// Choisit n exercices dans le pool et les ordonne : alternance des groupes musculaires, pas plus de 2 du même type d'affilée,
// exercices récents (evites) en dernier recours.
function genPick(lib, pool, o, n) {
  const evites = new Set(o.evites || []), restants = pool.slice(), res = [], circ = [];
  const couvert = new Set(), parType = {};
  const prim = id => (lib[id].muscles || [])[0];
  while (res.length < n && restants.length) {
    // alternance et suites de types calculées sur le circuit seul : mobilités et étirements ont leurs propres blocs
    const pid = circ[circ.length - 1], prev = pid && lib[pid], prev2 = circ.length > 1 && lib[circ[circ.length - 2]];
    let best = null;
    restants.forEach(id => {
      const e = lib[id], zs = genZonesOf(e, o.zones), enCircuit = !GEN.MAX_PAR_TYPE[e.type];
      if (!enCircuit && (parType[e.type] || 0) >= GEN.MAX_PAR_TYPE[e.type]) return;
      let sc = genJitter(o.graine, id) * 1.5;
      if (!evites.has(id)) sc += 2;
      if (zs.some(z => !couvert.has(z))) sc += 4;
      if (enCircuit && prev) {
        if (prim(pid) !== prim(id)) sc += 3;
        if (!zs.some(z => genZonesOf(prev, o.zones).includes(z))) sc += 1;
        if (prev2 && prev.type === e.type && prev2.type === e.type) sc -= 100;
      }
      if (!best || sc > best.sc) best = {id, sc};
    });
    if (!best) break;
    res.push(best.id); restants.splice(restants.indexOf(best.id), 1);
    const e = lib[best.id]; parType[e.type] = (parType[e.type] || 0) + 1;
    if (!GEN.MAX_PAR_TYPE[e.type]) circ.push(best.id);
    genZonesOf(e, o.zones).forEach(z => couvert.add(z));
  }
  return res;
}

const GEN_ZONE_NOMS = z => (GEN.ZONE_LABELS[z] || z).toLowerCase();

/* buildAuto({zones, duree, sansImpact, materiel, evites, graine, avecEchauffement, avecRetour}, deps)
   → {programme, duree, avertissements, proposition, parametres, ajoutes, exercices} ou {erreur}. */
function buildAuto(opts, deps) {
  deps = deps || {};
  const lib = deps.bibliotheque || (typeof EXERCISES !== "undefined" ? EXERCISES : null);
  const zones = (opts.zones || []).filter(z => GEN.ZONES[z]);
  if (!zones.length) return {erreur: "Choisis au moins une zone."};
  const o = {zones, sansImpact: !!opts.sansImpact, materiel: opts.materiel || null, evites: opts.evites || [], graine: opts.graine || 1};
  const pool = genPool(lib, o);
  const sansZone = zones.filter(z => z !== "corps-entier" && !pool.some(id => genZonesOf(lib[id], [z]).length));
  const conseil = " Élargis les zones, décoche « sans impact » ou coche du matériel dans ton profil.";
  if (sansZone.length) return {erreur: `Aucun exercice disponible pour : ${sansZone.map(GEN_ZONE_NOMS).join(", ")}, avec ces contraintes.` + conseil};
  if (pool.length < GEN.MIN_EXOS) return {erreur: `Seulement ${pool.length} exercice${pool.length > 1 ? "s" : ""} correspond${pool.length > 1 ? "ent" : ""} à ces contraintes ; il en faut au moins ${GEN.MIN_EXOS} pour une séance.` + conseil};

  const cible = Math.round((opts.duree || 0) * 60), tol = GEN.TOL;
  const essai = n => {
    const ex = genPick(lib, pool, o, n);
    const r = buildSession({exercices: ex, duree: opts.duree, avecEchauffement: opts.avecEchauffement, avecRetour: opts.avecRetour, ordreLibre: true}, deps);
    return {r, ex};
  };
  // Nombre d'exercices : estimation, puis ajustement d'après la durée mesurée
  let n = Math.max(GEN.MIN_EXOS, Math.min(pool.length, Math.round((cible - 180) / 130))), vus = new Set(), cur = null;
  for (;;) {
    cur = essai(n); vus.add(n);
    const trop = cur.r.duree - cible;
    const suivant = trop > tol ? n - 1 : trop < -tol ? n + 1 : n;
    if (suivant === n || vus.has(suivant) || suivant < GEN.MIN_EXOS || suivant > pool.length) break;
    n = suivant;
  }
  const ecart = cur.r.duree - cible;
  if (ecart < -tol) {
    // Même avec tous les exercices disponibles la durée n'est pas atteignable : on le dit plutôt que livrer une séance incomplète
    const maxi = essai(pool.length);
    return {erreur: `Avec ces contraintes, la bibliothèque ne permet d'aller que jusqu'à environ ${Math.round(maxi.r.duree / 60)} min (${maxi.ex.length} exercices). ` +
      `Réduis la durée à ${Math.round(maxi.r.duree / 60)} min ou moins, ou élargis les zones, le matériel ou l'impact.`};
  }
  return {...cur.r, exercices: cur.ex};
}

// Exercices équivalents à `id` : même type, au moins un muscle commun, mêmes contraintes ; les plus proches d'abord.
function genEquivalents(lib, id, o) {
  const e = lib[id], dispo = o.materiel ? new Set([...GEN.TOUJOURS, ...o.materiel]) : null, deja = new Set(o.courants || []);
  const evites = new Set(o.evites || []);
  return Object.keys(lib).filter(k => !deja.has(k) && lib[k].type === e.type
      && (!dispo || (lib[k].equipment || ["aucun"]).every(q => dispo.has(q)))
      && (!o.sansImpact || (lib[k].impact || "aucun") === "aucun"))
    .map(k => ({k, commun: (lib[k].muscles || []).filter(m => (e.muscles || []).includes(m)).length}))
    .filter(x => x.commun > 0)
    .sort((a, b) => (evites.has(a.k) - evites.has(b.k)) || b.commun - a.commun || genJitter(o.graine || 1, a.k) - genJitter(o.graine || 1, b.k))
    .map(x => x.k);
}

if (typeof module !== "undefined") module.exports = {buildSession, buildAuto, genEquivalents, GEN};
