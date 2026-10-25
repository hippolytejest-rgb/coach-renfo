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
  const choisis = connus.map((id, i) => ({id, i})).sort((a, b) =>
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

if (typeof module !== "undefined") module.exports = {buildSession, GEN};
