// SPEECH
// ══════════════════════════════════════════════════════════
const synth=window.speechSynthesis; let voiceFR=null;
let synthUnlocked=false;
let pendingSpeech=null; // texte en attente si synth pas encore débloqué

function unlockSynth() {
  if (synthUnlocked) return;
  synthUnlocked = true;
  // Utterance silencieuse pour débloquer le contexte (Chrome + Firefox)
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0.01; u.rate = 2;
  u.onend = () => {
    // Si un texte attendait, le jouer maintenant
    if (pendingSpeech) { const t=pendingSpeech; pendingSpeech=null; speak(t); }
  };
  try { synth.speak(u); } catch(e) {}
}

function loadVoices(){
  const v=synth.getVoices();
  voiceFR = v.find(x=>x.lang==='fr-FR'&&x.localService)
          || v.find(x=>x.lang.startsWith('fr')&&x.localService)
          || v.find(x=>x.lang==='fr-FR')
          || v.find(x=>x.lang.startsWith('fr'))
          || null;
  // Liste les voix françaises disponibles en console pour diagnostic
  const frVoices = v.filter(x=>x.lang.startsWith('fr'));
  if (frVoices.length) {
    console.log('Voix FR disponibles:', frVoices.map(x=>x.name+' ('+x.lang+(x.localService?', locale':', réseau')+')'));
  } else {
    console.warn('Aucune voix française détectée sur ce système — la lecture utilisera une voix par défaut potentiellement avec accent.');
  }
}
loadVoices();
if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadVoices;

let currentUtterance = null; // référence à l'utterance en cours, pour neutraliser son callback avant de la couper

function speak(t){
  speakWithCallback(t, null);
}

function speakWithCallback(t, onDone){
  if(!synth||!t||!t.trim()){ if(onDone) onDone(); return; }
  if(!synthUnlocked){
    pendingSpeech = t; if(onDone) onDone(); return;
  }
  // Neutralise le callback de l'utterance précédente AVANT de la couper :
  // synth.cancel() déclenche 'end' sur l'utterance en cours, ce qui
  // appellerait sinon prématurément son onDone/release() (ex: reprise
  // intempestive d'une narration mise en attente derrière elle), alors que
  // cette narration a simplement été interrompue, pas terminée normalement.
  if (currentUtterance) { currentUtterance.onend = null; currentUtterance.onerror = null; }
  synth.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang='fr-FR'; u.rate=0.88; u.pitch=0.95;
  if(voiceFR) u.voice=voiceFR;
  if (onDone) {
    u.onend   = onDone;
    u.onerror = onDone;
  }
  currentUtterance = u;
  try { synth.speak(u); } catch(e){ console.warn('speak error:',e); if(onDone) onDone(); }
}

function stopSpeaking(){
  synth.cancel();
  pendingSpeech = null;
}

let narTimer=null;
// displayText = texte affiché à l'écran
// audioText   = texte lu à voix haute (si null = pas de lecture auto)
function showNarrative(displayText, audioText=undefined){
  const box=document.getElementById('narrative-box');
  document.getElementById('narrative-text').textContent=displayText;
  box.style.opacity='1';
  if(narTimer)clearTimeout(narTimer);
  // audioText === undefined → pas de lecture (triggerNarration gère l'audio)
  // audioText === null      → pas de lecture
  // audioText === string    → lecture directe (utilisé par les POI narratifs)
  if(audioText !== undefined && audioText !== null) speak(audioText);
  narTimer=setTimeout(()=>{box.style.opacity='0';},13000);
}

const narratives=[];  // rempli depuis les POI GeoJSON (audio_text)

// ══════════════════════════════════════════════════════════
// STATE & CONTRÔLES
// ══════════════════════════════════════════════════════════
let bobPhase=0, isWalking=false, totalDist=0, displayedDist=0, frameCount=0, ended=false;
pathT=0;

// ── Système unifié de marche : intention utilisateur + raisons de pause ────
// walkIntent      : true dès qu'un déclencheur UTILISATEUR (bouton, pas du
//                    podomètre, ESPACE) veut avancer. Redevient false uniquement
//                    sur un arrêt VOULU (bouton, plus de pas détecté).
// walkPauseReasons : raisons SYSTÉMIQUES empêchant la marche là, maintenant
//                    ('narration', 'poi', 'poi-proximity'...). Ajoutées/retirées
//                    par pauseWalking()/resumeWalking(), jamais par l'utilisateur
//                    directement. La marche ne reprend que quand walkIntent est
//                    vrai ET qu'aucune raison n'est active — ainsi un arrêt
//                    systémique ne peut jamais être confondu avec une décision
//                    de l'utilisateur (et vice versa).
let walkIntent = false;
const walkPauseReasons = new Set();

function _setMoving(v) {
  if (isWalking === v) return;
  isWalking = v;
  if (v) {
    unlockSynth(); // débloque speechSynthesis au premier geste
    if (typeof unlockAmbientAudio === 'function') unlockAmbientAudio(); // débloque le fondu sonore des POI
    // Le rappel des contrôles ne sert plus une fois qu'on a commencé à marcher,
    // et prend trop de place à l'écran sur mobile.
    const hint = document.getElementById('hint');
    if (hint) hint.classList.add('hint-hidden');
  }
  if (typeof updateStepBtnLabel === 'function') updateStepBtnLabel();
}

function _tryResumeWalking() {
  if (ended || pathPoints.length<=1) return;
  if (!walkIntent || walkPauseReasons.size > 0) return;
  _setMoving(true);
}

// Déclencheurs UTILISATEUR (bouton "Marche auto", pas du podomètre, ESPACE).
function startWalking(){
  walkIntent = true;
  // Un déclencheur utilisateur explicite vaut décision de continuer malgré
  // une halte POI suggérée — mais PAS malgré une narration ou un POI ouvert,
  // qui doivent se résoudre d'eux-mêmes (fin de narration, fermeture du POI).
  walkPauseReasons.delete('poi-proximity');
  _tryResumeWalking();
}
// Déclencheurs UTILISATEUR (bouton "Arrêter", relâchement, plus de pas détecté).
function stopWalking(){
  walkIntent = false;
  _setMoving(false);
}

// Pauses SYSTÉMIQUES (narration, POI, proximité POI en mode auto) — jamais
// appelées directement par un clic/pas utilisateur.
function pauseWalking(reason) {
  walkPauseReasons.add(reason);
  _setMoving(false);
}
function resumeWalking(reason) {
  walkPauseReasons.delete(reason);
  _tryResumeWalking();
}

function setView(v){
  currentView=v;
  ['fps','aerial','map'].forEach(n=>{
    const b=document.getElementById('btn-'+n);
    if(n===v){b.style.background='rgba(255,210,140,.2)';b.style.borderColor='rgba(255,210,140,.55)';b.style.color='rgba(255,210,140,1)';}
    else{b.style.background='rgba(255,255,255,.07)';b.style.borderColor='rgba(255,255,255,.2)';b.style.color='rgba(255,255,255,.8)';}
  });
  mapMesh.visible=(v==='map');
  document.getElementById('poi-panel') && (document.getElementById('poi-panel').style.display=(v==='map')?'block':'none');
  if(v==='map'){ activeCamera=mapCam; updatePOIPanel(); }
  else if(v==='aerial'){ activeCamera=aerialCam; }
  else{ activeCamera=fpsCam; }
}

function updatePOIPanel(){
  const panel=document.getElementById('poi-panel');
  if (!panel) return;
  panel.querySelectorAll('.poi-card').forEach(e=>e.remove());
  const camPos=getPosOnPath(pathT);
  poiData.forEach(p=>{
    const dist=Math.round(Math.sqrt(Math.pow((p.x||0)-camPos.x,2)+Math.pow(p.z-camPos.z,2)));
    const card=document.createElement('div'); card.className='poi-card';

    const type = (typeof poiType === 'function') ? poiType(p) : null;
    const key  = (typeof poiKey === 'function') ? poiKey(p) : null;
    const done = key && typeof poiFragments !== 'undefined' && poiFragments[key];
    const badge = type ? ' <span style="opacity:.7">' + (done ? '✓' : (POI_DEFAULT_ICON[type]||'')) + '</span>' : '';
    card.innerHTML='<div class="poi-name">'+p.name+badge+
      '</div><div class="poi-dist">'+(dist<30?'✓ Atteint':dist+' m')+'</div>';
    card.onclick=()=>{ if (typeof openPOIInteraction==='function') openPOIInteraction(p); else showNarrative(p.desc||p.name, p.audio_text||p.desc||p.name); };
    panel.appendChild(card);
  });
}

function resetJourney(){
  pathT=0; bobPhase=0; totalDist=0; displayedDist=0; ended=false;
  narratives.forEach(n=>{n.done=false;});
  stopNarration();
  document.getElementById('end-screen').classList.remove('visible');
  document.getElementById('narrative-box').style.opacity='0';
  document.getElementById('progress-fill').style.width='0%';
  document.getElementById('km-badge').textContent='0 mètres parcourus';
  closeAttr();
  // Reset narrations par proximité
  narrPoints.forEach(n=>{ n.played=false; });
  // Reset des interactions POI (carnet, fragments, sons d'approche)
  if (typeof resetPOIInteractions === 'function') resetPOIInteractions();
}
