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

function speak(t){
  speakWithCallback(t, null);
}

function speakWithCallback(t, onDone){
  if(!synth||!t||!t.trim()){ if(onDone) onDone(); return; }
  if(!synthUnlocked){
    pendingSpeech = t; if(onDone) onDone(); return;
  }
  synth.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang='fr-FR'; u.rate=0.88; u.pitch=0.95;
  if(voiceFR) u.voice=voiceFR;
  if (onDone) {
    u.onend   = onDone;
    u.onerror = onDone;
  }
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

function startWalking(){
  if (ended || pathPoints.length<=1 || isWalking || poiOverlayOpen) return;
  unlockSynth(); // débloque speechSynthesis au premier geste
  if (typeof unlockAmbientAudio === 'function') unlockAmbientAudio(); // débloque le fondu sonore des POI

  // Bloqué uniquement si on est figé sur un point en attente d'une narration précédente.
  // currentNarr peut être non-null (audio qui joue en fond) sans empêcher la marche.
  if (blockedAtNarr) return;

  isWalking = true;
  document.getElementById('step-btn').style.background = 'rgba(255,210,140,.35)';
  document.getElementById('step-btn').innerHTML = (typeof isMobile==='function' && isMobile()) ? '⏸ Arrêter' : '▶ Marcher'; // toujours actif, même si currentNarr joue en fond
  // Le rappel des contrôles ne sert plus une fois qu'on a commencé à marcher,
  // et prend trop de place à l'écran sur mobile — on le masque en fondu,
  // quelle que soit la façon dont la marche a démarré (bouton, ESPACE, podomètre).
  const hint = document.getElementById('hint');
  if (hint) hint.classList.add('hint-hidden');
}
function stopWalking(){
  if (!isWalking) return; // déjà arrêté, ignore l'appel redondant
  isWalking=false;
  // Si on est bloqué à un point narratif, le bouton garde son style "bloqué"
  if (!blockedAtNarr) {
    document.getElementById('step-btn').style.background='rgba(255,210,140,.15)';
    document.getElementById('step-btn').innerHTML = (typeof isMobile==='function' && isMobile()) ? '▶ Marche auto' : '▶ Marcher';
  }
  // La narration en cours n'est PAS coupée — elle continue jusqu'au bout
  // même si l'utilisateur relâche le bouton manuellement
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
