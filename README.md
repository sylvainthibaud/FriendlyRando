# FriendlyRando ⛰️

Joue ta prochaine rando comme un jeu vidéo : on charge une trace GPX, on découvre la mission (carte façon objet rare, défis), puis on lance la partie et on suit son avatar en 3D sur le relief.

Première rando : **Tour des lacs d'Ayous** (vallée d'Ossau, Pyrénées).

## Fonctionnalités

- Écran de mission : rareté selon l'effort (Peu commune → Légendaire), stats en barres, liste de défis
- Partie : compte à rebours, plongée de la caméra, avatar « TOI », traînée dorée sur le chemin parcouru
- HUD : énergie (baisse en montée, remonte aux pauses lacs/refuge), vitesse selon la pente, XP et niveaux, horloge de la journée, terrain en mots (« Ça pique ! »)
- Points de passage à découvrir, notifications, sons synthétisés, 3 caméras (Drone, Épaule, Aigle), vitesse x1/x2/x4
- Écran de victoire avec badges débloqués
- Carte 3D avec relief (exagération réglable) et fonds Satellite (IGN + Esri), Plan IGN ou OpenTopoMap
- Tracé coloré selon la pente, bornes kilométriques, points d'intérêt (lacs, refuge, sommets…)
- Profil altimétrique interactif, synchronisé avec la carte (survol / clic dans les deux sens)
- Chiffres clés : distance, D+ / D−, altitudes min/max, temps de marche (DIN 33466, réparti selon la pente)
- Import de n'importe quel fichier GPX (bouton ou glisser-déposer) ; altitudes complétées depuis le modèle de terrain si le GPX n'en contient pas
- Utilisable sur mobile

## Structure

Site 100 % statique, sans étape de build (MapLibre GL JS chargé depuis un CDN).

```
public/
  index.html
  css/style.css
  js/
    app.js          # orchestration de l'interface
    gpx.js          # lecture des fichiers GPX
    analyze.js      # distances, pentes, dénivelés, temps de marche
    dem.js          # altitudes depuis les tuiles de relief (terrarium)
    map.js          # carte 3D MapLibre
    profile.js      # profil altimétrique (canvas)
    flythrough.js   # déroulé de la partie (avatar + caméra)
    game.js         # règles du jeu : énergie, XP, défis, badges
    sound.js        # effets sonores (WebAudio)
  tracks/
    index.json      # catalogue des randos
    *.gpx
render.yaml         # déploiement Render (site statique)
```

## Ajouter une rando

1. Déposer le fichier dans `public/tracks/ma-rando.gpx`. Les `<wpt>` du GPX deviennent des points d'intérêt ; le champ `<type>` choisit l'icône (`lac`, `refuge`, `sommet`, `col`, `parking`, `pont`, `source`, `vue`, `cascade`).
2. Ajouter une entrée dans `public/tracks/index.json` :

```json
{
  "id": "ma-rando",
  "name": "Ma rando",
  "region": "Massif · Département",
  "file": "tracks/ma-rando.gpx",
  "description": "Quelques lignes de présentation.",
  "view": { "bearing": 180, "pitch": 60 },
  "startTime": "08:30"
}
```

`view.bearing` oriente la vue d'ensemble (0 = regard vers le nord, 180 = vers le sud). `startTime` règle l'heure de départ affichée sur l'horloge du jeu.

## Lancer en local

N'importe quel serveur statique sur le dossier `public/`, par exemple :

```bash
npx serve public
```

## Déploiement

Render, en site statique (`render.yaml`) : chaque push sur `main` redéploie automatiquement.

## Données et crédits

- Fonds de carte : © IGN (Géoplateforme), © Esri World Imagery, © OpenTopoMap (CC-BY-SA)
- Relief : Mapzen / AWS Terrain Tiles (EU-DEM en Europe)
- Tracé du tour des lacs d'Ayous : calculé sur les sentiers © contributeurs OpenStreetMap avec BRouter
