// ── Interactions POI typées ─────────────────────────────────
// Chaque POI peut porter une propriété `type` dans pois.geojson :
//   contemplative | instructive | sensorielle | reflexive | panorama
// Un POI SANS `type` garde l'ancien comportement (narration simple).
//
// Schéma des propriétés attendues par type (toutes optionnelles, avec repli) :
//   contemplative : duration (secondes, def 8), closing_text, fragment_icon, fragment_label, fragment_text
//   instructive   : quiz_q, quiz_opts ("Rép A|Rép B|Rép C"), quiz_correct (index 0-based), quiz_fact,
//                   fragment_icon, fragment_label
//   sensorielle   : sound_file (nom de fichier dans /audio, optionnel — sinon son généré),
//                   fragment_icon, fragment_label, fragment_text
//   reflexive     : reflect_q, fragment_icon, fragment_label
//   panorama      : photos ("photo1.jpg|photo2.jpg"), photo_captions ("légende1|légende2"),
//                   fragment_icon, fragment_label
// ─────────────────────────────────────────────────────────────

const POI_TYPES = ['contemplative', 'instructive', 'sensorielle', 'reflexive', 'panorama'];

const POI_STAGE_LABEL = {
  contemplative: 'Halte contemplative',
  instructive:   'Halte instructive',
  sensorielle:   'Halte sensorielle',
  reflexive:     'Halte réflexive',
  panorama:      'Point de vue',
};
const POI_SUB_LABEL = {
  contemplative: 'Prends un instant pour respirer',
  instructive:   'Une question, un savoir à découvrir',
  sensorielle:   'Ferme les yeux et écoute',
  reflexive:     'Une pensée à déposer',
  panorama:      'Regarde autour de toi',
};
const POI_DEFAULT_ICON = {
  contemplative: '🌿', instructive: '📜', sensorielle: '🔔', reflexive: '⛲', panorama: '📷',
};

let poiFragments   = {};   // { key: {icon,label,type,content,image?} }
let activePOI      = null;
let poiOverlayOpen  = false;

function poiKey(poi) {
  return (poi.name || '') + '|' + (poi.x||0).toFixed(1) + ',' + (poi.z||0).toFixed(1);
}
function poiProps(poi) { return poi.props || {}; }
function poiType(poi) {
  const t = (poiProps(poi).type || '').toLowerCase().trim();
  return POI_TYPES.includes(t) ? t : null;
}

// Point d'entrée appelé au clic sur un POI (scène 3D ou panneau carte)
function openPOIInteraction(poi) {
  poi.announced = true; // découvert par clic — plus besoin de l'annoncer à l'approche
  walkPauseReasons.delete('poi-proximity'); // résout toute pause de proximité en attente pour ce POI
  const type = poiType(poi);
  if (!type) {
    // Comportement historique : narration simple
    showNarrative(poi.desc || poi.name, poi.audio_text || poi.desc || poi.name);
    return;
  }
  const key = poiKey(poi);
  if (poiFragments[key]) {
    // Déjà visité — on rappelle juste le fragment recueilli, sans refaire l'interaction
    showNarrative('« ' + poiFragments[key].content + ' »', null);
    return;
  }

  activePOI = poi;
  poiOverlayOpen = true;
  pauseWalking('poi');
  fadeOutAmbient(key);
  unlockAmbientAudio();

  document.getElementById('poi-stage').textContent   = POI_STAGE_LABEL[type];
  document.getElementById('poi-heading').textContent = poi.name || 'Halte';
  document.getElementById('poi-sub').textContent      = POI_SUB_LABEL[type];
  document.getElementById('poi-overlay').classList.add('visible');

  const props = poiProps(poi);
  ({
    contemplative: renderContemplative,
    instructive:   renderInstructive,
    sensorielle:   renderSensorielle,
    reflexive:     renderReflexive,
    panorama:      renderPanorama,
  })[type](poi, props);
}

function closePOIOverlay() {
  document.getElementById('poi-overlay').classList.remove('visible');
  poiOverlayOpen = false;
  activePOI = null;
  // Ne relance que si walkIntent est vrai ET qu'aucune autre raison de pause
  // n'est active (ex: une narration en cours) — voir speech.js.
  resumeWalking('poi');
}

function collectPOIFragment(fragment) {
  if (!activePOI) return;
  const key = poiKey(activePOI);
  poiFragments[key] = Object.assign({ name: activePOI.name }, fragment);
  closePOIOverlay();
  updateCarnetBadge();
}

/* ---------------- Contemplative ---------------- */
function renderContemplative(poi, props) {
  const body = document.getElementById('poi-body');
  const durationMs = (parseFloat(props.duration) || 8) * 1000;
  body.innerHTML = `
    <div class="poi-breathe poi-fade-in">
      <div class="poi-breathe-circle"></div>
      <div class="poi-breathe-txt" id="poi-breathe-txt">Inspire…</div>
      <button class="poi-btn poi-btn-ghost" id="poi-breathe-continue" disabled>Reprendre la marche</button>
    </div>`;
  const txt = document.getElementById('poi-breathe-txt');
  const phases = ['Inspire…', '…retiens…', 'Expire…', '…'];
  let phase = 0;
  const cycle = setInterval(() => { phase = (phase + 1) % 4; txt.textContent = phases[phase]; }, 2000);
  setTimeout(() => {
    clearInterval(cycle);
    txt.textContent = props.closing_text || 'Prends ce moment avec toi.';
    const btn = document.getElementById('poi-breathe-continue');
    btn.disabled = false;
    btn.onclick = () => collectPOIFragment({
      icon: props.fragment_icon || POI_DEFAULT_ICON.contemplative,
      label: props.fragment_label || 'Sensation',
      type: 'contemplative',
      content: props.fragment_text || poi.desc || poi.name,
    });
  }, durationMs);
}

/* ---------------- Instructive ---------------- */
function renderInstructive(poi, props) {
  const body = document.getElementById('poi-body');
  const opts = (props.quiz_opts || '').split('|').map(s => s.trim()).filter(Boolean);
  const correct = parseInt(props.quiz_correct, 10) || 0;
  body.innerHTML = `
    <div class="poi-fade-in">
      <div class="poi-quiz-q">${props.quiz_q || poi.desc || poi.name}</div>
      <div class="poi-quiz-opts" id="poi-quiz-opts">
        ${opts.map((o, i) => `<button class="poi-quiz-opt" data-i="${i}">${o}</button>`).join('')}
      </div>
      <div class="poi-quiz-fact" id="poi-quiz-fact">${props.quiz_fact || ''}</div>
      <button class="poi-btn poi-btn-ghost hidden" id="poi-quiz-continue">Reprendre la marche</button>
    </div>`;
  document.querySelectorAll('#poi-quiz-opts .poi-quiz-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      document.querySelectorAll('#poi-quiz-opts .poi-quiz-opt').forEach(b => b.disabled = true);
      if (i === correct) {
        btn.classList.add('correct');
      } else {
        btn.classList.add('wrong');
        const good = document.querySelector(`#poi-quiz-opts .poi-quiz-opt[data-i="${correct}"]`);
        if (good) good.classList.add('correct');
      }
      if (props.quiz_fact) document.getElementById('poi-quiz-fact').classList.add('visible');
      const cont = document.getElementById('poi-quiz-continue');
      cont.classList.remove('hidden');
      cont.onclick = () => collectPOIFragment({
        icon: props.fragment_icon || POI_DEFAULT_ICON.instructive,
        label: props.fragment_label || 'Savoir',
        type: 'instructive',
        content: props.quiz_fact || poi.desc || poi.name,
      });
    });
  });
}

/* ---------------- Sensorielle ---------------- */
function renderSensorielle(poi, props) {
  const body = document.getElementById('poi-body');
  body.innerHTML = `
    <div class="poi-listen poi-fade-in">
      <button class="poi-listen-btn" id="poi-listen-btn">▶</button>
      <div class="poi-waveform" id="poi-waveform">${Array.from({ length: 16 }).map(() => '<span></span>').join('')}</div>
      <div class="poi-breathe-txt" id="poi-listen-caption">Touche pour écouter</div>
      <button class="poi-btn poi-btn-ghost hidden" id="poi-listen-continue">Reprendre la marche</button>
    </div>`;
  document.getElementById('poi-listen-btn').addEventListener('click', () => doPOIListen(poi, props));
}

let poiSoundCtx = null;
function playPOIGeneratedTone(onDone) {
  try {
    poiSoundCtx = poiSoundCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = poiSoundCtx.currentTime;
    const osc = poiSoundCtx.createOscillator();
    const gain = poiSoundCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 1.6);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    osc.connect(gain).connect(poiSoundCtx.destination);
    osc.start(now); osc.stop(now + 2.3);
    osc.onended = () => onDone && onDone();
  } catch (e) { setTimeout(() => onDone && onDone(), 1200); }
}

function doPOIListen(poi, props) {
  const btn = document.getElementById('poi-listen-btn');
  const caption = document.getElementById('poi-listen-caption');
  const bars = document.querySelectorAll('#poi-waveform span');
  btn.disabled = true;
  btn.classList.add('playing');
  caption.textContent = 'Écoute…';
  const anim = setInterval(() => bars.forEach(b => b.style.height = (3 + Math.random() * 17) + 'px'), 90);

  const finish = () => {
    clearInterval(anim);
    bars.forEach(b => b.style.height = '3px');
    caption.textContent = 'Le son s\'est tu.';
    const cont = document.getElementById('poi-listen-continue');
    cont.classList.remove('hidden');
    cont.onclick = () => collectPOIFragment({
      icon: props.fragment_icon || POI_DEFAULT_ICON.sensorielle,
      label: props.fragment_label || 'Écho',
      type: 'sensorielle',
      content: props.fragment_text || poi.desc || poi.name,
    });
  };

  if (props.sound_file) {
    const url = (audioBlobs && audioBlobs[props.sound_file]) ||
                ((window.EMBEDDED && window.EMBEDDED.audio_base) || './audio/') + props.sound_file;
    const audio = new Audio(url);
    audio.onended = finish;
    audio.onerror = () => playPOIGeneratedTone(finish);
    audio.play().catch(() => playPOIGeneratedTone(finish));
  } else {
    playPOIGeneratedTone(finish);
  }
}

/* ---------------- Réflexive ---------------- */
function renderReflexive(poi, props) {
  const body = document.getElementById('poi-body');
  body.innerHTML = `
    <div class="poi-fade-in">
      <div class="poi-reflect-q">"${props.reflect_q || 'Qu\'est-ce que cet endroit évoque pour toi ?'}"</div>
      <textarea id="poi-reflect-input" placeholder="Écris librement, une phrase suffit…"></textarea>
      <button class="poi-btn poi-btn-primary" id="poi-reflect-submit">Déposer ma pensée</button>
    </div>`;
  document.getElementById('poi-reflect-submit').onclick = () => {
    const val = document.getElementById('poi-reflect-input').value.trim();
    collectPOIFragment({
      icon: props.fragment_icon || POI_DEFAULT_ICON.reflexive,
      label: props.fragment_label || 'Pensée',
      type: 'reflexive',
      content: val.length ? val : '(un silence, déposé sans mots)',
    });
  };
}

/* ---------------- Panorama (carrousel photo) ---------------- */
function renderPanorama(poi, props) {
  const body = document.getElementById('poi-body');
  const base = (window.EMBEDDED && window.EMBEDDED.photos_base) || './photos/';
  const photos = (props.photos || '').split('|').map(s => s.trim()).filter(Boolean);
  const captions = (props.photo_captions || '').split('|').map(s => s.trim());

  if (!photos.length) {
    body.innerHTML = `
      <div class="poi-fade-in" style="text-align:center; padding:10px 0;">
        <div style="font-size:13px; color:rgba(255,255,255,.5); margin-bottom:14px;">Aucune photo n'a été ajoutée pour cette halte.</div>
        <button class="poi-btn poi-btn-primary" id="poi-photo-continue">Reprendre la marche</button>
      </div>`;
    document.getElementById('poi-photo-continue').onclick = () => collectPOIFragment({
      icon: props.fragment_icon || POI_DEFAULT_ICON.panorama,
      label: props.fragment_label || 'Regard',
      type: 'panorama',
      content: poi.desc || poi.name,
    });
    return;
  }

  let idx = 0;
  body.innerHTML = `
    <div class="poi-fade-in">
      <div class="poi-photo-frame" id="poi-photo-frame">
        ${photos.map((p, i) => `<img src="${base}${p}" class="${i === 0 ? 'active' : ''}" data-i="${i}">`).join('')}
        ${photos.length > 1 ? `
          <button class="poi-photo-nav prev" id="poi-photo-prev">‹</button>
          <button class="poi-photo-nav next" id="poi-photo-next">›</button>` : ''}
      </div>
      ${photos.length > 1 ? `<div class="poi-photo-dots" id="poi-photo-dots">${photos.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}
      <div class="poi-photo-caption" id="poi-photo-caption">${captions[0] || ''}</div>
      <button class="poi-btn poi-btn-primary" id="poi-photo-keep">📷 Garder ce souvenir</button>
    </div>`;

  const showPhoto = i => {
    idx = (i + photos.length) % photos.length;
    document.querySelectorAll('#poi-photo-frame img').forEach(img => img.classList.toggle('active', Number(img.dataset.i) === idx));
    if (document.getElementById('poi-photo-dots')) {
      document.querySelectorAll('#poi-photo-dots span').forEach((d, i2) => d.classList.toggle('active', i2 === idx));
    }
    document.getElementById('poi-photo-caption').textContent = captions[idx] || '';
  };
  const prevBtn = document.getElementById('poi-photo-prev');
  const nextBtn = document.getElementById('poi-photo-next');
  if (prevBtn) prevBtn.onclick = () => showPhoto(idx - 1);
  if (nextBtn) nextBtn.onclick = () => showPhoto(idx + 1);

  document.getElementById('poi-photo-keep').onclick = () => collectPOIFragment({
    icon: props.fragment_icon || POI_DEFAULT_ICON.panorama,
    label: props.fragment_label || 'Regard',
    type: 'panorama',
    content: captions[idx] || poi.desc || poi.name,
    image: base + photos[idx],
  });
}

/* ---------------- Carnet (badge en haut d'écran) ---------------- */
function updateCarnetBadge() {
  const badge = document.getElementById('carnet-badge');
  if (!badge) return;
  const total = poiData.filter(p => poiType(p)).length;
  const done  = Object.keys(poiFragments).length;
  if (total === 0) { badge.classList.remove('visible'); return; }
  badge.textContent = `📖 ${done}/${total}`;
  badge.classList.add('visible');
}

/* ---------------- Fondu sonore d'approche ---------------- */
// Chaque POI typé émet un son doux et distinct qui monte en volume à
// l'approche (Web Audio, aucun fichier requis) puis s'éteint si on
// s'éloigne ou si le point a déjà été visité.
let ambientCtx = null;
const ambientVoices = new Map(); // poiKey -> {osc, gain}
const AMBIENT_RADIUS = 70; // mètres, distance à partir de laquelle le son apparaît
const AMBIENT_PROFILE = {
  contemplative: { freq: 196, type: 'sine' },
  instructive:   { freq: 330, type: 'triangle' },
  sensorielle:   { freq: 261, type: 'sine' },
  reflexive:     { freq: 220, type: 'sine' },
  panorama:      { freq: 294, type: 'sine' },
};

function unlockAmbientAudio() {
  if (!ambientCtx) {
    try { ambientCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (ambientCtx.state === 'suspended') ambientCtx.resume();
}

function ambientVoiceFor(key, type) {
  if (ambientVoices.has(key)) return ambientVoices.get(key);
  if (!ambientCtx) return null;
  const profile = AMBIENT_PROFILE[type] || AMBIENT_PROFILE.contemplative;
  const osc = ambientCtx.createOscillator();
  const gain = ambientCtx.createGain();
  osc.type = profile.type;
  osc.frequency.value = profile.freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ambientCtx.destination);
  osc.start();
  const voice = { osc, gain };
  ambientVoices.set(key, voice);
  return voice;
}

function fadeOutAmbient(key) {
  const voice = ambientVoices.get(key);
  if (voice && ambientCtx) voice.gain.gain.setTargetAtTime(0, ambientCtx.currentTime, 0.6);
}

function updateAmbientProximity(camPos) {
  if (!ambientCtx || poiOverlayOpen) return; // pas de fondu pendant une interaction ouverte
  poiData.forEach(p => {
    const type = poiType(p);
    if (!type) return;
    const key = poiKey(p);
    if (poiFragments[key]) { fadeOutAmbient(key); return; }
    const dx = camPos.x - p.x, dz = camPos.z - (p.z || 0);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < AMBIENT_RADIUS) {
      const voice = ambientVoiceFor(key, type);
      if (!voice) return;
      const proximity = 1 - Math.min(1, dist / AMBIENT_RADIUS);
      const target = proximity * proximity * 0.22; // volume max, perceptible mais discret
      voice.gain.gain.setTargetAtTime(target, ambientCtx.currentTime, 0.3);
    } else if (ambientVoices.has(key)) {
      fadeOutAmbient(key);
    }
  });
}

/* ---------------- Récapitulatif de fin de parcours ---------------- */
function renderPOIRecap() {
  const el = document.getElementById('end-recap');
  const empty = document.getElementById('end-recap-empty');
  if (!el) return;
  const entries = Object.values(poiFragments);
  if (!entries.length) {
    el.innerHTML = '';
    el.insertAdjacentHTML('afterend', '<div id="end-recap-empty">Aucun fragment recueilli sur ce parcours.</div>');
    return;
  }
  const oldEmpty = document.getElementById('end-recap-empty');
  if (oldEmpty) oldEmpty.remove();
  el.innerHTML = entries.map(f => `
    <div class="end-recap-cell">
      ${f.image ? `<img src="${f.image}">` : ''}
      <div class="erc-icon">${f.icon}</div>
      <div class="erc-name">${f.name || f.label}</div>
      <div class="erc-content">${f.content}</div>
    </div>`).join('');
}

/* ---------------- Reset (rejouer le parcours) ---------------- */
function resetPOIInteractions() {
  poiFragments = {};
  closePOIOverlay();
  walkPauseReasons.delete('poi-proximity');
  if (typeof poiObjects !== 'undefined') {
    poiObjects.forEach(o => { o.data.announced = false; o.data.proximityPaused = false; });
  }
  ambientVoices.forEach((v, key) => fadeOutAmbient(key));
  updateCarnetBadge();
}
