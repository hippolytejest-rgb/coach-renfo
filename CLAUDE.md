# Coach Renfo — contexte projet

## But
Piloter les séances de renfo d'un traileur (prépa Veni Vici 52 km / nov. 2026, puis Templiers 80 km / oct. 2027).
L'app enchaîne seule les exercices avec voix, bips et jauge chrono, un écran plein de couleur par état (silhouette animée réservée à la démo de la Bibliothèque).
Utilisée sur Mac (Chrome ou Safari) et iPhone (Safari), écran posé au sol pendant la séance.

## Contraintes techniques
- Pas d'étape de build : HTML, CSS et JavaScript vanilla, ouverts tels quels dans le navigateur.
- Interface et voix en français.
- Voix : réglage du profil « Voix » femme/homme (champ `voix`, synchronisé). Clips MP3 pré-générés par voix (`audio/femme/` fr-FR-DeniseNeural, `audio/homme/` fr-FR-HenriNeural, un `manifest.json` chacun) ; `speechSynthesis` en secours pour un texte sans clip, avec une voix système du même genre seulement (`TTS_NAMES`), sinon bip. Jamais l'autre genre, et une seule voix par séance (`state.voix`, `state.tts` figés au lancement). La synthèse ne marche pas dans la vue intégrée de l'app Claude sur Mac : tester dans Chrome ou Safari.
- Après ajout/renommage d'exo, de séance (ou d'une phrase fixe), relancer `python3 tools/gen-audio.py --gist` (`pip install edge-tts` ; `--gist` lit exercices personnels et séances du Gist via `gh`) : il ne génère que les clips manquants des deux voix et réécrit les manifestes (`--prune` supprime les orphelins). Puis bump de version. Le service worker ne précache que les clips de la voix choisie (message `{voix}` de la page, mémorisé dans le cache `coach-renfo-pref`) : les deux voix pèsent ~16 Mo.
- Audio et voix démarrent uniquement après un clic (règle iOS) : le bouton Démarrer débloque les deux.
- Écran maintenu allumé avec la Wake Lock API.
- Mise en page pensée d'abord pour l'iPhone en portrait : rien ne doit se superposer.

## Structure
- `index.html`
  - Programmes = séances de l'utilisateur (`sessions` du profil) ; aucun programme livré dans le code. Format (blocs → exercices). Champs exercice : `name`, `work` (s), `desc`, `reps`,
    `sides`, `sets`, `setRest`, `rest`, `anim`. Champs bloc : `rounds`, `rest`, `roundRest`, `transition`.
  - `expand()` transforme un programme en séquence de segments (prep, work, rest, switch).
  - Moteur : `tick()` toutes les 100 ms, `enter()`, `advance()`, annonces vocales dans `announce()`.
- `figure.js`
  - Vue de profil, personnage tourné vers la droite, canevas 240 × 170, sol à y = 152.
  - Une animation = des poses clés interpolées en boucle (`keys`, `dur`).
  - Membres en angles `[segment1, segment2, pied]`, ou en cible `{to:[x,y], bend:±1, foot}` résolue en
    cinématique inverse. Les appuis au sol utilisent des cibles fixes pour ne pas glisser.
  - `animFor()` associe un exercice à une animation d'après son nom, sauf si `anim` est précisé.

## Vérifier un changement
- Lancer `python3 -m http.server 8000` et ouvrir la page dans le navigateur.
- Créer une séance courte (2 exercices de 10 s) dans Activités › Bibliothèque, puis la lancer : voix, bips, enchaînement, animations (profil jetable).
- Après une modification de `figure.js`, vérifier chaque animation touchée sur un cycle complet :
  aucune erreur console, mains et pieds en appui qui restent au sol.

## Idées en attente
- Programmes synchronisés entre Mac et iPhone (fichier JSON dans le dépôt plutôt que localStorage).
- Hébergement sur GitHub Pages, installable sur l'écran d'accueil, utilisable hors ligne.

## Son (index.html, sections « Son »)
- Un seul `AudioContext` (`actx`), créé et repris par `unlockAudio()` au tap (Démarrer, Reprise, tout toucher si suspendu). Bips en oscillateur, clips décodés en `AudioBuffer` (cache `clipBufs`, préchargés au démarrage d'une séance). Pas de `new Audio()`.
- `speak(parts)` : une annonce = liste de morceaux (nom, répétitions, nombres et phrases fixes séparés) ; chaque morceau joue son clip si le manifeste de la voix connaît `normalize(texte)`, sinon Web Speech (voix du même genre), sinon rien ; une annonce dont rien n'a été dit devient un bip. Log console `[voix] clip|secours|ignoré`. Une nouvelle annonce coupe la précédente (`hush()`). `say()` = `speak()` si la voix est activée.
- Phrases fixes : `phrases.json` (le script signale une phrase absente de `index.html` et `generator.js`). `normalize()` de `index.html` et de `tools/gen-audio.py` doivent rester identiques (mêmes règles, même ordre ; espaces explicites, pas `\s`).
- Options › Son : Voix (femme/homme), Secours (voix système du genre choisi), « Tester le son » (bip + clip), « Voix de secours » (Web Speech seul). Diagnostic : voix, clips chargés, voix de secours retenue ou « aucune » (avertissement), compteur clip/secours/ignoré, textes sans clip (bibliothèque, séances, phrases, plus ceux entendus).

## Bibliothèque d'exercices
- `exercises.json` = seed. La bibliothèque active est `LIB` (clé locale `coach-renfo-lib`, commune à tous les profils), lue via `getLibrary()`.
- Plus de champs `type` ni `tags` (retirés en 1.24) : `libClean()` les ignore dans les anciennes données (comparaisons, export) et les omet à la prochaine écriture ; la synchro les laisse tels quels. Le rôle d'un exercice dans les séances générées (échauffement, mobilité, circuit, étirement…) vient de la table interne `GEN.ROLES` de `generator.js` ; un exercice absent de la table va dans le circuit.
- Synchro Gist : fichier `lib.json`, fusion par id (`updatedAt`), suppressions en pierres tombales (`deleted`). Copie de sécurité locale : `coach-renfo-libbackup`.

## Synchro des profils (`coach-renfo.json`, `mergeSync` → `mergeProfile`)
- `hist` : union (suppressions dans `hgone`). `equip`, `custom`, `voix` (`LWW`) : dernier modifié gagne, date par champ dans `fmt`. `sessions` : fusion par id (`updatedAt` dans chaque séance), suppressions en pierres tombales `sdel`. `setPdata()` pose toutes ces dates : ne pas écrire un profil autrement que par `setPdata`/`writePdata`.
- `mt` global toujours écrit pour les appareils antérieurs à 1.23 : ceux-ci publient sans `fmt` ni `sdel`. Si le profil distant n'a pas de `fmt`, on applique l'ancienne règle (champs en bloc selon `mt`), et ce que l'ancien appareil a changé est daté de son `mt`.
- Avant toute synchro qui change `custom`/`equip`/`sessions` : copie de sécurité `coach-renfo-pbackup` (tous les profils, sans `hist`), restaurable dans Options › Synchronisation.
- Tester la synchro sans Gist : un port par « appareil » (`localStorage` séparé), `G=mergeSync(G).out` en console d'un onglet à l'autre. Désenregistrer le service worker après chaque modification, sinon il sert l'ancien `index.html`.

## Page de séance (Activités › Bibliothèque › Mes séances)
- Un clic sur une séance de la liste ouvre sa page (pile `["biblio","seance",id]`, `history.pushState`). « Créer une séance » (bouton sous la liste ; état vide « Aucune séance pour l'instant ») ouvre `["biblio","seance","new"]` : même page en édition, séance vide, écrite dans `sessions` à « Enregistrer » puis `history.back()`. État : `sx`. Rendu : `renderSession()`.
- Mode édition sur une copie (`sx.draft`), écrite dans `sessions` seulement à « Enregistrer ». Le format d'origine de chaque item (`ex:"id"` ou en ligne) est conservé ; seuls les ajouts prennent la forme `{ex:"id"}`.
- Sélecteur d'exercices (`openPicker`) : page plein écran de la pile (`["biblio","seance",id,"ajout"|"remplacer"]`, vue `viewPicker`, état `pk`), recherche + filtres en haut, barre fixe « Ajouter (N) ». Le brouillon `sx` reste en mémoire ; au clic, `history.back()` ramène à la séance avec les ajouts à la fin. « Remplacer » : même page, un seul choix. Plus de popup.
- Lignes en édition (`sessRow`) : une ligne, sans miniature. Poignée ⋮⋮ discrète (24 × 44 px). Bouton rouge Supprimer derrière la ligne, révélé par glissement à gauche (`sessSwipe`, Pointer Events, seuil 40 px, `touch-action:pan-y`, pas depuis le bord gauche), au survol (souris) ou au focus clavier ; un seul ouvert à la fois ; jamais de suppression au seul glissement. Icône Dupliquer à droite. « Modifier » ne donne pas le focus au champ du titre (le clavier ne s'ouvre qu'au toucher).
- Toucher une ligne en édition (sans glisser : seuil 10 px, ignoré juste après un swipe ou s'il referme un Supprimer ouvert) ouvre le volet de réglages (`xsOpen`, état `xs`, `#xs` hors de `#setup` rendu `inert`) : travail, séries, repos entre séries, repos après. Valider écrit `work`/`sets`/`setRest`/`rest` dans l'item du brouillon, seulement s'ils diffèrent du défaut (bibliothèque puis bloc, `xsDef`) ; `resolveItem` → `expand` les lit déjà (lecteur, durée, aperçu). Annuler, fond, glissement vers le bas, Échap ou Retour = annuler. Réinitialiser masqué pour un ancien item en ligne.
- Glisser-déposer aux Pointer Events sur la poignée (`touch-action:none` sur la poignée seule) ; clavier : espace, flèches, espace.
- Piège de test : le profil actif de localhost peut être le vrai profil avec synchro Gist active. Ne jamais écrire `sessions` dans un vrai profil : utiliser un profil jetable.

## Page exercice (Bibliothèque)
- « Ajouter un exercice » et « Modifier » ouvrent une page dédiée (pile `["biblio","exercice","new"|id]`, `openExPage`, `openExForm`, état `ef`) avec barre Annuler / Enregistrer fixe en bas. Retour à la liste avec filtres, recherche et défilement (`libScroll`) conservés. Quitter avec des changements (Annuler ou Retour) demande confirmation, comme la page de séance.
- Plus de modale de formulaire, de section JSON, de filtre impact dans la Bibliothèque ni de panneau genBox (créateur À la main / Auto) : la génération passe par les cartes de rubriques. Le champ `impact` des exercices et l'option « Sans impact » du parcours restent.
