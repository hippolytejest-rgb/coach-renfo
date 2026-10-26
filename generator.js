/* Générateur de séances : fonctions pures, sans accès à l'interface.
   buildSession({exercices, duree, avecEchauffement, avecRetour}, deps)
   - exercices : identifiants de la bibliothèque (getLibrary()) (jamais retirés de la séance)
   - duree : minutes visées (±1 min, mesuré avec expand())
   - ordreBlocs (facultatif) : noms de blocs dans l'ordre voulu (« Mobilité », « Échauffement »…) ; les autres blocs suivent.
   - deps (facultatif) : {expand, bibliotheque} ; par défaut les globales expand() et getLibrary() de la page. */

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
  const lib = deps.bibliotheque || (typeof getLibrary === "function" ? getLibrary() : null);
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
  if (opts.ordreBlocs) {
    const rang = b => { const i = opts.ordreBlocs.indexOf(b.name); return i < 0 ? opts.ordreBlocs.length : i };
    programme.blocks = programme.blocks.map((b, i) => ({b, i})).sort((x, y) => rang(x.b) - rang(y.b) || x.i - y.i).map(x => x.b);
  }
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
  "haut-corps": ["dos", "épaules", "bras", "pectoraux", "cou"],
  // zones à un seul muscle, utilisées par les préréglages (absentes de ZONE_LABELS : pas proposées au choix)
  "fessiers": ["fessiers"], "hanches": ["hanches"], "quadriceps": ["quadriceps"], "mollets": ["mollets"],
  "ischio-jambiers": ["ischio-jambiers"], "dos": ["dos"], "épaules": ["épaules"], "cou": ["cou"], "pectoraux": ["pectoraux"],
  "corps-entier": ["fessiers", "ischio-jambiers", "quadriceps", "mollets", "pied-cheville", "hanches", "tronc", "dos", "épaules", "bras", "pectoraux", "cou"]
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

// Sports d'un exercice (champ sports de exercises.json) ; « général » à défaut. Un exercice convient à un sport s'il le cite ou s'il est « général ».
const genSports = e => e.sports && e.sports.length ? e.sports : ["général"];
const genConvientSport = (e, sport) => !sport || genSports(e).some(x => x === sport || x === "général");

// Exercices admissibles : types (o.types, sinon TYPES_AUTO), sport, zones, matériel (null = pas de limite), impact.
function genPool(lib, o) {
  const dispo = o.materiel ? new Set([...GEN.TOUJOURS, ...o.materiel.map(m => m.toLowerCase())]) : null;
  return Object.keys(lib).filter(id => {
    const e = lib[id];
    return (o.types || GEN.TYPES_AUTO).includes(e.type)
      && genConvientSport(e, o.sport)
      && (!dispo || (e.equipment || ["aucun"]).every(q => dispo.has(q.toLowerCase())))
      && (!o.sansImpact || (e.impact || "aucun") === "aucun")
      && genZonesOf(e, o.zones).length > 0;
  });
}

// Choisit n exercices dans le pool et les ordonne : alternance des groupes musculaires, pas plus de 2 du même type d'affilée,
// exercices récents (evites) en dernier recours.
function genPick(lib, pool, o, n) {
  const evites = new Set(o.evites || []), restants = pool.slice(), res = [], circ = [];
  const couvert = new Set(), parType = {}, maxPT = o.maxParType || GEN.MAX_PAR_TYPE;
  const prim = id => (lib[id].muscles || [])[0];
  const prendre = id => {
    res.push(id); restants.splice(restants.indexOf(id), 1);
    const e = lib[id]; parType[e.type] = (parType[e.type] || 0) + 1;
    if (!maxPT[e.type]) circ.push(id);
    genZonesOf(e, o.zones).forEach(z => couvert.add(z));
  };
  // Exigences (o.exiger : [{test}]) : on place d'abord un exercice qui les satisfait, même si n est petit
  (o.exiger || []).forEach(x => {
    if (res.some(id => x.test(lib[id]))) return;
    const cand = restants.filter(id => x.test(lib[id]))
      .sort((a, b) => (evites.has(a) - evites.has(b)) || genJitter(o.graine, b) - genJitter(o.graine, a));
    if (cand.length) prendre(cand[0]);
  });
  while (res.length < n && restants.length) {
    // alternance et suites de types calculées sur le circuit seul : mobilités et étirements ont leurs propres blocs
    const pid = circ[circ.length - 1], prev = pid && lib[pid], prev2 = circ.length > 1 && lib[circ[circ.length - 2]];
    let best = null;
    restants.forEach(id => {
      const e = lib[id], zs = genZonesOf(e, o.zones), enCircuit = !maxPT[e.type];
      if (!enCircuit && (parType[e.type] || 0) >= maxPT[e.type]) return;
      let sc = genJitter(o.graine, id) * 1.5;
      if (!evites.has(id)) sc += 2;
      if (o.sport && genSports(e).includes(o.sport)) sc += 2;
      if (zs.some(z => !couvert.has(z))) sc += 4;
      if (enCircuit && prev) {
        if (prim(pid) !== prim(id)) sc += 3;
        if (!zs.some(z => genZonesOf(prev, o.zones).includes(z))) sc += 1;
        if (prev2 && prev.type === e.type && prev2.type === e.type) sc -= 100;
      }
      if (!best || sc > best.sc) best = {id, sc};
    });
    if (!best) break;
    prendre(best.id);
  }
  return res;
}

const GEN_ZONE_NOMS = z => (GEN.ZONE_LABELS[z] || z).toLowerCase();

/* buildAuto({zones, duree, sansImpact, materiel, evites, graine, avecEchauffement, avecRetour}, deps)
   → {programme, duree, avertissements, proposition, parametres, ajoutes, exercices} ou {erreur}.
   Options des préréglages (voir buildPreset) : types (types admis), maxParType, sport, exiger [{label, test}],
   tri (ids, bibliotheque → ids), ordreBlocs, estim {fixe, par} (secondes : durée fixe + durée moyenne par exercice).
   Une erreur de durée porte aussi maxMin : la durée maximale que la bibliothèque permet. */
function buildAuto(opts, deps) {
  deps = deps || {};
  const lib = deps.bibliotheque || (typeof getLibrary === "function" ? getLibrary() : null);
  const zones = (opts.zones || []).filter(z => GEN.ZONES[z]);
  if (!zones.length) return {erreur: "Choisis au moins une zone."};
  const o = {zones, sansImpact: !!opts.sansImpact, materiel: opts.materiel || null, evites: opts.evites || [], graine: opts.graine || 1,
    types: opts.types, maxParType: opts.maxParType, sport: opts.sport, exiger: opts.exiger};
  const pool = genPool(lib, o);
  const sansZone = zones.filter(z => z !== "corps-entier" && !pool.some(id => genZonesOf(lib[id], [z]).length));
  const conseil = " Élargis les zones, décoche « sans impact » ou coche du matériel dans ton profil.";
  if (sansZone.length) return {erreur: `Aucun exercice disponible pour : ${sansZone.map(GEN_ZONE_NOMS).join(", ")}, avec ces contraintes.` + conseil};
  if (pool.length < GEN.MIN_EXOS) return {erreur: `Seulement ${pool.length} exercice${pool.length > 1 ? "s" : ""} correspond${pool.length > 1 ? "ent" : ""} à ces contraintes ; il en faut au moins ${GEN.MIN_EXOS} pour une séance.` + conseil};

  const cible = Math.round((opts.duree || 0) * 60), tol = GEN.TOL;
  const essai = n => {
    let ex = genPick(lib, pool, o, n);
    if (opts.tri) ex = opts.tri(ex, lib);
    const r = buildSession({exercices: ex, duree: opts.duree, avecEchauffement: opts.avecEchauffement, avecRetour: opts.avecRetour,
      ordreLibre: true, ordreBlocs: opts.ordreBlocs}, deps);
    return {r, ex};
  };
  // Nombre d'exercices : estimation, puis ajustement d'après la durée mesurée
  const estim = opts.estim || {fixe: 180, par: 130};
  let n = Math.max(GEN.MIN_EXOS, Math.min(pool.length, Math.round((cible - estim.fixe) / estim.par))), vus = new Set(), cur = null;
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
      `Réduis la durée à ${Math.round(maxi.r.duree / 60)} min ou moins, ou élargis les zones, le matériel ou l'impact.`,
      maxMin: Math.round(maxi.r.duree / 60), nbMax: maxi.ex.length};
  }
  return {...cur.r, exercices: cur.ex};
}

// Exercices équivalents à `id` : même type, au moins un muscle commun, mêmes contraintes ; les plus proches d'abord.
function genEquivalents(lib, id, o) {
  const e = lib[id], dispo = o.materiel ? new Set([...GEN.TOUJOURS, ...o.materiel.map(m => m.toLowerCase())]) : null, deja = new Set(o.courants || []);
  const evites = new Set(o.evites || []);
  // une exigence (ex. « au moins un exercice d'équilibre ») que `id` est seul à satisfaire doit rester satisfaite
  const exigees = (o.exiger || []).filter(x => x.test(e) && !(o.courants || []).some(c => c !== id && x.test(lib[c])));
  return Object.keys(lib).filter(k => !deja.has(k) && lib[k].type === e.type
      && genConvientSport(lib[k], o.sport) && (!o.zones || genZonesOf(lib[k], o.zones).length > 0)
      && exigees.every(x => x.test(lib[k]))
      && (!dispo || (lib[k].equipment || ["aucun"]).every(q => dispo.has(q.toLowerCase())))
      && (!o.sansImpact || (lib[k].impact || "aucun") === "aucun"))
    .map(k => ({k, commun: (lib[k].muscles || []).filter(m => (e.muscles || []).includes(m)).length}))
    .filter(x => x.commun > 0)
    .sort((a, b) => (evites.has(a.k) - evites.has(b.k)) || b.commun - a.commun || genJitter(o.graine || 1, a.k) - genJitter(o.graine || 1, b.k))
    .map(x => x.k);
}

/* ---------- Préréglages (Quotidien, Échauffement, Récupération) ---------- */

// Du plus doux au plus dynamique : mobilité avant échauffement, sans impact avant impact, au sol avant debout.
GEN.douceur = e => (e.type === "échauffement" ? 10 : 0) + ({aucun: 0, faible: 1, "élevé": 2}[e.impact || "aucun"]) * 3
  + ((e.tags || []).includes("cardio") ? 2 : 0) + (e.position === "debout" ? 1 : 0);
GEN.triDouceur = (ids, lib) => ids.map((id, i) => ({id, i})).sort((a, b) => GEN.douceur(lib[a.id]) - GEN.douceur(lib[b.id]) || a.i - b.i).map(x => x.id);

GEN.EQUILIBRE = {label: "un exercice d'équilibre", test: e => e.type === "équilibre" || (e.type !== "mobilité" && (e.tags || []).includes("équilibre"))};

/* Un préréglage fixe les zones (ou les laisse choisir : parZone), les types d'exercices, le sport et l'ordre.
   options : cases proposées à l'étape durée (echauffement / retour = ajoutés par buildSession). */
const GEN_QUOTIDIEN = [10, 20, 30, 45], GEN_ECHAUFFEMENT = [5, 10, 15], GEN_RECUP = [5, 10, 15, 20];
const GEN_ECH = {types: ["mobilité", "échauffement"], tri: "douceur", ordreBlocs: ["Mobilité", "Échauffement"], maxParType: {}, estim: {fixe: 30, par: 55}, durees: GEN_ECHAUFFEMENT, defaut: 10};
const GEN_REC = {types: ["étirement", "retour au calme"], maxParType: {}, estim: {fixe: 30, par: 55}, durees: GEN_RECUP, defaut: 10};
GEN.PRESETS = {
  "quotidien-quick-gym": {titre: "Quick gym", zones: ["corps-entier"], durees: GEN_QUOTIDIEN, defaut: 20, autour: "seuil"},
  "quotidien-par-zone": {titre: "Quotidien par zone", parZone: true, durees: GEN_QUOTIDIEN, defaut: 20, options: true},
  "quotidien-renfo-trail": {titre: "Renfo trail", sport: "trail", exiger: [GEN.EQUILIBRE], durees: GEN_QUOTIDIEN, defaut: 20, options: true,
    zones: ["pied-cheville", "mollets", "fessiers", "hanches", "quadriceps", "tronc"]},
  "echauffement-par-zone": {...GEN_ECH, titre: "Échauffement par zone", parZone: true},
  "echauffement-trail": {...GEN_ECH, titre: "Échauffement trail", sport: "trail", zones: ["pied-cheville", "hanches", "fessiers"]},
  "echauffement-cyclisme": {...GEN_ECH, titre: "Échauffement cyclisme", sport: "cyclisme", zones: ["hanches", "dos", "épaules"]},
  "recuperation-par-zone": {...GEN_REC, titre: "Récupération par zone", parZone: true},
  "recuperation-trail": {...GEN_REC, titre: "Récupération trail", sport: "trail", zones: ["mollets", "quadriceps", "ischio-jambiers", "fessiers", "pied-cheville"]},
  "recuperation-cyclisme": {...GEN_REC, titre: "Récupération cyclisme", sport: "cyclisme", zones: ["hanches", "quadriceps", "dos", "épaules", "cou"]}
};
GEN.SEUIL_AUTOUR = 20; // Quick gym : échauffement et retour au calme courts au-delà de 20 min

/* buildPreset(id, {zones, duree, sansImpact, materiel, evites, graine, avecEchauffement, avecRetour, exercices}, deps)
   Réutilise buildAuto (choix des exercices) et buildSession (durée). `exercices` : liste imposée (remplacement d'un exercice).
   Même résultat que buildAuto ; une bibliothèque insuffisante donne {erreur, manque: [...]} qui dit ce qui manque. */
function buildPreset(id, opts, deps) {
  deps = deps || {};
  const P = GEN.PRESETS[id], lib = deps.bibliotheque || (typeof getLibrary === "function" ? getLibrary() : null);
  if (!P) return {erreur: `Préréglage inconnu : « ${id} ».`};
  const zones = P.zones || (opts.zones || []).filter(z => GEN.ZONES[z]);
  if (!zones.length) return {erreur: "Choisis au moins une zone."};
  const types = P.types || GEN.TYPES_AUTO, typesTxt = types.join(" / ");

  // Ce que la bibliothèque ne contient pas du tout (indépendamment du matériel et de l'impact choisis)
  const manque = [];
  zones.filter(z => z !== "corps-entier" && !genPool(lib, {zones: [z], types, sport: P.sport}).length)
    .forEach(z => manque.push(`${GEN_ZONE_NOMS(z)} (${typesTxt})`));
  const horsContraintes = genPool(lib, {zones, types, sport: P.sport});
  (P.exiger || []).filter(x => !horsContraintes.some(k => x.test(lib[k]))).forEach(x => manque.push(x.label));
  if (manque.length) return {erreur: `Il manque des exercices dans la bibliothèque pour « ${P.titre} » : ${manque.join(", ")}.`, manque};

  const seuil = P.autour === "seuil" ? opts.duree > GEN.SEUIL_AUTOUR : null;
  const c = {
    duree: opts.duree, sansImpact: opts.sansImpact, materiel: opts.materiel, evites: opts.evites, graine: opts.graine, zones,
    avecEchauffement: seuil !== null ? seuil : P.options ? opts.avecEchauffement !== false : false,
    avecRetour: seuil !== null ? seuil : P.options ? opts.avecRetour !== false : false,
    types: P.types, maxParType: P.maxParType, sport: P.sport, exiger: P.exiger, estim: P.estim, ordreBlocs: P.ordreBlocs,
    tri: P.tri === "douceur" ? GEN.triDouceur : null
  };
  let r;
  if (opts.exercices) {
    const ex = c.tri ? c.tri(opts.exercices, lib) : opts.exercices;
    r = {...buildSession({exercices: ex, duree: c.duree, avecEchauffement: c.avecEchauffement, avecRetour: c.avecRetour, ordreLibre: true, ordreBlocs: c.ordreBlocs}, deps), exercices: ex};
  } else {
    r = buildAuto(c, deps);
  }
  if (r.erreur) {
    if (r.maxMin !== undefined) {
      r.manque = [`environ ${Math.max(opts.duree - r.maxMin, 1)} min d'exercices (${typesTxt})`];
      r.erreur = `La bibliothèque ne permet pour « ${P.titre} » que ${r.maxMin} min au maximum (${r.nbMax} exercices) : il manque ${r.manque[0]} pour ${opts.duree} min. ` +
        `Choisis ${r.maxMin} min ou moins, ou ajoute des exercices à la bibliothèque.`;
    }
    return r;
  }
  if (r.programme) r.programme.name = `${P.titre} ${Math.round(r.duree / 60)} min`;
  return r;
}

if (typeof module !== "undefined") module.exports = {buildSession, buildAuto, buildPreset, genEquivalents, GEN};
