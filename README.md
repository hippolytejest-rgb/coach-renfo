# Renfo Batai

Web app qui pilote une séance de renforcement musculaire comme un coach en vidéo :
enchaînement automatique, timer travail/repos, voix (synthèse vocale du navigateur),
bips, et silhouette animée pour chaque exercice.

## Lancer en local

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans Chrome ou Safari.

## Fichiers

- `index.html` : interface, programmes, moteur de séance, voix et bips
- `figure.js` : silhouettes animées (poses clés + cinématique inverse)
- `generator.js` : génération de séances (`buildSession`, `buildAuto`, `buildPreset` et les préréglages Quotidien / Échauffement / Récupération)
- `exercises.json` : bibliothèque ; le champ `sports` (trail, cyclisme, général) oriente les préréglages trail et cyclisme
- `img/cards/<id>.svg` : visuels des cartes de l'onglet Activités (provisoires ; un dégradé s'affiche si le fichier manque)
