// OCCUPATION DU SOL
// ══════════════════════════════════════════════════════════

// Table de correspondance codes → type normalisé
// Compatible CLC (Corine Land Cover), OSM, IGN, ou codes libres
const OS_TYPE_MAP = {
  // Codes libres (ton GeoJSON)
  'foret':         'foret',
  'forêt':         'foret',
  'forest':        'foret',
  'bois':          'foret',
  'foret_claire':  'foret_claire',
  'prairie':       'prairie',
  'herbe':         'prairie',
  'grass':         'prairie',
  'culture':       'culture',
  'agricole':      'culture',
  'agricultural':  'culture',
  'urbain':        'urbain',
  'urban':         'urbain',
  'residential':   'urbain',
  'industriel':    'urbain',
  'eau':           'eau',
  'water':         'eau',
  'lac':           'eau',
  'riviere':       'eau',
  'river':         'eau',
  'sable':         'sable',
  'desert':        'sable',
  'roche':         'roche',
  'rock':          'roche',
  'bare':          'roche',

  // OSM landuse
  'farmland':      'culture',
  'farmyard':      'culture',
  'orchard':       'culture',
  'vineyard':      'culture',
  'allotments':    'culture',
  'meadow':        'prairie',
  'greenfield':    'prairie',
  'grass':         'prairie',
  'park':          'prairie',
  'garden':        'prairie',
  'recreation_ground': 'prairie',
  'cemetery':      'roche',
  'quarry':        'roche',
  'brownfield':    'roche',
  'industrial':    'urbain',
  'commercial':    'urbain',
  'retail':        'urbain',
  'construction':  'urbain',
  'military':      'urbain',
  'railway':       'urbain',
  'forest':        'foret',
  'wood':          'foret',

  // OSM natural
  'wood':          'foret',
  'scrub':         'foret_claire',
  'heath':         'foret_claire',
  'grassland':     'prairie',
  'wetland':       'eau',
  'water':         'eau',
  'reservoir':     'eau',
  'bay':           'eau',
  'beach':         'sable',
  'sand':          'sable',
  'dune':          'sable',
  'bare_rock':     'roche',
  'scree':         'roche',
  'cliff':         'roche',
  'glacier':       'roche',

  // OSM leisure
  'nature_reserve':'foret_claire',
  'golf_course':   'prairie',
  'pitch':         'prairie',

  // ESA WorldCover (codes numériques)
  '10':  'foret',        // Tree cover
  '20':  'foret_claire', // Shrubland
  '30':  'prairie',      // Grassland
  '40':  'culture',      // Cropland
  '50':  'urbain',       // Built-up
  '60':  'roche',        // Bare/sparse vegetation
  '70':  'roche',        // Snow/ice
  '80':  'eau',          // Permanent water bodies
  '90':  'prairie',      // Herbaceous wetland
  '95':  'foret',        // Mangrove
  '100': 'sable',        // Moss/lichen

  // Codes CLC (Corine Land Cover) numériques
  '111':'urbain','112':'urbain','121':'urbain','122':'urbain',
  '123':'urbain','124':'urbain','131':'roche','132':'roche',
  '141':'prairie','142':'prairie',
  '211':'culture','212':'culture','213':'culture',
  '221':'culture','222':'culture','223':'culture',
  '231':'prairie','241':'culture','242':'culture','243':'culture',
  '311':'foret','312':'foret','313':'foret',
  '321':'prairie','322':'roche','323':'prairie','324':'foret_claire',
  '331':'sable','332':'roche','333':'roche','334':'roche','335':'roche',
  '411':'eau','412':'eau','421':'eau','422':'eau','423':'eau',
  '511':'eau','512':'eau','521':'eau','522':'eau','523':'eau',
};

// Paramètres visuels par type
const OS_STYLE = {
  foret:       { groundColor:'#3d6b35', defaultTexture:'foret.jpg',        treeColor:0x2d5a27, treeDensity:0.008, treeH:[4,10],  treeR:[1.2,2.5] },
  foret_claire:{ groundColor:'#5a8c4a', defaultTexture:'foret_claire.jpg', treeColor:0x4a7a3a, treeDensity:0.003, treeH:[3,8],   treeR:[0.8,2.0] },
  prairie:     { groundColor:'#7ab552', defaultTexture:'prairie.jpg',      treeColor:null,      treeDensity:0 },
  culture:     { groundColor:'#c4a35a', defaultTexture:'culture.jpg',      treeColor:null,      treeDensity:0 },
  urbain:      { groundColor:'#8a8a8a', defaultTexture:'urbain.jpg',       treeColor:null,      treeDensity:0 },
  eau:         { groundColor:'#3a7abf', defaultTexture:null,               treeColor:null,      treeDensity:0 },
  sable:       { groundColor:'#d4b87a', defaultTexture:'sable.jpg',        treeColor:null,      treeDensity:0 },
  roche:       { groundColor:'#8a7a6a', defaultTexture:'roche.jpg',        treeColor:null,      treeDensity:0 },
};

// ══════════════════════════════════════════════════════════
// BUDGET D'INSTANCING GLB (arbres/objets 3D réalistes)
// ══════════════════════════════════════════════════════════
// Chaque type normalisé est rattaché à une "catégorie" d'objets 3D. Le budget
// total de triangles alloué aux modèles GLB (différent sur mobile/PC) est
// réparti entre catégories selon OS_CATEGORY_WEIGHTS, puis entre zones d'une
// même catégorie au prorata de leur surface réelle. Voir README_OS.md.
const OS_CATEGORY_MAP = {
  foret:         'vegetation',
  foret_claire:  'vegetation',
  culture:       'agricole',
  urbain:        'mobilier_urbain',
  roche:         'rochers',
  prairie:       null, // aucun objet 3D par défaut
  eau:           null,
  sable:         null,
};

// Part du budget total de triangles GLB allouée à chaque catégorie.
// Ajustable librement — la somme n'a pas besoin de faire exactement 1.
const OS_CATEGORY_WEIGHTS = {
  vegetation:       0.60,
  agricole:         0.20,
  mobilier_urbain:  0.15,
  rochers:          0.05,
  autre:            0.05, // catégorie de repli si non reconnue
};

// Budget total de triangles pour TOUS les modèles GLB instanciés du parcours.
const GLB_TRIANGLE_BUDGET = { mobile: 200000, desktop: 800000 };

// Garde-fous absolus par zone (même si le budget en triangles permettrait plus,
// ou si une valeur explicite du SIG est anormalement élevée par erreur).
const GLB_MAX_INSTANCES_PER_ZONE = { mobile: 60, desktop: 200 };
const GLB_MIN_INSTANCES_PER_ZONE = 2;
const GLB_EXPLICIT_SAFETY_FACTOR = 4; // marge tolérée pour une valeur fixée à la main dans le SIG


const TRUNK_GEO = new THREE.CylinderGeometry(0.15, 0.22, 1, 5);
const CONE_GEO  = new THREE.ConeGeometry(1, 1, 6);
const BALL_GEO  = new THREE.SphereGeometry(1, 5, 4);
const TRUNK_MAT = new THREE.MeshLambertMaterial({color:0x5a3a1a});

// ══════════════════════════════════════════════════════════
// TEXTURES IMAGE ET MODÈLES 3D PAR POLYGONE (optionnel, par feature)
// ══════════════════════════════════════════════════════════
// Dossiers fixes attendus à côté du parcours déployé.
const OS_TEXTURES_DIR = 'textures/'; // ex: properties.texture = "foret_dense.jpg" → textures/foret_dense.jpg
const OS_MODELS_DIR   = 'models/';   // ex: properties.model3d = "chene.glb"       → models/chene.glb

// Cache par nom de fichier : une texture/un modèle référencé par plusieurs
// polygones n'est chargé/décodé qu'une seule fois (important sur mobile).
const _osTextureImgCache = new Map(); // filename -> Promise<HTMLImageElement|null>
const _osModelCache      = new Map(); // filename -> Promise<THREE.Object3D|null>
const _gltfLoader = (typeof THREE.GLTFLoader==='function') ? new THREE.GLTFLoader() : null;

function loadOSTextureImage(filename) {
  if (!filename) return Promise.resolve(null);
  if (_osTextureImgCache.has(filename)) return _osTextureImgCache.get(filename);
  const p = new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => { console.warn('Texture OS introuvable :', OS_TEXTURES_DIR+filename); resolve(null); };
    img.src = OS_TEXTURES_DIR + filename;
  });
  _osTextureImgCache.set(filename, p);
  return p;
}

function loadOSModel(filename) {
  if (!filename || !_gltfLoader) return Promise.resolve(null);
  if (_osModelCache.has(filename)) return _osModelCache.get(filename);
  const p = new Promise(resolve => {
    _gltfLoader.load(
      OS_MODELS_DIR + filename,
      gltf => resolve(gltf.scene),
      undefined,
      err  => { console.warn('Modèle 3D OS introuvable :', OS_MODELS_DIR+filename, err); resolve(null); }
    );
  });
  _osModelCache.set(filename, p);
  return p;
}

// Extrait de chaque modèle GLB chargé les paires (géométrie, matériau)
// nécessaires à l'instancing manuel. La transformation locale de chaque
// sous-maillage (mesh.matrixWorld, relative à la racine du modèle) est "cuite"
// dans sa géométrie une bonne fois pour toutes : ainsi, quand on appliquera
// ensuite la position/rotation de plantation via InstancedMesh, les pièces du
// modèle (ex: tronc + feuillage séparés) restent bien assemblées entre elles.
function extractInstanceParts(modelScene) {
  const parts = [];
  modelScene.updateMatrixWorld(true);
  modelScene.traverse(o => {
    if (o.isMesh && o.geometry) {
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      parts.push({ geometry: geo, material: o.material });
    }
  });
  return parts;
}

// Cache par nom de fichier : pièces prêtes à instancier + nombre de triangles
// (mesuré une seule fois sur le modèle réellement fourni, jamais supposé à
// l'avance — voir README_OS.md, section "budget de triangles").
const _osModelPartsCache = new Map(); // filename -> [{geometry,material}, ...]
const _osModelTrisCache  = new Map(); // filename -> nombre de triangles (tout le modèle)

function getModelParts(filename, modelScene) {
  if (_osModelPartsCache.has(filename)) return _osModelPartsCache.get(filename);
  const parts = extractInstanceParts(modelScene);
  let tris = 0;
  parts.forEach(p => {
    const geo = p.geometry;
    tris += geo.index ? geo.index.count/3 : (geo.attributes.position ? geo.attributes.position.count/3 : 0);
  });
  _osModelPartsCache.set(filename, parts);
  _osModelTrisCache.set(filename, Math.max(1, Math.round(tris)));
  return parts;
}
function getModelTriCount(filename) { return _osModelTrisCache.get(filename) || 1; }

// Place `count` instances d'un modèle GLB (pièces pré-extraites) à des points
// aléatoires dans le polygone, via InstancedMesh — 1 draw call par pièce du
// modèle (souvent 1 à 3 : tronc/feuillage, etc.) pour TOUTES les instances
// combinées, quel que soit leur nombre. `count` est déjà déterminé en amont
// par le calcul de budget dans loadOS() — cette fonction ne fait que planter.
function plantModels3DInstanced(polyRings, parts, count) {
  if (!parts.length || count <= 0) return;

  const outer = polyRings[0];
  const xs=outer.map(p=>p[0]), zs=outer.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);

  const insts = parts.map(p => {
    const im = new THREE.InstancedMesh(p.geometry, p.material, count);
    im.castShadow = true;
    return im;
  });

  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let attempts=0; attempts<count*5 && placed<count; attempts++) {
    const tx = minX + Math.random()*(maxX-minX);
    const tz = minZ + Math.random()*(maxZ-minZ);
    if (!pointInPolygon(tx, tz, polyRings)) continue;
    const ty = getAltAt(tx, tz);

    dummy.position.set(tx, ty, tz);
    dummy.rotation.y = Math.random()*Math.PI*2;
    const s = 0.85 + Math.random()*0.3; // légère variation, évite le côté "copié-collé"
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();

    insts.forEach(im => im.setMatrixAt(placed, dummy.matrix));
    placed++;
  }

  insts.forEach(im => {
    im.count = placed;
    if (placed > 0) {
      // Sécurité : force l'upload du buffer de matrices d'instances au GPU.
      im.instanceMatrix.needsUpdate = true;
      // Essentiel : par défaut, la sphère/boîte englobante d'un InstancedMesh
      // n'est calculée qu'à partir de sa géométrie (donc centrée près de
      // l'origine, rayon minuscule) — sans tenir compte d'où les instances
      // sont réellement placées. Le moteur pense alors que tout le lot est
      // hors du champ de la caméra et ne le dessine JAMAIS, où qu'on se
      // trouve sur le parcours (c'était la cause des modèles GLB invisibles
      // malgré un placement correct). La version de three.js utilisée ici
      // (r128, voir index.html) n'a pas encore de computeBoundingSphere/Box
      // "conscient des instances" sur InstancedMesh — on désactive donc
      // simplement le frustum culling pour ce lot, ce qui reste sans risque
      // vu le nombre d'instances limité par le budget de triangles.
      im.frustumCulled = false;
      osGroup.add(im);
    }
  });
}

function plantTrees(polyRings, style) {
  if (!style.treeColor || !style.treeDensity) return;

  const outer = polyRings[0];
  const xs=outer.map(p=>p[0]), zs=outer.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const area = (maxX-minX) * (maxZ-minZ);

  // Cap absolu : max 300 arbres par zone quelle que soit la surface
  const maxTrees = _mobile ? 100 : 300; // moins d'arbres sur mobile
  const count = Math.min(maxTrees, Math.max(5, Math.floor(area * style.treeDensity)));

  // InstancedMesh : 1 draw call pour tous les troncs, 1 pour toutes les feuilles
  const trunkInst = new THREE.InstancedMesh(TRUNK_GEO, TRUNK_MAT, count);
  const leafMat   = new THREE.MeshLambertMaterial({color:style.treeColor});
  const leafInst  = new THREE.InstancedMesh(Math.random()>0.5?CONE_GEO:BALL_GEO, leafMat, count);
  trunkInst.castShadow = leafInst.castShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;

  for (let attempts=0; attempts<count*5 && placed<count; attempts++) {
    const tx = minX + Math.random()*(maxX-minX);
    const tz = minZ + Math.random()*(maxZ-minZ);
    if (!pointInPolygon(tx, tz, polyRings)) continue;

    const ty = getAltAt(tx, tz);
    const h  = style.treeH[0] + Math.random()*(style.treeH[1]-style.treeH[0]);
    const r  = style.treeR[0] + Math.random()*(style.treeR[1]-style.treeR[0]);
    const trunkH = h * 0.35;

    // Tronc
    dummy.position.set(tx, ty + trunkH/2, tz);
    dummy.scale.set(1, trunkH, 1);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(placed, dummy.matrix);

    // Feuillage
    dummy.position.set(tx, ty + trunkH + h*0.35, tz);
    dummy.scale.set(r, h*0.65, r);
    dummy.rotation.y = Math.random()*Math.PI*2;
    dummy.updateMatrix();
    leafInst.setMatrixAt(placed, dummy.matrix);

    placed++;
  }

  // Ajuste le count réel
  trunkInst.count = leafInst.count = placed;
  if (placed > 0) {
    // Même précaution que pour les modèles GLB (voir plantModels3DInstanced) :
    // évite que ce lot soit à tort considéré hors du champ de la caméra.
    trunkInst.frustumCulled = leafInst.frustumCulled = false;
    osGroup.add(trunkInst);
    osGroup.add(leafInst);
  }
}

// Groupe Three.js pour tous les objets OS
let osGroup = new THREE.Group();
scene.add(osGroup);

// Canvas de texture terrain OS (peint par zone)
let osTexCanvas = null;
let osTexture   = null;

// Lecture tolérante à la casse : "model3d", "model3D", "Model3D"… tous acceptés
function getModel3DName(props) {
  return props.model3d || props.model3D || props.Model3D || props.MODEL3D || null;
}
function getModel3DDensity(props) {
  return props.model3d_density || props.model3D_density || props.Model3D_density || null;
}
// Nombre exact d'instances voulu (prioritaire sur la densité et sur le calcul
// de budget automatique). Absent/vide = pas de valeur explicite.
function getModel3DCount(props) {
  const v = props.model3d_count ?? props.model3D_count ?? props.Model3D_count;
  if (v === undefined || v === null || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}
// Catégorie budgétaire forcée pour cette zone (sinon déduite du type normalisé
// via OS_CATEGORY_MAP — voir README_OS.md).
function getModelCategory(props) {
  return props.model_category || props.Model_category || null;
}
// Surface réelle (m²) d'une feature, somme des boîtes englobantes de tous ses
// groupes de polygone (Polygon → 1 groupe, MultiPolygon → plusieurs).
function getZoneArea(polyGroups) {
  let total = 0;
  for (const polyRings of polyGroups) {
    const outer = polyRings[0];
    const xs = outer.map(p=>p[0]), zs = outer.map(p=>p[1]);
    total += (Math.max(...xs)-Math.min(...xs)) * (Math.max(...zs)-Math.min(...zs));
  }
  return total;
}

function normalizeOSType(props) {
  // Cherche dans tous les champs possibles, dans l'ordre de priorité
  const candidates = [
    props.type, props.code, props.classe,
    props.CLC_CODE, props.CODE_18, props.CODE_12,
    props.landuse, props.natural, props.leisure,
    props.fclass, props.CLASSE, props.NATURE,
    // ESA WorldCover
    props.Map_code, props.map_code,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const k = String(raw).toLowerCase().trim();
    if (OS_TYPE_MAP[k]) return OS_TYPE_MAP[k];
  }
  return null;
}

// Teste si un point (px,pz) est dans un anneau simple [[x,z],...]
function pointInRing(px, pz, ring) {
  let inside = false;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
    const xi=ring[i][0], zi=ring[i][1], xj=ring[j][0], zj=ring[j][1];
    if (((zi>pz)!==(zj>pz)) && (px < (xj-xi)*(pz-zi)/(zj-zi)+xi)) inside=!inside;
  }
  return inside;
}
// Teste l'appartenance à un polygone complet (avec trous) : polyRings[0] = contour
// extérieur, polyRings[1..] = trous. Un point est "dans" le polygone s'il est dans
// le contour ET dans aucun des trous — indispensable pour respecter les zones
// (bâtiments, clairières…) découpées à l'intérieur d'une grande zone (forêt, urbain…).
function pointInPolygon(px, pz, polyRings) {
  if (!pointInRing(px, pz, polyRings[0])) return false;
  for (let h = 1; h < polyRings.length; h++) {
    if (pointInRing(px, pz, polyRings[h])) return false; // dans un trou → exclu
  }
  return true;
}

// Plan d'eau animé
function makeWaterPlane(ring) {
  const xs=ring.map(p=>p[0]), zs=ring.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  const avgAlt = getAltAt(cx,cz)+0.02;

  const geo = new THREE.PlaneGeometry(maxX-minX, maxZ-minZ, 4, 4);
  geo.rotateX(-Math.PI/2);
  const mat = new THREE.MeshLambertMaterial({
    color:0x3a7abf, transparent:true, opacity:0.75
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, avgAlt, cz);
  mesh.userData.isWater = true;
  osGroup.add(mesh);
}

// Texture terrain OS — rasterise les polygones sur un canvas
async function buildOSTexture(features, extScene) {
  // Résolution de l'atlas : plus il est élevé, plus le grain des textures
  // (ex: forest_floor.jpg) reste visible sur les petites parcelles — 512px
  // écrasait quasi tout détail dès qu'une zone occupait peu de pixels de l'atlas.
  const sz = _mobile ? 1536 : 3072;
  if (!osTexCanvas) { osTexCanvas=document.createElement('canvas'); osTexCanvas.width=osTexCanvas.height=sz; }
  const ctx = osTexCanvas.getContext('2d');
  // Fond sable par défaut
  ctx.fillStyle='#d4b87a'; ctx.fillRect(0,0,sz,sz);

  const sx = extScene.maxX - extScene.minX || 1;
  const sz2= extScene.maxZ - extScene.minZ || 1;

  function sceneToCanvas(x,z) {
    return [
      ((x-extScene.minX)/sx)*sz,
      ((z-extScene.minZ)/sz2)*sz
    ];
  }

  // Précharge en parallèle toutes les textures référencées : celles propres à un
  // polygone (properties.texture) ET les textures par défaut de chaque code OS.
  const texFilenames = [...new Set(features.map(f=>f.properties.texture).filter(Boolean))];
  const defaultTexFilenames = [...new Set(Object.values(OS_STYLE).map(s=>s.defaultTexture).filter(Boolean))];
  await Promise.all([...texFilenames, ...defaultTexFilenames].map(loadOSTextureImage));

  for (const f of features) {
    const type = normalizeOSType(f.properties);
    const style = type ? OS_STYLE[type] : null;
    if (!style && !f.properties.texture) continue;

    // `f.geometry.coordinates` est un tableau de groupes de polygone : chaque
    // groupe = [contour_extérieur, trou1, trou2, ...] (Polygon → un seul groupe,
    // MultiPolygon → un groupe par sous-polygone). On dessine tous les anneaux
    // d'un même groupe dans UN SEUL tracé, rempli en "evenodd" : c'est ce qui
    // permet aux trous d'être réellement exclus du remplissage/tuilage.
    for (const polyRings of f.geometry.coordinates) {
      ctx.beginPath();
      polyRings.forEach(ring => {
        // `ring` contient déjà des coordonnées de scène (converties en amont par
        // loadOS/loadOS_data) — surtout ne pas repasser par anyToScene() ici,
        // sous peine de les réinterpréter à tort comme des coordonnées UTM brutes.
        const canvasPts = ring.map(c => sceneToCanvas(c[0], c[1]));
        canvasPts.forEach(([cx2,cz2],i)=> i===0?ctx.moveTo(cx2,cz2):ctx.lineTo(cx2,cz2));
        ctx.closePath();
      });

      // Priorité : texture propre au polygone > texture par défaut du code OS > couleur unie
      const texFile = f.properties.texture || (style && style.defaultTexture) || null;
      const texImg = texFile ? await loadOSTextureImage(texFile) : null;
      if (texImg) {
        // Carrelage de l'image, limité au polygone (trous exclus) via clip('evenodd')
        ctx.save();
        ctx.clip('evenodd');
        // Fond de repli à la couleur du type de sol (ex: vert forêt), sous le
        // carrelage : si un micro-espace d'arrondi apparaît entre deux tuiles,
        // on voit une nuance proche de la texture plutôt que le sable jaune
        // par défaut du canvas (c'était la cause des raies jaunes visibles).
        ctx.fillStyle = style ? style.groundColor : '#d4b87a';
        ctx.fill('evenodd');
        const outerPts = polyRings[0].map(c => sceneToCanvas(c[0], c[1]));
        const xs = outerPts.map(p=>p[0]), zs = outerPts.map(p=>p[1]);
        const bx0=Math.min(...xs), bx1=Math.max(...xs), bz0=Math.min(...zs), bz1=Math.max(...zs);
        const tile = 48; // taille d'une tuile en pixels canvas — ajuste le "grain" du motif
        const OVERLAP = 1; // léger chevauchement pour ne laisser aucun interstice entre tuiles
        for (let ty=Math.floor(bz0); ty<bz1; ty+=tile) {
          for (let tx=Math.floor(bx0); tx<bx1; tx+=tile) ctx.drawImage(texImg, tx, ty, tile+OVERLAP, tile+OVERLAP);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = style ? style.groundColor : '#d4b87a';
        ctx.fill('evenodd');
      }
    }
  }

  if (osTexture) osTexture.dispose();
  osTexture = new THREE.CanvasTexture(osTexCanvas);
  osTexture.wrapS = osTexture.wrapT = THREE.ClampToEdgeWrapping;
  setAnisotropy(osTexture);

  applyTerrainTexture();
}

// Point d'entrée pour un chargement OS depuis un <input type="file"> (pas utilisé
// par l'application actuelle, qui charge automatiquement os.geojson via
// window.EMBEDDED.os_url au démarrage — voir loadOS_data() dans
// data_embedded.js, seule et unique implémentation de la logique de chargement).
// Ce relais existe pour qu'une future UI de sélection de fichier n'ait rien à
// réimplémenter : toute la logique (budget GLB, textures, arbres...) vit dans
// loadOS_data(), jamais dupliquée ici.
function loadOS(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const g = JSON.parse(e.target.result);
      if (g.type !== 'FeatureCollection') throw new Error('Pas une FeatureCollection');
      await loadOS_data(g);
      sigStatus('✓ OS chargée');
    } catch (err) { sigStatus('✗ OS: '+err.message, false); console.error(err); }
  };
  r.readAsText(file);
}
