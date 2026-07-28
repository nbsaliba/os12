// AVATAR — point/silhouette qui matérialise la position
// du marcheur, visible en vue aérienne et carte (pas en FPS)
// ══════════════════════════════════════════════════════════
let avatarGroup = null;

function buildAvatar() {
  avatarGroup = new THREE.Group();

  // Corps : capsule simple (cylindre + sphère tête)
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2288ff });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8),
    bodyMat
  );
  body.position.y = 0.9;
  body.castShadow = true;
  avatarGroup.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    bodyMat
  );
  head.position.y = 1.75;
  head.castShadow = true;
  avatarGroup.add(head);

  // Flèche de direction au sol — indique vers où on regarde
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 1.2);
  arrowShape.lineTo(-0.35, 0.3);
  arrowShape.lineTo(0, 0.55);
  arrowShape.lineTo(0.35, 0.3);
  arrowShape.lineTo(0, 1.2);
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  arrowGeo.rotateX(-Math.PI/2);
  const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({
    color: 0xffaa00, transparent: true, opacity: 0.9, side: THREE.DoubleSide
  }));
  arrow.position.y = 0.05;
  avatarGroup.add(arrow);

  // Halo au sol — repère visuel large, visible de loin
  const haloGeo = new THREE.RingGeometry(0.6, 0.85, 24);
  haloGeo.rotateX(-Math.PI/2);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
    color: 0x2288ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide
  }));
  halo.position.y = 0.04;
  avatarGroup.add(halo);
  avatarGroup.userData.halo = halo;
  avatarGroup.userData.arrow = arrow;

  scene.add(avatarGroup);
}
buildAvatar();

function updateAvatar(camPos, camDir, currentView) {
  if (!avatarGroup) return;
  // Position au sol (sans la hauteur d'yeux)
  const groundY = getAltAt(camPos.x, camPos.z);
  avatarGroup.position.set(camPos.x, groundY, camPos.z);
  // Oriente l'avatar dans la direction de marche
  avatarGroup.rotation.y = Math.atan2(camDir.x, camDir.z);
  // Visible seulement en vue aérienne et carte — pas en FPS (on serait dedans)
  avatarGroup.visible = (currentView !== 'fps');
  // Pulsation légère du halo pour le rendre repérable
  const pulse = 0.85 + Math.sin(Date.now()*0.003)*0.15;
  avatarGroup.userData.halo.scale.set(pulse, 1, pulse);
}

// ══════════════════════════════════════════════════════════
// POIs
// ══════════════════════════════════════════════════════════
let poiObjects=[], poiData=[];
// Rayon sphère POI = 2m réels, anneau = 5-8m réels
const POI_R  = 2;
const RING_R1 = 5;
const RING_R2 = 8;
const mGeo=new THREE.SphereGeometry(POI_R, 8, 8);
const rBaseGeo=new THREE.RingGeometry(RING_R1, RING_R2, 20);
rBaseGeo.rotateX(-Math.PI/2);

function buildPOIMarkers(){
  poiObjects.forEach(o=>{ scene.remove(o.marker); scene.remove(o.ring); });
  poiObjects=[];
  poiData.forEach(p=>{
    const mat=new THREE.MeshBasicMaterial({color:0xffaa00});
    const m=new THREE.Mesh(mGeo,mat);
    m.position.set(p.x||0, (p.y||0) + 3, p.z); scene.add(m);
    const rMat=new THREE.MeshBasicMaterial({color:0xffcc44,transparent:true,opacity:.4});
    const r=new THREE.Mesh(rBaseGeo.clone(),rMat);
    r.position.set(p.x||0, (p.y||0) + 0.2, p.z); scene.add(r);
    poiObjects.push({marker:m, ring:r, mat, rMat, data:p});
    // Avertissement dev uniquement (console) — pas de repli parlé pour l'utilisateur :
    // l'absence d'approche_text est un choix d'auteur assumé (silence jusqu'au clic),
    // ceci sert juste à repérer les oublis pendant les tests.
    if (!p.props || !p.props.approche_text) {
      console.warn(`POI "${p.name}" sans attribut approche_text — aucune invite vocale à l'approche.`);
    }
  });
  if (typeof updateCarnetBadge === 'function') updateCarnetBadge();
}

// ── Flèche discrète vers un POI proche mais hors champ ──────────────────────
// Pure indication visuelle : ne touche jamais à la caméra. L'utilisateur se
// réoriente lui-même via le glisser existant (lookYaw/lookPitch, core.js).
// Visible même en marchant (le glisser, lui, n'est actif qu'à l'arrêt) — pour
// que l'utilisateur sache qu'il faudra s'arrêter puis se tourner par là.
const POI_ARROW_RADIUS = 40; // m — un peu avant les seuils de couleur/pause existants
const POI_ARROW_MARGIN = 0.85; // reste dans [-0.85,0.85] en coordonnées écran normalisées
let _arrowTargetPOI = null; // POI actuellement visé par la flèche — utilisé par le clic ci-dessous

function updatePOIDirectionArrow(camPos) {
  const el = document.getElementById('poi-direction-arrow');
  if (!el) return;
  if (currentView !== 'fps' || (typeof poiOverlayOpen !== 'undefined' && poiOverlayOpen) || !poiObjects.length) {
    el.style.display = 'none';
    _arrowTargetPOI = null;
    return;
  }

  // POI non visité le plus proche, dans le rayon de pertinence
  let best = null, bestDist = Infinity;
  for (const o of poiObjects) {
    const p = o.data;
    const key = (typeof poiKey === 'function') ? poiKey(p) : null;
    if (key && typeof poiFragments !== 'undefined' && poiFragments[key]) continue; // déjà visité
    const dx = camPos.x - p.x, dz = camPos.z - p.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist <= POI_ARROW_RADIUS && dist < bestDist) { bestDist = dist; best = o; }
  }
  if (!best) { el.style.display = 'none'; _arrowTargetPOI = null; return; }

  const ndc = best.marker.position.clone().project(activeCamera);
  const behind = ndc.z > 1;
  const onScreen = !behind && Math.abs(ndc.x) <= POI_ARROW_MARGIN && Math.abs(ndc.y) <= POI_ARROW_MARGIN;
  if (onScreen) { el.style.display = 'none'; _arrowTargetPOI = null; return; } // déjà visible à l'écran, pas besoin d'indice

  _arrowTargetPOI = best;

  // Cliquable UNIQUEMENT à l'arrêt : c'est le seul moment où lookYaw/lookPitch
  // ne sont pas remis à zéro en continu par la marche (voir animate.js) — un
  // clic pendant la marche recentrerait la vue pour une fraction de seconde
  // avant que le retour automatique à 0 ne l'annule, sans effet utile.
  el.classList.toggle('interactive', typeof isWalking !== 'undefined' && !isWalking);

  // Si le POI est derrière la caméra, on inverse pour pointer vers l'arrière du bon côté
  let x = behind ? -ndc.x : ndc.x;
  let y = behind ? -ndc.y : ndc.y;
  x = Math.max(-POI_ARROW_MARGIN, Math.min(POI_ARROW_MARGIN, x));
  y = Math.max(-POI_ARROW_MARGIN, Math.min(POI_ARROW_MARGIN, y));

  const w = window.innerWidth, h = window.innerHeight;
  const screenX = (x * 0.5 + 0.5) * w;
  const screenY = (1 - (y * 0.5 + 0.5)) * h;
  const angleDeg = Math.atan2(x, y) * 180 / Math.PI; // 0° = vers le haut, sens horaire

  el.style.left = screenX + 'px';
  el.style.top  = screenY + 'px';
  el.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  el.style.display = 'flex';
}

// Clic sur la flèche = action EXPLICITE de l'utilisateur, donc cohérente avec
// le principe "jamais de rotation de caméra automatique" : ici c'est
// l'utilisateur qui la demande. Oriente lookYaw/lookPitch directement vers le
// POI visé ; sans effet en marchant (voir le commentaire ci-dessus).
document.getElementById('poi-direction-arrow').addEventListener('click', () => {
  if (typeof isWalking !== 'undefined' && isWalking) return;
  if (!_arrowTargetPOI) return;
  const poiPos = _arrowTargetPOI.marker.position;
  const camPos = activeCamera.position;
  const dx = poiPos.x - camPos.x, dz = poiPos.z - camPos.z;
  const horizDist = Math.sqrt(dx*dx + dz*dz);
  if (horizDist < 0.001) return;
  const tx = dx / horizDist, tz = dz / horizDist;
  const dir = getDirOnPath(pathT).clone().normalize();
  lookYaw = Math.atan2(dir.z*tx - dir.x*tz, dir.x*tx + dir.z*tz);
  const dy = poiPos.y - camPos.y;
  lookPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(dy, horizDist)));
});
