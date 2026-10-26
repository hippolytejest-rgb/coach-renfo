# Coach Renfo — contexte projet

## But
Piloter les séances de renfo d'un traileur (prépa Veni Vici 52 km / nov. 2026, puis Templiers 80 km / oct. 2027).
L'app enchaîne seule les exercices avec voix, bips, timer et silhouette animée, comme une vidéo de coach.
Utilisée sur Mac (Chrome ou Safari) et iPhone (Safari), écran posé au sol pendant la séance.

## Contraintes techniques
- Pas d'étape de build : HTML, CSS et JavaScript vanilla, ouverts tels quels dans le navigateur.
- Interface et voix en français.
- Voix : `speechSynthesis`. Elle ne marche pas dans la vue intégrée de l'app Claude sur Mac : tester dans Chrome ou Safari.
- Audio et voix démarrent uniquement après un clic (règle iOS) : le bouton Démarrer débloque les deux.
- Écran maintenu allumé avec la Wake Lock API.
- Mise en page pensée d'abord pour l'iPhone en portrait : rien ne doit se superposer.

## Structure
- `index.html`
  - `PROGRAMS` : les programmes (blocs → exercices). Champs exercice : `name`, `work` (s), `desc`, `reps`,
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
- Tester le programme « Démo 1 minute » : voix, bips, enchaînement, animations.
- Après une modification de `figure.js`, vérifier chaque animation touchée sur un cycle complet :
  aucune erreur console, mains et pieds en appui qui restent au sol.

## Idées en attente
- Programmes synchronisés entre Mac et iPhone (fichier JSON dans le dépôt plutôt que localStorage).
- Hébergement sur GitHub Pages, installable sur l'écran d'accueil, utilisable hors ligne.

## Bibliothèque d'exercices
- `exercises.json` = seed. La bibliothèque active est `LIB` (clé locale `coach-renfo-lib`, commune à tous les profils), lue via `getLibrary()`.
- Synchro Gist : fichier `lib.json`, fusion par id (`updatedAt`), suppressions en pierres tombales (`deleted`). Copie de sécurité locale : `coach-renfo-libbackup`.

## Page de séance (Activités › Bibliothèque › Mes séances)
- Un clic sur une séance de la liste ouvre sa page (pile `["biblio","seance",id]`, `history.pushState`). État : `sx`. Rendu : `renderSession()`.
- Mode édition sur une copie (`sx.draft`), écrite dans `sessions` seulement à « Enregistrer ». Le format d'origine de chaque item (`ex:"id"` ou en ligne) est conservé ; seuls les ajouts prennent la forme `{ex:"id"}`.
- Sélecteur d'exercices (`openPicker`) : ajout multiple ou remplacement d'un exercice supprimé.
- Glisser-déposer aux Pointer Events sur la poignée (`touch-action:none` sur la poignée seule) ; clavier : espace, flèches, espace.
- Piège de test : le profil actif de localhost peut être le vrai profil avec synchro Gist active. Ne jamais écrire `sessions` dans un vrai profil : utiliser un profil jetable.
