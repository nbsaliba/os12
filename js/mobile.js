// ---- État et réglages du podomètre / détection mobile ----------------------
let accelMode = false;          // true = mode accéléromètre actif
let lastMagnitude = null;       // magnitude accélération précédente (null = pas encore de référence)
let lastStepTime  = 0;          // timestamp du dernier pas détecté
let noStepTimer   = null;       // timer d'arrêt si plus de pas
const STEP_THRESHOLD  = 1.1;   // seuil de détection de pas (m/s²) — abaissé pour capter la marche lente
const STEP_MIN_INTERVAL = 280;  // intervalle minimum entre deux pas (ms)
const NO_STEP_TIMEOUT   = 2000; // ms sans pas → on arrête la marche (marge pour un pas posé)

function isMobile() { return _mobile; }

// Active/désactive visuellement un bouton (utilisé pour l'exclusivité mutuelle
// entre "Marche auto" et "Podomètre" : les deux pilotent le même isWalking,
// les activer en même temps n'apporte rien et prête à confusion — cf. le bouton
// qui semblait "arrêter" la marche alors que le podomètre la relançait aussitôt).
function setBtnEnabled(btn, enabled) {
  if (!btn) return;
  btn.classList.toggle('btn-disabled', !enabled);
}

// Affiche le bouton accéléromètre si on est sur mobile
function initMobileUI() {
  const hint = document.getElementById('hint');
  const stepBtn = document.getElementById('step-btn');
  if (isMobile()) {
    document.getElementById('accel-btn').style.display = 'block';
    // Sur mobile, le bouton Marcher classique passe en mode secondaire,
    // en toggle (un tap démarre, un tap arrête) plutôt qu'en maintien.
    // Le "maintien" (touchstart/touchend) posait un vrai problème de
    // fiabilité : le tactile génère ensuite des évènements souris
    // synthétiques ("fantômes") quelques centaines de ms après le lâcher,
    // ce qui pouvait redéclencher startWalking() tout seul, sans contact
    // réel — ou laisser la marche bloquée "en cours" si touchend ne se
    // déclenchait pas (geste système, notification...). Un simple 'click'
    // (un seul évènement, un seul chemin) élimine cette course.
    stepBtn.innerHTML = '▶ Marche auto';
    stepBtn.addEventListener('click', () => {
      if (accelMode) return; // sécurité : le bouton est de toute façon désactivé visuellement pendant que le podomètre est actif
      if (isWalking) {
        stopWalking();
        setBtnEnabled(document.getElementById('accel-btn'), true);
      } else {
        startWalking();
        setBtnEnabled(document.getElementById('accel-btn'), false);
      }
    });
    // Sur mobile on garde l'indication podomètre/marche auto (pas de touche ESPACE au clavier)
    if (hint) hint.innerHTML = 'Utilise le mode "Marche auto" ou "Podomètre" pour avancer sur le sentier<br>Clique sur 🟠 pour découvrir les points d\'intérêt';
  } else {
    // Desktop : comportement inchangé, maintien du bouton (ou de la barre
    // ESPACE, voir animate.js) tant qu'on veut avancer.
    stepBtn.addEventListener('mousedown', startWalking);
    stepBtn.addEventListener('mouseup', stopWalking);
    stepBtn.addEventListener('mouseleave', stopWalking);
    if (hint) hint.innerHTML = 'ESPACE ou bouton Marcher pour avancer · Échap = fermer<br>Clique sur 🟠 pour découvrir les points d\'intérêt';
  }
}

async function toggleAccelMode() {
  if (accelMode) {
    // Désactive
    accelMode = false;
    window.removeEventListener('devicemotion', onDeviceMotion);
    if (noStepTimer) { clearTimeout(noStepTimer); noStepTimer = null; }
    stopWalking();
    document.getElementById('accel-btn').textContent = '📱 Podomètre';
    document.getElementById('accel-btn').style.background = 'rgba(120,200,255,.15)';
    setBtnEnabled(document.getElementById('step-btn'), true); // rend la main à "Marche auto"
    return;
  }

  // iOS 13+ nécessite une permission explicite
  if (typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') {
        alert('Permission refusée. Active le capteur de mouvement dans les réglages Safari.');
        return;
      }
    } catch(e) {
      alert('Erreur permission capteur : ' + e.message);
      return;
    }
  } else if (typeof DeviceMotionEvent === 'undefined') {
    alert('Accéléromètre non disponible sur cet appareil.');
    return;
  }

  // Active le mode
  accelMode = true;
  lastMagnitude = null; // pas encore de référence — la 1ère mesure du capteur ne doit pas compter comme un pas
  lastStepTime  = 0;
  document.getElementById('accel-btn').textContent = '🔴 Arrêter podomètre';
  document.getElementById('accel-btn').style.background = 'rgba(255,100,80,.25)';
  window.addEventListener('devicemotion', onDeviceMotion);
  setBtnEnabled(document.getElementById('step-btn'), false); // "Marche auto" indisponible tant que le podomètre pilote la marche
}

function onDeviceMotion(e) {
  if (!accelMode) return;
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;

  const mag = Math.sqrt(Math.pow((acc.x||0),2) + Math.pow((acc.y||0),2) + Math.pow((acc.z||0),2));

  // 1ère mesure après activation : sert uniquement de référence (évite un faux
  // "pas" géant dû à la gravité ambiante, ex. |9.8 - 0| bien au-dessus du seuil).
  if (lastMagnitude === null) { lastMagnitude = mag; return; }

  const delta = Math.abs(mag - lastMagnitude);
  lastMagnitude = mag;

  const now = Date.now();
  if (delta > STEP_THRESHOLD && (now - lastStepTime) > STEP_MIN_INTERVAL) {
    lastStepTime = now;
    onStepDetected();
  }
}

function onStepDetected() {
  unlockSynth();
  if (typeof unlockAmbientAudio === 'function') unlockAmbientAudio();

  // Démarre la marche si elle n'était pas en cours. startWalking() gère déjà
  // tous les cas de blocage (narration, POI ouvert, parcours terminé) et
  // met à jour le style + texte du bouton "Marche auto" (même s'il est
  // désactivé visuellement pendant que le podomètre pilote la marche).
  startWalking();

  // Remet le timer d'arrêt à zéro
  if (noStepTimer) clearTimeout(noStepTimer);
  noStepTimer = setTimeout(() => {
    // Plus de pas depuis NO_STEP_TIMEOUT ms → on arrête
    stopWalking();
    noStepTimer = null;
  }, NO_STEP_TIMEOUT);
}

// Lance la détection mobile au chargement
window.addEventListener('load', initMobileUI);

// Stocke les GeoJSON bruts au moment du chargement
let _rawParcours   = null;
let _rawPOI        = null;
let _rawNarrations = null;
let _rawBati       = null;
let _rawOS         = null;
let _rawMNT        = null; // ArrayBuffer du GeoTIFF MNT
let _rawSAT        = null; // ArrayBuffer du GeoTIFF satellite

let _exportMode = 'autonome';