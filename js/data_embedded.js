// ── Fonctions _data : versions acceptant un objet GeoJSON directement ──
// (utilisées par le loader embarqué ET pour stocker les raw)

async function loadGeoTIFF_data(arrayBuffer, originOverride) {
  try {
    showLoader('Chargement MNT embarqué…');
    const tiff  = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const bbox  = image.getBoundingBox();
    const imgW  = image.getWidth(), imgH = image.getHeight();
    const [minE,minN,maxE,maxN] = bbox;
    if (originOverride) { geoOrigin = originOverride; }
    else { setOrigin(minE, minN); }
    showLoader('Extraction altitudes…');
    const rasters = await image.readRasters({interleave:true});
    let minAlt=Infinity, maxAlt=-Infinity;
    for(let i=0;i<rasters.length;i++){const v=rasters[i];if(isFinite(v)&&v>-9000){if(v<minAlt)minAlt=v;if(v>maxAlt)maxAlt=v;}}
    function gaussSmooth(data,w,h,passes=3){const K=[1,2,1,2,4,2,1,2,1];let d=Float32Array.from(data);for(let p=0;p<passes;p++){const out=new Float32Array(d.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,wsum=0,ki=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,w2=K[ki++];if(nx>=0&&nx<w&&ny>=0&&ny<h){const v=d[ny*w+nx];if(isFinite(v)&&v>-9000){sum+=v*w2;wsum+=w2;}}}out[y*w+x]=wsum>0?sum/wsum:d[y*w+x];}d=out;}return d;}
    function upsample(data,w,h,scale){const nw=Math.round(w*scale),nh=Math.round(h*scale),out=new Float32Array(nw*nh);for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const fx=(x/(nw-1))*(w-1),fy=(y/(nh-1))*(h-1),x0=Math.floor(fx),x1=Math.min(w-1,x0+1),y0=Math.floor(fy),y1=Math.min(h-1,y0+1),tx=fx-x0,ty=fy-y0;out[y*nw+x]=data[y0*w+x0]*(1-tx)*(1-ty)+data[y0*w+x1]*tx*(1-ty)+data[y1*w+x0]*(1-tx)*ty+data[y1*w+x1]*tx*ty;}return{data:out,w:nw,h:nh};}
    const smoothed=gaussSmooth(rasters,imgW,imgH,3);
    const up=upsample(smoothed,imgW,imgH,4);
    const finalData=gaussSmooth(up.data,up.w,up.h,1);
    let minAlt2=Infinity,maxAlt2=-Infinity;
    for(let i=0;i<finalData.length;i++){const v=finalData[i];if(isFinite(v)&&v>-9000){if(v<minAlt2)minAlt2=v;if(v>maxAlt2)maxAlt2=v;}}
    const scSW=utmToScene(minE,minN),scNE=utmToScene(maxE,maxN);
    const ext={minX:scSW.x,maxX:scNE.x,minZ:scNE.z,maxZ:scSW.z};
    buildTerrainFromRaster(up.w,up.h,finalData,minAlt2,maxAlt2,ext);
    revealSky(); dismissEmpty();
    if(pathPoints.length>1){buildPath(pathPoints);}
    if(poiData.length>0){poiData.forEach(p=>{p.y=getAltAt(p.x,p.z);});buildPOIMarkers();}
    hideLoader();
  } catch(e){hideLoader();console.error('MNT embarqué:',e);}
}

// Texture satellite géoréférencée (GeoTIFF RGB) — appliquée automatiquement sur le
// terrain si présente (priorité sur OS/procédural, cf. applyTerrainTexture()).
async function loadSatelliteTIFF_data(arrayBuffer) {
  showLoader('Décodage image satellite…');
  const tiff  = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const bbox  = image.getBoundingBox();
  const imgW  = image.getWidth(), imgH = image.getHeight();
  const [minE, minN, maxE, maxN] = bbox;
  const nbBands = image.getSamplesPerPixel();
  if (nbBands < 3) throw new Error(`Satellite: ${nbBands} bande(s), RVB (3 bandes) attendu`);

  const rasters = await image.readRasters({ interleave: false });
  const R = rasters[0], G = rasters[1], B = rasters[2];
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = imgW; rawCanvas.height = imgH;
  const ctx = rawCanvas.getContext('2d');
  const imgData = ctx.createImageData(imgW, imgH);
  const d = imgData.data;
  const maxVal = Math.max(...Array.from(R.slice(0, 100)));
  const scale  = maxVal > 255 ? 1/256 : 1; // normalise uint16 → uint8
  for (let i=0; i<imgW*imgH; i++) {
    d[i*4]=Math.min(255,Math.round(R[i]*scale)); d[i*4+1]=Math.min(255,Math.round(G[i]*scale));
    d[i*4+2]=Math.min(255,Math.round(B[i]*scale)); d[i*4+3]=255;
  }
  ctx.putImageData(imgData, 0, 0);

  const maxSatSize = _mobile ? 1024 : 4096;
  let satCanvas = rawCanvas;
  if (imgW > maxSatSize || imgH > maxSatSize) {
    const ratio = Math.min(maxSatSize/imgW, maxSatSize/imgH);
    const rw = Math.round(imgW*ratio), rh = Math.round(imgH*ratio);
    satCanvas = document.createElement('canvas');
    satCanvas.width = rw; satCanvas.height = rh;
    satCanvas.getContext('2d').drawImage(rawCanvas, 0, 0, rw, rh);
  }

  if (!geoOrigin) setOrigin(minE, minN);
  const scSW = utmToScene(minE, minN), scNE = utmToScene(maxE, maxN);
  const satExt = { minX: scSW.x, maxX: scNE.x, minZ: scNE.z, maxZ: scSW.z };

  if (satTexture) satTexture.dispose();
  satTexture = new THREE.CanvasTexture(satCanvas);
  satTexture.wrapS = satTexture.wrapT = THREE.ClampToEdgeWrapping;
  satTexture.minFilter = THREE.LinearFilter; satTexture.magFilter = THREE.LinearFilter;
  setAnisotropy(satTexture);

  if (terrainMesh) {
    const terrExt = altGrid ? altGrid.ext : satExt;
    const terrW = terrExt.maxX - terrExt.minX, terrH = terrExt.maxZ - terrExt.minZ;
    const satW  = satExt.maxX  - satExt.minX,  satH  = satExt.maxZ  - satExt.minZ;
    satTexture.repeat.set(terrW / satW, terrH / satH);
    satTexture.offset.set((terrExt.minX - satExt.minX) / satW, (terrExt.minZ - satExt.minZ) / satH);
  }
  applyTerrainTexture();
  markLoaded('btn-sat');
  hideLoader();
}

// Repli simple : une image classique (jpg/png), sans métadonnées géographiques,
// plaquée directement sur toute l'emprise déjà connue du terrain (1:1, sans calcul
// de recalage). Pratique si l'on n'a pas de GeoTIFF mais juste une photo aérienne
// déjà cadrée sur le tracé.
function loadSatelliteImage_data(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (satTexture) satTexture.dispose();
      satTexture = new THREE.CanvasTexture(img);
      satTexture.wrapS = satTexture.wrapT = THREE.ClampToEdgeWrapping;
      satTexture.minFilter = THREE.LinearFilter; satTexture.magFilter = THREE.LinearFilter;
      satTexture.repeat.set(1, 1); satTexture.offset.set(0, 0); // couvre toute l'emprise du terrain
      setAnisotropy(satTexture);
      applyTerrainTexture();
      markLoaded('btn-sat');
      resolve(true);
    };
    img.onerror = () => { console.warn('Image satellite introuvable:', url); resolve(false); };
    img.src = url;
  });
}

function loadParcours_data(g) {
  if(!g||!g.features) return;
  _rawParcours = g;
  let coords=[];
  g.features.forEach(f=>{if(f.geometry&&f.geometry.type==='LineString')coords=f.geometry.coordinates;});
  if(!coords.length) return;
  if(!geoOrigin){const c=coords[0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  pathPoints=coords.map(c=>{const s=anyToScene(c[0],c[1]);return new THREE.Vector3(s.x,.2,s.z);});
  buildPath(pathPoints); pathT=0; dismissEmpty();
  markLoaded('btn-parcours');
}

function loadPOI_data(g) {
  if(!g||!g.features) return;
  _rawPOI = g;
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates;if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  poiData=g.features.map(f=>{
    const c=f.geometry.coordinates,s=anyToScene(c[0],c[1]),y=getAltAt(s.x,s.z);
    const pr=f.properties||{};
    return{
      name: pr.name||pr.Name||pr.nom||'Point',
      desc: pr.description||pr.desc||pr.texte||pr.text||'',
      audio_text: pr.audio_text||pr.description||pr.texte||'',
      x:s.x,z:s.z,y,props:pr
    };
  });
  buildPOIMarkers(); narratives.length=0;
  markLoaded('btn-poi');
  updateDefaultViewCenter();
}

function loadNarrations_data(g) {
  if(!g||!g.features) return;
  _rawNarrations = g;
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates;if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  narrPoints=g.features.filter(f=>f.geometry&&f.geometry.type==='Point').map(f=>{
    const c=f.geometry.coordinates,sc=anyToScene(c[0],c[1]),p=f.properties||{};
    const radiusM=parseFloat(p.trigger_radius||DEFAULT_TRIGGER_RADIUS);
    return{x:sc.x,z:sc.z,radiusScene:narrRadiusToScene(radiusM),radiusM,name:p.name||'',texte:p.texte||p.text||p.description||'',audio_text:p.audio_text||p.texte||p.text||'',audio_file:p.audio_file||null,audioBlobURL:null,delai:parseFloat(p.delai||0),categorie:p.categorie||'',triggered:false};
  });
  narrPoints.forEach(n=>{const rg=new THREE.RingGeometry(n.radiusScene-.05,n.radiusScene,24);rg.rotateX(-Math.PI/2);const rm=new THREE.Mesh(rg,new THREE.MeshBasicMaterial({color:0xff6600,transparent:true,opacity:.4}));rm.position.set(n.x,getAltAt(n.x,n.z)+.15,n.z);scene.add(rm);n.debugMesh=rm;});
  markLoaded('btn-narr');
}

function loadBati_data(g) {
  if(!g||!g.features) return;
  _rawBati = g;
  while(batiGroup.children.length)batiGroup.remove(batiGroup.children[0]);
  buildingMeshes=[];
  g.features.forEach(f=>{
    if(!f.geometry)return;
    let rings=[];
    if(f.geometry.type==='Polygon')rings=[f.geometry.coordinates[0]];
    else if(f.geometry.type==='MultiPolygon')f.geometry.coordinates.forEach(p=>rings.push(p[0]));
    rings.forEach(ring=>{
      if(!geoOrigin){const c=ring[0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
      const sr=ring.slice(0,-1).map(c=>{const s=anyToScene(c[0],c[1]);return[s.x,s.z];});
      if(sr.length<3)return;
      const props=Object.assign({name:'Bâtiment'},f.properties||{});
      const hM=parseFloat(props.height||props.hauteur||(props['building:levels']&&props['building:levels']*3.2)||DEFAULT_HEIGHT_M)||DEFAULT_HEIGHT_M;
      extrudePolygon(sr,hM,props);
    });
  });
  markLoaded('btn-bati');
  updateDefaultViewCenter();
}

async function loadOS_data(g) {
  if(!g||!g.features) return;
  _rawOS = g;
  while(osGroup.children.length)osGroup.remove(osGroup.children[0]);
  if(!geoOrigin&&g.features.length){const c=g.features[0].geometry.coordinates[0][0];if(isUTM(c[0],c[1]))setOrigin(c[0],c[1]);else{const m=wgs84ToUTM(c[0],c[1]);setOrigin(m.e,m.n);}}
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  // Groupes de polygone : Polygon → un seul groupe [contour, trou1, trou2...],
  // MultiPolygon → un groupe par sous-polygone. On garde TOUS les anneaux (pas
  // seulement le contour) pour que les trous (zones exclues) soient respectés.
  const converted=g.features.map(f=>{
    if(!f.geometry)return null;
    const polyGroups=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
    const scGroups=polyGroups.map(rings=>rings.map(ring=>ring.map(c=>{const s=anyToScene(c[0],c[1]);if(s.x<minX)minX=s.x;if(s.x>maxX)maxX=s.x;if(s.z<minZ)minZ=s.z;if(s.z>maxZ)maxZ=s.z;return[s.x,s.z];})));
    return{properties:f.properties,geometry:{type:f.geometry.type,coordinates:scGroups}};
  }).filter(Boolean);
  await buildOSTexture(converted,{minX,maxX,minZ,maxZ});

  // Objets 3D — modèles GLB instanciés (voir os.js pour le détail complet, mêmes
  // fonctions/constantes réutilisées ici : chargement partagé des scripts).
  const model3dNames=[...new Set(converted.map(f=>getModel3DName(f.properties)).filter(Boolean))];
  const loadedModels=new Map();
  await Promise.all(model3dNames.map(async name=>{loadedModels.set(name, await loadOSModel(name));}));
  for (const [name, scene] of loadedModels) { if (scene) getModelParts(name, scene); }

  const platform = _mobile ? 'mobile' : 'desktop';
  const totalBudget = GLB_TRIANGLE_BUDGET[platform];
  const maxPerZone  = GLB_MAX_INSTANCES_PER_ZONE[platform];
  const glbZoneByFeature = new Map();
  const fixedCostByCategory = {};
  const autoAreaByCategory  = {};

  for (const f of converted) {
    const model3dName = getModel3DName(f.properties);
    if (!model3dName || !loadedModels.get(model3dName)) continue;
    const type = normalizeOSType(f.properties);
    const category = getModelCategory(f.properties) || OS_CATEGORY_MAP[type] || 'autre';
    const area = getZoneArea(f.geometry.coordinates);
    const trisEach = getModelTriCount(model3dName);
    const explicitCount = getModel3DCount(f.properties);
    const explicitDensity = getModel3DDensity(f.properties);
    const info = { feature:f, model3dName, category, area, targetCount:null };
    glbZoneByFeature.set(f, info);
    if (explicitCount != null) {
      info.targetCount = Math.min(explicitCount, maxPerZone * GLB_EXPLICIT_SAFETY_FACTOR);
    } else if (explicitDensity != null) {
      info.targetCount = Math.max(GLB_MIN_INSTANCES_PER_ZONE, Math.min(Math.floor(area*explicitDensity), maxPerZone*GLB_EXPLICIT_SAFETY_FACTOR));
    } else {
      autoAreaByCategory[category] = (autoAreaByCategory[category]||0) + area;
      continue;
    }
    fixedCostByCategory[category] = (fixedCostByCategory[category]||0) + info.targetCount*trisEach;
  }
  for (const [, info] of glbZoneByFeature) {
    if (info.targetCount != null) continue;
    const trisEach = getModelTriCount(info.model3dName);
    const categoryBudget = totalBudget * (OS_CATEGORY_WEIGHTS[info.category] ?? OS_CATEGORY_WEIGHTS.autre);
    const remaining = Math.max(0, categoryBudget - (fixedCostByCategory[info.category]||0));
    const totalAutoArea = autoAreaByCategory[info.category] || 1;
    const shareTris = remaining * (info.area/totalAutoArea);
    info.targetCount = Math.min(maxPerZone, Math.max(GLB_MIN_INSTANCES_PER_ZONE, Math.floor(shareTris/trisEach)));
  }

  for (const f of converted) {
    const type=normalizeOSType(f.properties), style=type?OS_STYLE[type]:null;
    const model3dName = getModel3DName(f.properties);
    const zoneInfo = model3dName ? glbZoneByFeature.get(f) : null;
    for (const polyRings of f.geometry.coordinates) {
      if (type==='eau') makeWaterPlane(polyRings[0]);
      if (model3dName && zoneInfo) {
        const modelScene = loadedModels.get(model3dName);
        if (modelScene) {
          const parts = getModelParts(model3dName, modelScene);
          const subArea = getZoneArea([polyRings]);
          const share = zoneInfo.area>0 ? (subArea/zoneInfo.area) : 1;
          const subCount = Math.max(1, Math.round(zoneInfo.targetCount*share));
          plantModels3DInstanced(polyRings, parts, subCount);
        }
      } else if (style && style.treeColor) {
        plantTrees(polyRings, style);
      }
    }
  }
  markLoaded('btn-os');
}

