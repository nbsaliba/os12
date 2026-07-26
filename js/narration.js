// ── Système narratif ──────────────────────────────────────
// - On peut marcher librement même si une narration précédente joue encore.
// - Dès qu'on ATTEINT physiquement un nouveau point B (même si A joue encore) :
//     → la marche est bloquée immédiatement (figée sur B)
//     → on attend que A se termine
//     → B se lance automatiquement
//     → la marche redevient possible tout de suite (le clic est actif)
//     → B continue de jouer EN ARRIÈRE-PLAN pendant qu'on marche
let currentNarr   = null; // narration dont l'audio joue actuellement (peut jouer pendant la marche)
let pendingNarr   = null; // narration en attente, déclenchée dès que currentNarr se termine
let blockedAtNarr = false;// true = la marche est figée (on attend la fin de la narration EN ATTENTE avant elle)
let narrAudio     = null; // HTMLAudioElement pour MP3
let narrPoints    = [];   // points de déclenchement chargés
const DEFAULT_TRIGGER_RADIUS = 30;

function narrRadiusToScene(meters) {
  return meters; // SCENE_SCALE=1 donc 1m=1 unité
}

function playNarration(n, blockUntilDone) {
  // blockUntilDone=true  → la marche reste bloquée jusqu'à la fin de CETTE narration
  //                         (cas du premier point ou quand il n'y avait rien avant)
  // blockUntilDone=false → la marche est débloquée immédiatement, la narration joue en fond
  //                         (cas d'un point atteint pendant qu'une précédente jouait encore)
  currentNarr = n;
  if (n.texte) showNarrative(n.texte, null);

  if (!blockUntilDone) {
    // Débloque la marche immédiatement — la narration continue en arrière-plan.
    // On relance aussi startWalking() : si la marche avait été stoppée de force
    // par blockWalking() (point atteint pendant une narration précédente),
    // ce n'était pas un arrêt utilisateur, donc pas à l'utilisateur de la
    // relancer manuellement. Sans effet si la marche n'a jamais été
    // interrompue (startWalking() ignore l'appel tant que isWalking est déjà true).
    unblockWalking();
    startWalking();
  }

  const release = () => {
    if (currentNarr === n) currentNarr = null;
    // Si un point était en attente, on le lance maintenant sans bloquer
    if (pendingNarr) {
      const next = pendingNarr;
      pendingNarr = null;
      playNarration(next, false); // débloque dans playNarration via !blockUntilDone
    } else if (blockedAtNarr) {
      // Plus rien en attente — débloque la marche, et la relance automatiquement :
      // l'arrêt venait du blocage (checkNarrTriggers ne se déclenche que pendant
      // la marche), jamais d'un clic utilisateur — ce n'est donc pas à
      // l'utilisateur de relancer manuellement. startWalking() reste sans effet
      // si une reprise a déjà eu lieu entre-temps (ex: pas du podomètre).
      unblockWalking();
      startWalking();
    }
  };

  if (n.audio_file && n.audioBlobURL) {
    if (narrAudio) { narrAudio.pause(); narrAudio = null; }
    narrAudio = new Audio(n.audioBlobURL);
    let fellBackToTTS = false;
    let audioStarted  = false;
    const fallbackToTTS = () => {
      if (fellBackToTTS || audioStarted) return; // déjà basculé, ou l'audio joue bel et bien
      fellBackToTTS = true;
      clearTimeout(safetyTimer);
      speak(n.audio_text || n.texte || ''); release();
    };
    narrAudio.onplaying = () => { audioStarted = true; }; // confirme que la lecture a réellement démarré
    narrAudio.onended   = () => { if (!fellBackToTTS) { clearTimeout(safetyTimer); release(); } };
    narrAudio.onerror   = fallbackToTTS;
    // Filet de sécurité : certains navigateurs desktop ne déclenchent jamais
    // 'error' pour un blob introuvable/corrompu — l'élément reste bloqué en
    // "chargement" indéfiniment, sans erreur ni promesse rejetée. On force
    // donc le repli TTS nous-mêmes si la lecture n'a pas démarré à temps,
    // plutôt que de dépendre entièrement du comportement du navigateur.
    const safetyTimer = setTimeout(fallbackToTTS, 3000);
    narrAudio.play().catch(fallbackToTTS);
  } else {
    speakWithCallback(n.audio_text || n.texte || '', release);
  }
}

// Reflète l'état RÉEL de isWalking sur le bouton — à utiliser partout où on a
// besoin de resynchroniser l'affichage sans forcer un état particulier (ex: à
// la levée d'un blocage, où la marche peut être encore active en arrière-plan
// ou avoir déjà repris via un pas de podomètre).
function updateStepBtnLabel() {
  const btn = document.getElementById('step-btn');
  const mobile = typeof isMobile === 'function' && isMobile();
  btn.style.background = isWalking ? 'rgba(255,210,140,.35)' : 'rgba(255,210,140,.15)';
  btn.innerHTML = mobile ? (isWalking ? '⏸ Arrêter' : '▶ Marche auto') : '▶ Marcher';
}

function unblockWalking() {
  blockedAtNarr = false;
  document.getElementById('step-btn').classList.remove('blocked');
  updateStepBtnLabel();
}

function blockWalking() {
  blockedAtNarr = true;
  isWalking = false;
  document.getElementById('step-btn').style.background = 'rgba(255,210,140,.15)';
  document.getElementById('step-btn').classList.add('blocked');
  document.getElementById('step-btn').innerHTML = '⏸ Écoute en cours…';
}

function triggerNarration(n) {
  if (n.played) return;
  n.played = true;

  if (currentNarr) {
    // Une narration précédente joue encore — on bloque la marche
    // et on met ce point en attente. Dès que la précédente finit,
    // ce point se lancera avec blockUntilDone=false (marche débloquée immédiatement)
    blockWalking();
    pendingNarr = n;
  } else {
    // Rien ne joue — on lance directement SANS bloquer la marche
    // La narration joue en arrière-plan, l'utilisateur peut continuer à avancer
    playNarration(n, false);
  }
}

// Vérifie la proximité à chaque frame (appelé dans animate)
// Se déclenche même si une narration précédente est encore en train de jouer
function checkNarrTriggers(camPos) {
  if (blockedAtNarr) return; // déjà figé sur un point en attente — pas de nouveau check
  for (const n of narrPoints) {
    if (n.played) continue;
    const dx = camPos.x - n.x;
    const dz = camPos.z - n.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist <= n.radiusScene) {
      triggerNarration(n);
      break; // une seule par frame
    }
  }
}

// Coupe tout (utilisé au reset complet du parcours)
function stopNarration() {
  synth.cancel();
  if (narrAudio) { narrAudio.pause(); narrAudio = null; }
  currentNarr = null;
  pendingNarr = null;
  blockedAtNarr = false;
  document.getElementById('step-btn').classList.remove('blocked');
  updateStepBtnLabel();
  document.getElementById('narrative-box').style.opacity = '0';
}

// ── Invite vocale d'approche d'un POI ─────────────────────────
// Attribut `approche_text` du POI, SANS repli générique : un POI qui n'a pas
// cet attribut reste silencieux jusqu'au clic (choix d'auteur assumé, voir
// l'avertissement console dans buildPOIMarkers()). Se déclenche une seule
// fois par POI (flag p.announced), et passe par triggerNarration() pour
// bénéficier de la même file d'attente / repli TTS / reprise de marche que
// les narrations classiques.
const POI_APPROACH_RADIUS = 20; // m — avant que le marker ne passe au rouge (10m)

function checkPOIApproach(camPos) {
  if (typeof poiObjects === 'undefined' || !poiObjects.length) return;
  for (const o of poiObjects) {
    const p = o.data;
    if (p.announced) continue;
    if (!p.props || !p.props.approche_text) { p.announced = true; continue; } // silence assumé, jamais réévalué
    const dx = camPos.x - p.x, dz = camPos.z - p.z;
    if (Math.sqrt(dx*dx + dz*dz) <= POI_APPROACH_RADIUS) {
      p.announced = true;
      triggerNarration({
        played: false,
        name: p.name,
        texte: p.props.approche_text,
        audio_text: p.props.approche_text,
        audio_file: null,
        audioBlobURL: null,
      });
      break; // une seule annonce par frame, comme pour checkNarrTriggers
    }
  }
}

function loadNarrations(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const g = JSON.parse(e.target.result);
      if (g.type !== 'FeatureCollection') throw new Error('Pas une FeatureCollection');

      if (!geoOrigin && g.features.length) {
        const c = g.features[0].geometry.coordinates;
        if (isUTM(c[0],c[1])) setOrigin(c[0],c[1]);
        else { const m=wgs84ToUTM(c[0],c[1]); setOrigin(m.e,m.n); }
      }

      narrPoints = g.features
        .filter(f => f.geometry && f.geometry.type === 'Point')
        .map(f => {
          const c  = f.geometry.coordinates;
          const sc = anyToScene(c[0], c[1]);
          const p  = f.properties || {};
          const radiusM = parseFloat(p.trigger_radius || DEFAULT_TRIGGER_RADIUS);
          return {
            x:           sc.x,
            z:           sc.z,
            radiusScene: narrRadiusToScene(radiusM),
            radiusM,
            name:        p.name       || '',
            texte:       p.texte      || p.text || p.description || '',
            audio_text:  p.audio_text || p.texte || p.text || '',
            audio_file:  p.audio_file || null,
            audioBlobURL:null,          // rempli si MP3 chargé séparément
            delai:       parseFloat(p.delai || 0),
            categorie:   p.categorie  || '',
            triggered:   false,
          };
        });

      // Trie par distance croissante depuis le début du parcours
      // (optionnel mais aide au debug)
      if (pathPoints.length > 1) {
        const start = pathPoints[0];
        narrPoints.sort((a,b) => {
          const da = Math.sqrt(Math.pow((a.x-start.x),2)+Math.pow((a.z-start.z),2));
          const db = Math.sqrt(Math.pow((b.x-start.x),2)+Math.pow((b.z-start.z),2));
          return da - db;
        });
      }

      sigStatus(`✓ ${narrPoints.length} narrations chargées`);
      markLoaded('btn-narr');

      // Affiche les rayons de déclenchement en vue aérienne/carte (petits cercles)
      narrPoints.forEach(n => {
        const rGeo = new THREE.RingGeometry(
          n.radiusScene - 0.05,
          n.radiusScene,
          24
        );
        rGeo.rotateX(-Math.PI/2);
        const rMesh = new THREE.Mesh(
          rGeo,
          new THREE.MeshBasicMaterial({ color:0xff6600, transparent:true, opacity:0.4 })
        );
        rMesh.position.set(n.x, getAltAt(n.x,n.z)+0.15, n.z);
        scene.add(rMesh);
        n.debugMesh = rMesh;
      });

    } catch(err) {
      sigStatus('✗ Narrations: ' + err.message, false);
      console.error(err);
    }
  };
  r.readAsText(file);
}

// ── Chargement fichiers audio MP3/WAV ─────────────────────
// Association par nom de fichier : si audio_file="narration_01.mp3"
// et qu'on charge un fichier nommé "narration_01.mp3", ils se matchent.
let audioBlobs = {}; // { "narration_01.mp3": "blob:..." }

function loadAudioFiles(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let loaded = 0;

  files.forEach(file => {
    // Libère l'ancien blob si existait
    if (audioBlobs[file.name]) URL.revokeObjectURL(audioBlobs[file.name]);
    audioBlobs[file.name] = URL.createObjectURL(file);
    loaded++;

    // Association immédiate avec les points narratifs existants
    narrPoints.forEach(n => {
      if (n.audio_file && matchAudioFile(n.audio_file, file.name)) {
        n.audioBlobURL = audioBlobs[file.name];
      }
    });
  });

  sigStatus(`✓ ${loaded} fichier(s) audio chargé(s)\n${narrPoints.filter(n=>n.audioBlobURL).length}/${narrPoints.length} points associés`);
  markLoaded('btn-audio');
}

// Matching flexible : "audio/narration_01.mp3" matche "narration_01.mp3"
function matchAudioFile(audioFileProp, fileName) {
  // Extrait le nom de fichier seul depuis un éventuel chemin
  const propName = audioFileProp.split('/').pop().split('\\').pop();
  return propName.toLowerCase() === fileName.toLowerCase();
}

// Si les narrations sont chargées APRÈS les audios, on réassocre
function reAssociateAudio() {
  narrPoints.forEach(n => {
    if (n.audio_file && !n.audioBlobURL) {
      const fileName = n.audio_file.split('/').pop().split('\\').pop();
      if (audioBlobs[fileName]) n.audioBlobURL = audioBlobs[fileName];
      else {
        // Cherche sans tenir compte de la casse
        const key = Object.keys(audioBlobs).find(k => k.toLowerCase() === fileName.toLowerCase());
        if (key) n.audioBlobURL = audioBlobs[key];
      }
    }
  });
}


function showAttr(props, sx, sy){
  document.getElementById('attr-title').textContent=props.name||'Bâtiment';
  const body=document.getElementById('attr-body'); body.innerHTML='';
  const labels={type:'Type',epoque:'Époque',materiaux:'Matériaux',hauteur:'Hauteur',height:'Hauteur',note:'Note',description:'Description','building:levels':'Niveaux'};
  Object.entries(props).forEach(([k,v])=>{
    if(k==='name'||!v) return;
    const row=document.createElement('div'); row.className='attr-row';
    row.innerHTML='<span class="attr-key">'+(labels[k]||k)+'</span><span class="attr-val">'+v+'</span>';
    body.appendChild(row);
  });
  const pw=255, ph=240;
  let px=sx+14, py=sy-20;
  if(px+pw>window.innerWidth-20) px=sx-pw-14;
  if(py+ph>window.innerHeight-20) py=window.innerHeight-ph-20;
  const pop=document.getElementById('attr-popup');
  pop.style.left=px+'px'; pop.style.top=py+'px';
  pop.classList.add('visible');
}
function closeAttr(){ document.getElementById('attr-popup').classList.remove('visible'); }

canvas.addEventListener('click',e=>{
  unlockSynth();
  if (typeof unlockAmbientAudio === 'function') unlockAmbientAudio();
  mouse.x=(e.clientX/window.innerWidth)*2-1;
  mouse.y=-(e.clientY/window.innerHeight)*2+1;
  raycaster.setFromCamera(mouse,activeCamera);

  // POI en premier (marqueurs sphère/anneau) — même comportement qu'un clic
  // sur la carte du POI dans le panneau de la vue Carte.
  const poiHits = raycaster.intersectObjects(poiObjects.flatMap(o=>[o.marker,o.ring]));
  if (poiHits.length>0) {
    const hitObj = poiHits[0].object;
    const poi = poiObjects.find(o=>o.marker===hitObj||o.ring===hitObj);
    if (poi) { openPOIInteraction(poi.data); return; }
  }

  const hits=raycaster.intersectObjects(buildingMeshes);
  if(hits.length>0&&hits[0].object.userData.props) showAttr(hits[0].object.userData.props,e.clientX,e.clientY);
  else closeAttr();
});
