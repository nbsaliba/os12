# Format du fichier OS (occupation du sol)

Ce document décrit le format attendu par `js/os.js` pour le fichier que tu
charges via le bouton "OS" de l'application, ainsi que le fonctionnement du
budget d'instancing des modèles 3D (GLB).

## Format général

Un fichier **GeoJSON** valide, de type `FeatureCollection` :

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "code": "10" }, "geometry": { "type": "Polygon", "coordinates": [...] } },
    { "type": "Feature", "properties": { "code": "40" }, "geometry": { "type": "MultiPolygon", "coordinates": [...] } }
  ]
}
```

- Géométries acceptées : `Polygon` et `MultiPolygon`.
- Les trous (anneaux intérieurs d'un `Polygon`, ex. une clairière ou un
  bâtiment au milieu d'une forêt) sont respectés : le premier anneau est le
  contour extérieur, les suivants sont exclus du remplissage/de la
  plantation d'objets 3D.
- Coordonnées acceptées : **WGS84** (longitude/latitude) ou **UTM**
  (mètres) — la détection est automatique, pas besoin de préciser laquelle.

## L'attribut `code` (obligatoire pour un rendu stylé)

C'est le seul attribut nécessaire pour que la zone soit reconnue et stylée
(couleur/texture de sol, densité d'arbres). Utilise les codes **ESA
WorldCover** :

| `code` | Signification         | Type normalisé interne |
|--------|-----------------------|-------------------------|
| `10`   | Couvert arboré         | `foret`                |
| `20`   | Arbustes                | `foret_claire`          |
| `30`   | Prairie/herbe           | `prairie`               |
| `40`   | Cultures                | `culture`               |
| `50`   | Bâti/urbain             | `urbain`                |
| `60`   | Sol nu/végétation rase  | `roche`                 |
| `70`   | Neige/glace             | `roche`                 |
| `80`   | Eau permanente          | `eau`                   |
| `90`   | Zone humide herbacée    | `prairie`               |
| `95`   | Mangrove                | `foret`                 |
| `100`  | Mousse/lichen           | `sable`                 |

Une feature sans `code` reconnu reçoit un remplissage sable par défaut et
n'a aucun objet 3D (sauf si `texture`/`model3d` sont fournis explicitement,
voir plus bas).

> Le champ est lu tel quel (nombre ou texte, peu importe) — évite juste les
> formats du type `"10.0"` ou `"010"` qui ne correspondent à aucune entrée
> de la table ci-dessus.

## Attributs optionnels, par polygone (`properties`)

Tous facultatifs. Si absents, le rendu par défaut du `code` s'applique.

| Attribut            | Rôle                                                                 | Unité / valeurs                          |
|---------------------|-----------------------------------------------------------------------|-------------------------------------------|
| `texture`           | Image de sol spécifique à ce polygone (remplace la texture par défaut du `code`) | nom de fichier dans `textures/` |
| `model3d`           | Modèle GLB à planter sur ce polygone (remplace les arbres procéduraux) | nom de fichier dans `models/`             |
| `model3d_density`   | Densité d'objets voulue pour CE polygone                              | objets par m² (ex. `0.004` = 40/hectare)  |
| `model3d_count`     | Nombre exact d'objets voulu pour CE polygone (prioritaire sur la densité) | nombre entier                          |
| `model_category`    | Force la catégorie budgétaire de ce polygone (voir plus bas)          | `vegetation` / `agricole` / `mobilier_urbain` / `rochers` / `autre` |

`model3d`, `model3d_density`, `model3d_count` et `model_category` tolèrent
plusieurs variantes de casse (`model3D`, `Model3D`, `MODEL3D`, etc.).

### Exemple

```json
{
  "type": "Feature",
  "properties": {
    "code": "10",
    "model3d": "chene.glb",
    "model3d_density": 0.006
  },
  "geometry": { "type": "Polygon", "coordinates": [ [ [35.55,33.83], [35.56,33.83], [35.56,33.84], [35.55,33.84], [35.55,33.83] ] ] }
}
```

## Comment les objets 3D sont placés

### Sans `model3d` : arbres procéduraux (par défaut)

Les zones `foret`/`foret_claire` reçoivent des arbres géométriques simples
(tronc + feuillage, `InstancedMesh`), à une densité fixe définie dans
`OS_STYLE` (`js/os.js`). Aucune configuration nécessaire.

### Avec `model3d` : instancing d'un modèle GLB réel

Le modèle indiqué est chargé une seule fois, puis **instancié** (une seule
géométrie répétée à de nombreuses positions, en 1 à quelques `draw calls`
au total quel que soit le nombre d'instances) — pas de copie individuelle
coûteuse. Le nombre d'instances par zone est déterminé par le **budget de
triangles**, décrit ci-dessous, sauf si tu fournis `model3d_count` ou
`model3d_density` pour fixer toi-même la valeur.

## Le budget de triangles (instancing automatique)

But : répartir intelligemment un nombre total de triangles "raisonnable
pour l'appareil" entre toutes les zones à modèle 3D, sans jamais avoir à
fixer une densité à la main pour chaque polygone.

### 1. Catégories

Chaque type normalisé (déduit de `code`) est rattaché à une catégorie
d'objets, définie dans `OS_CATEGORY_MAP` (`js/os.js`) :

| Type normalisé | Catégorie          |
|-----------------|---------------------|
| `foret`, `foret_claire` | `vegetation`  |
| `culture`        | `agricole`          |
| `urbain`          | `mobilier_urbain`   |
| `roche`           | `rochers`           |
| `prairie`, `eau`, `sable` | *(aucune, pas d'objets 3D par défaut)* |

Tu peux forcer une catégorie différente pour un polygone précis avec
`model_category`.

### 2. Budget total et poids par catégorie

Un budget total de triangles est fixé par plateforme (`GLB_TRIANGLE_BUDGET`
dans `js/os.js`) :

- Mobile : **200 000** triangles
- PC : **800 000** triangles

Ce budget est réparti entre catégories selon `OS_CATEGORY_WEIGHTS` :

- `vegetation` : 60 %
- `agricole` : 20 %
- `mobilier_urbain` : 15 %
- `rochers` : 5 %
- `autre` (repli) : 5 %

### 3. Répartition entre zones d'une même catégorie

1. Les zones où tu as fixé `model3d_count` ou `model3d_density`
   "consomment" leur part du budget de leur catégorie en premier (coût
   fixe = nombre d'instances × triangles du modèle utilisé).
2. Le budget restant de la catégorie est réparti entre les zones
   **sans** valeur explicite, **au prorata de leur surface réelle** (m²) —
   une grande zone reçoit naturellement plus d'instances qu'une petite,
   sans qu'aucune zone n'ait besoin d'un réglage manuel.
3. Le nombre de triangles du modèle GLB est **mesuré automatiquement** au
   chargement (jamais supposé à l'avance) : le calcul s'adapte donc à
   n'importe quel modèle que tu fournis, plus ou moins détaillé.

### 4. Garde-fous de sécurité

Indépendamment du calcul ci-dessus, chaque zone est plafonnée à un nombre
maximal d'instances (`GLB_MAX_INSTANCES_PER_ZONE`, 60 sur mobile / 200 sur
PC), et une valeur explicite (`model3d_count`/`model3d_density`) ne peut
pas dépasser 4× ce plafond — pour te protéger d'une erreur de saisie (ex.
une densité entrée avec un facteur 1000 en trop) qui générerait des
milliers d'objets d'un coup.

## Recommandations pour les modèles GLB

Pour que l'instancing reste aussi léger que possible :

- Reste bas-poly (une centaine à quelques centaines de triangles par
  modèle, selon son importance visuelle).
- Un seul matériau/texture partagé par modèle si possible (chaque
  matériau distinct ajoute un `draw call` supplémentaire, multiplié par le
  nombre de catégories/modèles utilisés — pas par le nombre d'instances).
- Pour du feuillage réaliste et léger : privilégie une texture de feuille
  en alpha sur un feuillage "cross-plane" (2 plans qui se croisent)
  plutôt qu'une vraie géométrie 3D de feuilles.
- Compresse à l'export (Draco/meshopt pour la géométrie, KTX2/Basis pour
  les textures) pour réduire le poids de téléchargement.

## Résumé express

- `code` (ESA WorldCover) → seul attribut obligatoire.
- `texture` / `model3d` → pour personnaliser une zone précise.
- `model3d_count` / `model3d_density` → pour fixer toi-même le nombre
  d'objets d'une zone (calibrable visuellement dans ton SIG).
- `model_category` → pour forcer la catégorie budgétaire d'une zone.
- Sans ces réglages manuels, tout est calculé automatiquement à partir de
  la surface réelle des zones et du modèle GLB fourni.
