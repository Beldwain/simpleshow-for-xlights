/* SimpleShow — layout geometry & xLights-style rendering (supporting file).
   Must sit next to simpleshow-xlights.html; loaded with a plain <script src>.

   Replaces the old glyph-per-role house drawing with the way xLights draws a
   layout: every model renders as its actual LIGHT NODES. Geometry comes from
   the layout file itself — CustomModel pixel grids, Poly Line point data,
   two-point spans (lines / arches / icicles), tree cones, star rings, matrix
   grids — scaled by each model's world transform, so the preview finally
   looks like the xLights house view. Also owns:
   - per-node effect animation (chases travel, twinkles flicker, sparkle);
   - string-type color capability (RGB / RGBW / single color) parsing,
     overrides, and single-color tinting in the preview;
   - dragging props to new positions on the house canvas (persisted).

   Uses globals from the main file at runtime: S, ROLE_COLOR, hashF, shade,
   renderLayoutResults, drawPreviewFrame. */

/* ================= string-type color capability ================= */
const AUTOSHOW_CHAN_KEY='autoshow.chan.v1';
const SINGLE_COLOR_HINTS=[['white','#FFFFFF'],['warm','#FFD9A0'],['blue','#3355FF'],['red','#FF3333'],['green','#2ECC5A'],['custom','#FFD98C']];
function chanFromStringType(st){
  const s=(st||'').toLowerCase();
  if(/rgbw|4 channel/.test(s)) return {chan:'RGBW', color:null};
  if(/single color|single channel|strobes/.test(s)){
    const hit=SINGLE_COLOR_HINTS.find(([k])=>s.includes(k));
    return {chan:'single', color:hit?hit[1]:'#FFFFFF'};
  }
  return {chan:'RGB', color:null};
}
function chanOverrides(){
  try{ return JSON.parse(localStorage.getItem(AUTOSHOW_CHAN_KEY)||'{}'); }catch(e){ return {}; }
}
function saveChanOverride(name, chan, color){
  const o=chanOverrides();
  o[name]={chan, color};
  try{ localStorage.setItem(AUTOSHOW_CHAN_KEY, JSON.stringify(o)); }catch(e){}
}
function applyChanOverrides(models){
  const o=chanOverrides();
  models.forEach(m=>{
    const d=chanFromStringType(m.stringType);
    m.chan=d.chan; m.fixedColor=d.color;
    if(o[m.name]){ m.chan=o[m.name].chan; m.fixedColor=o[m.name].color||d.color; m.chanUser=true; }
    if(m.chan==='single' && !m.fixedColor) m.fixedColor='#FFFFFF';
  });
}
/* palette a MODEL is physically able to show — single color strings render
   any effect in their own color, so the plan/export should say so */
function palForModel(m, pal){
  return (m && m.chan==='single') ? [m.fixedColor] : pal;
}

/* ================= saved prop positions (drag to move) ================= */
const AUTOSHOW_POS_KEY='autoshow.positions.v1';
function posOverrides(){
  try{ return JSON.parse(localStorage.getItem(AUTOSHOW_POS_KEY)||'{}'); }catch(e){ return {}; }
}
function applyPosOverrides(models){
  const o=posOverrides();
  models.forEach(m=>{ if(o[m.name]){ m.x=o[m.name][0]; m.y=o[m.name][1]; m.posUser=true; } });
}
function savePosOverride(m){
  const o=posOverrides();
  o[m.name]=[m.x, m.y];
  try{ localStorage.setItem(AUTOSHOW_POS_KEY, JSON.stringify(o)); }catch(e){}
}
function clearSavedPositions(){
  try{ localStorage.removeItem(AUTOSHOW_POS_KEY); }catch(e){}
  alert('Saved positions cleared — reload the layout file to restore its original placement.');
}

/* ================= saved per-prop scale & rotation =================
   The layout file's world sizes aren't always right (mega trees especially),
   so any prop can be resized (mouse wheel) and rotated (Shift+wheel) on the
   house canvas. Applied on top of the cached node offsets, persisted like
   dragged positions. */
const AUTOSHOW_XFORM_KEY='autoshow.xform.v1';
function xformOverrides(){
  try{ return JSON.parse(localStorage.getItem(AUTOSHOW_XFORM_KEY)||'{}'); }catch(e){ return {}; }
}
function applyXformOverrides(models){
  const o=xformOverrides();
  models.forEach(m=>{ if(o[m.name]){ m.userScale=o[m.name].s||1; m.userRot=o[m.name].r||0; m.userScaleY=o[m.name].sy||1; } });
}
function saveXformOverride(m){
  const o=xformOverrides();
  o[m.name]={s:m.userScale||1, r:m.userRot||0, sy:m.userScaleY||1};
  try{ localStorage.setItem(AUTOSHOW_XFORM_KEY, JSON.stringify(o)); }catch(e){}
}
function clearSavedXforms(){
  try{ localStorage.removeItem(AUTOSHOW_XFORM_KEY); }catch(e){}
  (S.models||[]).forEach(m=>{ delete m.userScale; delete m.userRot; delete m.userScaleY; });
  if(S.models && S.models.length) drawHouse();
}
/* node offsets with the user's saved scale/rotation/vertical-stretch applied */
function modelNodesXf(m){
  const base=modelNodeOffsets(m);
  const sc=m.userScale||1, sy=m.userScaleY||1, rot=(m.userRot||0)*Math.PI/180;
  if(sc===1 && sy===1 && !rot) return base;
  const c=Math.cos(rot), s=Math.sin(rot);
  return base.map(([x,y])=>[(x*c - y*s)*sc, (x*s + y*c)*sc*sy]);
}

/* ================= model geometry ================= */
/* Pull the geometry attributes off the <model> element (called by parseLayout). */
function parseModelGeometry(n, m){
  const gf=a=>{ const v=parseFloat(n.getAttribute(a)); return isNaN(v)?null:v; };
  m.scaleX=Math.abs(gf('ScaleX')??1)||1;
  m.scaleY=Math.abs(gf('ScaleY')??1)||1;
  m.x2=gf('X2'); m.y2=gf('Y2');
  m.heightAttr=gf('Height');
  m.numPoints=parseInt(n.getAttribute('NumPoints')||'0')||0;
  m.pointData=n.getAttribute('PointData')||'';
  m.customW=parseInt(n.getAttribute('CustomWidth')||'0')||0;
  m.customH=parseInt(n.getAttribute('CustomHeight')||'0')||0;
  m.layerSizes=n.getAttribute('LayerSizes')||'';
  m.dropPattern=(n.getAttribute('DropPattern')||'').split(',').map(x=>parseInt(x)).filter(x=>x>0);
  m.treeRatio=gf('TreeBottomTopRatio')||6;
  m.spn=parseInt(n.getAttribute('StrandsPerString')||'0')||1;
  // custom pixel grid — both storage styles
  const cmc=n.getAttribute('CustomModelCompressed')||'';
  const cm=n.getAttribute('CustomModel')||'';
  if(cmc){
    m.customPts=cmc.split(';').map(t=>t.split(',')).filter(t=>t.length>=3)
                   .map(t=>[+t[2],+t[1]]).filter(p=>!isNaN(p[0])&&!isNaN(p[1]));
    // node-number → [col,row]: customPts follows string order and gets capped,
    // so node-range faces need their own exact index
    m.customNodes={};
    cmc.split(';').forEach(t=>{ const a=t.split(','); const nn=+a[0],r=+a[1],c=+a[2];
      if(a.length>=3 && !isNaN(nn)&&!isNaN(r)&&!isNaN(c)) m.customNodes[nn]=[c,r]; });
  } else if(cm && m.customW){
    m.customPts=[]; m.customNodes={};
    cm.split(';').forEach((row,r)=>row.split(',').forEach((cell,c)=>{
      if(cell!==''){ m.customPts.push([c,r]); if(!isNaN(+cell)) m.customNodes[+cell]=[c,r]; } }));
  }
  if(m.customPts && !m.customPts.length) delete m.customPts;
  m.nodeCount=(m.customPts&&m.customPts.length)||((m.parm1||0)*(m.parm2||0))||0;
  // node-range face definitions (singing bulbs, coro faces): which nodes are
  // the outline, eyes, and each viseme mouth — lets the previews light the
  // prop's real pixels instead of a stand-in cartoon
  const rng=s=>{ const out=[];
    (s||'').split(',').forEach(p=>{ p=p.trim(); if(!p) return;
      const mm=p.split('-'), a=+mm[0], b=+(mm[1]??mm[0]);
      if(isNaN(a)||isNaN(b)) return;
      for(let k=Math.min(a,b);k<=Math.max(a,b);k++) out.push(k); });
    return out; };
  const fi=n.querySelector('faceInfo');
  if(fi && /noderange/i.test(fi.getAttribute('Type')||'')){
    const g=a=>rng(fi.getAttribute(a));
    m.faceParts={ outline:[...g('FaceOutline'),...g('FaceOutline2')],
                  eyesOpen:g('Eyes-Open'), eyesClosed:g('Eyes-Closed'), mouths:{} };
    ['AI','E','O','U','FV','L','MBP','WQ','etc','rest'].forEach(v=>m.faceParts.mouths[v]=g('Mouth-'+v));
  }
  // submodel node ranges (type="ranges", one line* attribute per row) — the
  // export targets these to light only part of a model (e.g. a face outline)
  m.submodelRanges={};
  n.querySelectorAll('subModel').forEach(sm=>{
    if(!/ranges/i.test(sm.getAttribute('type')||'')) return;
    const nodes=[];
    for(const at of sm.attributes) if(/^line\d+$/i.test(at.name)) nodes.push(...rng(at.value));
    if(nodes.length) m.submodelRanges[sm.getAttribute('name')||'']=nodes;
  });
}

/* Submodels that sit entirely inside the face outline — the export writes the
   outline's string effects onto these (xLights has no direct node targeting).
   A face qualifies for outline effects only when at least one exists. */
function outlineSubmodelsFor(m){
  if(!(m.faceParts && m.faceParts.outline && m.faceParts.outline.length && m.submodelRanges)) return [];
  const out=new Set(m.faceParts.outline);
  return Object.entries(m.submodelRanges)
    .filter(([,nodes])=>nodes.length && nodes.every(nn=>out.has(nn)))
    .map(([name])=>name);
}

/* Draw a node-range face as the prop's real nodes — unlit board, outline,
   eyes (with idle blinks), and the current viseme's mouth — fitted to a box
   of height boxH centered on (cx,cy). Returns false if this model can't. */
function drawNodeFace(ctx,m,cx,cy,boxH,vis,col,tSec){
  if(!(m.faceParts && m.customNodes)) return false;
  const ns=Object.entries(m.customNodes); if(!ns.length) return false;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  ns.forEach(([,p])=>{ x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]); });
  const sc=Math.min(boxH/(y1-y0+1), boxH*1.15/(x1-x0+1));
  const rDot=Math.max(1.1, sc*0.55);
  const dot=(nn,c,r)=>{ const p=m.customNodes[nn]; if(!p) return;
    ctx.fillStyle=c; ctx.beginPath();
    ctx.arc(cx+(p[0]-(x0+x1)/2)*sc, cy+(p[1]-(y0+y1)/2)*sc, r, 0, 7); ctx.fill(); };
  ns.forEach(([nn])=>dot(+nn,'#151B3F',rDot));
  m.faceParts.outline.forEach(nn=>dot(nn,col,rDot));
  const phase=(typeof hashF==='function'?hashF(m.name,7):0)*3.8;   // per-face blink offset
  const blink=(((tSec||0)+phase)%3.8)<0.18 && m.faceParts.eyesClosed.length;
  (blink?m.faceParts.eyesClosed:m.faceParts.eyesOpen).forEach(nn=>dot(nn,'#E9ECFA',rDot));
  const mouth=(m.faceParts.mouths[vis]&&m.faceParts.mouths[vis].length)?m.faceParts.mouths[vis]:m.faceParts.mouths.rest;
  (mouth||[]).forEach(nn=>dot(nn,'#FFF3B0',rDot*1.15));
  return true;
}

/* Node offsets from the model anchor, world units, +y up. Cached. */
function modelNodeOffsets(m){
  if(m._nodes) return m._nodes;
  const out=[];
  const cap=(arr,n)=>{ if(arr.length<=n) return arr; const step=arr.length/n; const o=[]; for(let i=0;i<arr.length;i+=step) o.push(arr[Math.floor(i)]); return o; };
  const lineDots=(pts,per)=>{ // dots along a polyline given [x,y] vertices
    for(let i=0;i<pts.length-1;i++){
      const [ax,ay]=pts[i],[bx,by]=pts[i+1];
      const len=Math.hypot(bx-ax,by-ay), n=Math.max(2,Math.round(len/per));
      for(let k=0;k<=n;k++) out.push([ax+(bx-ax)*k/n, ay+(by-ay)*k/n]);
    }
  };
  const da=m.displayAs||'';
  // ----- floods & wall washers: each head is a POOL of light, not an outline —
  // the role wins over the geometry branches (the user's washers are Poly
  // Lines whose few nodes are fixture heads, not a string of pixels) -----
  if(m.role==='Flood'){
    m._big=true;
    if(m.pointData && m.numPoints>1){
      const v=m.pointData.split(',').map(parseFloat);
      for(let i=0;i+2<v.length && out.length<m.numPoints;i+=3)
        if(!isNaN(v[i])&&!isNaN(v[i+1])) out.push([v[i]*m.scaleX, v[i+1]*m.scaleY]);
    } else if(m.x2!=null && (Math.abs(m.x2)+Math.abs(m.y2||0))>0.01){
      const heads=Math.max(2, Math.min(12, m.parm1||m.numPoints||4));
      for(let k=0;k<heads;k++) out.push([m.x2*k/(heads-1), (m.y2||0)*k/(heads-1)]);
    }
    if(!out.length) out.push([0,0]);
    m._nodes=cap(out,16); return m._nodes;
  }
  // ----- custom pixel grids: the exact layout, xLights-style -----
  if(m.customPts && m.customW && m.customH){
    const w=m.customW*m.scaleX, h=m.customH*m.scaleY;
    const toXY=([c,r])=>[(c+0.5)/m.customW*w-w/2, h/2-(r+0.5)/m.customH*h];
    if(m.faceParts && m.customNodes){
      // node-range faces address pixels by node NUMBER: _nodes[i] must be
      // node i+1, uncapped, so drawHouse can light the face parts in place
      const max=Math.max(...Object.keys(m.customNodes).map(Number));
      for(let nn=1;nn<=max;nn++) out.push(m.customNodes[nn]?toXY(m.customNodes[nn]):[0,0]);
      m._nodes=out; return m._nodes;
    }
    m.customPts.forEach(p=>out.push(toXY(p)));
    m._nodes=cap(out,240); return m._nodes;
  }
  // ----- poly lines: actual point data -----
  if(m.pointData && m.numPoints>1){
    const v=m.pointData.split(',').map(parseFloat);
    const pts=[];
    for(let i=0;i+2<v.length && pts.length<m.numPoints;i+=3)
      if(!isNaN(v[i])&&!isNaN(v[i+1])) pts.push([v[i]*m.scaleX, v[i+1]*m.scaleY]);
    if(pts.length>1){
      let span=0; for(let i=0;i<pts.length-1;i++) span+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);
      lineDots(pts, Math.max(4, span/110));
      m._nodes=cap(out,130); return m._nodes;
    }
  }
  // ----- two-point spans: lines, arches, icicles -----
  if(m.x2!=null && (Math.abs(m.x2)+Math.abs(m.y2||0))>0.01){
    const ex=m.x2, ey=m.y2||0, span=Math.hypot(ex,ey);
    if(da==='Arches'){
      const count=Math.max(1, Math.min(8, m.parm1||1));
      const aw=span/count, ah=aw*0.5*Math.min(2, Math.abs(m.heightAttr||1));
      for(let a=0;a<count;a++){
        const cx=(a+0.5)*aw*(ex/span), cy=(a+0.5)*aw*(ey/span);
        for(let k=0;k<=14;k++){
          const th=Math.PI-k/14*Math.PI;
          out.push([cx+Math.cos(th)*aw*0.44, cy+Math.sin(th)*ah]);
        }
      }
    } else if(da==='Icicles'){
      // real drop layout: DropPattern gives nodes per drop ("5" → uniform
      // 5-node spikes; "3,4,5" → repeating), node count sets how many drops.
      // Forest-role rows (ground forests modeled as Icicles) spike UP from
      // the baseline — stakes in the yard — instead of hanging down.
      const pat=(m.dropPattern&&m.dropPattern.length)?m.dropPattern:[3,5,4,6,3,5];
      const per=pat.reduce((a,b)=>a+b,0)/pat.length;
      const nDrop=Math.max(4, Math.min(40, m.nodeCount?Math.round(m.nodeCount/per):Math.round(span/18)));
      const up=m.role==='Forest'?1:-1;
      const maxPat=Math.max(...pat);
      // forests get a full-height floor — layouts often carry tiny Height
      // attrs that squashed the spikes into unreadable dashes
      const hm=Math.min(2, Math.abs(m.heightAttr||0.8)/0.8);
      const dl=Math.min(span*0.12, 34)*(m.role==='Forest'?Math.max(1,hm):hm);
      for(let k=0;k<=nDrop;k++){
        const bx=ex*k/nDrop, by=ey*k/nDrop;
        out.push([bx,by]);
        const nn=pat[k%pat.length];
        const L=dl*(nn/maxPat), dots=Math.min(6,nn);
        for(let d=1;d<=dots;d++) out.push([bx, by+up*L*d/dots]);
      }
    } else {
      lineDots([[0,0],[ex,ey]], Math.max(4, span/70));
    }
    m._nodes=cap(out,130); return m._nodes;
  }
  // ----- boxed models: size = scale × native buffer size -----
  const p1=m.parm1||0, p2=m.parm2||0, spn=m.spn||1;
  let w=m.scaleX, h=m.scaleY;
  if(da==='Tree'||da.startsWith('Tree ')){
    const bw=Math.max(2,(p1||2)*spn), bh=Math.max(4,(p2||50)/spn);
    w*=bw; h*=bh;
    const rows=Math.min(16, Math.max(6, Math.round(bh/4)));
    const ratio=Math.max(1.5, m.treeRatio||6);
    for(let r=0;r<rows;r++){
      const yy=-h/2+(r+0.5)/rows*h;
      const ww=w*(1-(r/rows)*(1-1/ratio))*0.5;
      const cols=Math.max(2, Math.round(10*(1-r/rows)+2));
      for(let c=0;c<cols;c++) out.push([-ww+2*ww*c/Math.max(1,cols-1), yy]);
    }
  } else if(da==='Matrix'){
    let bw, bh;
    if(p1<=1 && spn>1){ bw=(p2||100)/spn; bh=spn; }
    else { bw=p2||32; bh=p1||16; }
    w*=bw; h*=bh;
    const rows=Math.min(11,Math.max(4,Math.round(bh/6))), cols=Math.min(20,Math.max(6,Math.round(bw/5)));
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++)
      out.push([-w/2+(c+0.5)/cols*w, -h/2+(r+0.5)/rows*h]);
  } else if(da==='Star'){
    const base=Math.max(8, Math.sqrt(Math.max(4,p1*p2||p2||16))*3);
    w*=base; h*=base;
    const rings=(m.layerSizes||'').split(',').filter(x=>x.trim()).length||1;
    for(let ring=0;ring<rings;ring++){
      const R=(0.35+0.65*(rings-ring)/rings)/2;
      const pts=Math.max(10, 20-ring*4);
      for(let k=0;k<pts;k++){
        const a=k/pts*Math.PI*2-Math.PI/2;
        const rr=(k%2?0.45:1)*R;
        out.push([Math.cos(a)*rr*w, Math.sin(a)*rr*h]);
      }
    }
  } else if(da==='Window Frame'){
    w*=20; h*=20;
    const nx=8, ny=6;
    for(let c=0;c<=nx;c++){ out.push([-w/2+c/nx*w, h/2]); out.push([-w/2+c/nx*w, -h/2]); }
    for(let r=1;r<ny;r++){ out.push([-w/2, -h/2+r/ny*h]); out.push([w/2, -h/2+r/ny*h]); }
  } else if(da==='Sphere'||da==='Spinner'||m.role==='Spinner/Wreath'){
    const base=Math.max(10, Math.sqrt(Math.max(9,p1*p2||16))*3); w*=base; h*=base;
    for(let k=0;k<16;k++){ const a=k/16*Math.PI*2; out.push([Math.cos(a)*w/2, Math.sin(a)*h/2]); }
  } else {
    // Image props, DMX, generic boxed: scale IS roughly the world size
    w=Math.max(6,w); h=Math.max(6,h);
    const n=Math.min(14, Math.max(6, Math.round((w+h)/22)));
    for(let k=0;k<n;k++){ const a=k/n*Math.PI*2; out.push([Math.cos(a)*w/2, Math.sin(a)*h/2]); }
  }
  m._nodes=cap(out,160);
  return m._nodes;
}
/* world-extent of a model (anchor + node offsets) for fitting the canvas */
function modelExtent(m){
  const nodes=modelNodesXf(m);
  let minX=0,maxX=0,minY=0,maxY=0;
  nodes.forEach(([dx,dy])=>{ if(dx<minX)minX=dx; if(dx>maxX)maxX=dx; if(dy<minY)minY=dy; if(dy>maxY)maxY=dy; });
  return {minX:m.x+minX, maxX:m.x+maxX, minY:m.y+minY, maxY:m.y+maxY};
}

/* ================= drawing ================= */
/* Per-node brightness/color animation by effect kind — this is what makes a
   chase visibly TRAVEL along a prop's own pixels like the xLights preview. */
function nodeFx(m, idx, n, base){
  const fx=S._fx && S._fx[m.name];
  if(!fx || !S.sequence) return 1;
  const t=S._prevT||0;
  const beat=t*((S.analysis&&S.analysis.bpm)||120)/60;
  let b=1;
  switch(fx.eff){
    case 'SingleStrand': case 'Marquee': case 'Garlands':
      b=0.18+0.82*Math.max(0, Math.cos((idx/Math.max(1,n) - beat*0.5)*Math.PI*2))**3; break;
    case 'Bars':
      b=((Math.floor(idx/Math.max(1,n)*4)+Math.floor(beat*2))%2)?1:0.25; break;
    case 'Meteors': case 'Snowflakes':
      b=0.25+0.75*hashF(m.name+idx,Math.floor(t*9)); break;
    case 'Twinkle':
      b=0.35+0.65*(hashF(m.name+idx,Math.floor(t*5))>0.5?1:0.3); break;
    case 'Fire':
      b=0.35+0.65*hashF(m.name+idx,Math.floor(t*11)); break;
    case 'Spirals': case 'Butterfly': case 'Pinwheel':
      b=0.35+0.65*Math.max(0,Math.sin((idx/Math.max(1,n)*3+beat)*Math.PI))**2; break;
    case 'Shockwave':
      b=0.3+0.7*Math.max(0, 1-Math.abs(idx/Math.max(1,n)-(fx.prog||0))*3); break;
    case 'Wave':      // traveling sine — forests undulate up and down
      b=0.2+0.8*Math.max(0, Math.sin((idx/Math.max(1,n)*2 - beat*0.4)*Math.PI*2))**1.5; break;
    case 'Tendril': { // a wandering trail snaking through the prop
      const p=0.5+0.45*Math.sin(beat*0.9+hashF(m.name,3)*6);
      b=0.15+0.85*Math.max(0, 1-Math.abs(idx/Math.max(1,n)-p)*5); break; }
    case 'Curtain': { // opens outward from center, then closes
      const pr=fx.prog||0, op=pr<0.5?pr*2:(1-pr)*2;
      b=Math.abs(idx/Math.max(1,n)-0.5)*2 < op ? 1 : 0.12; break; }
  }
  if(fx.sparkle && hashF(m.name+'*'+idx, Math.floor(t*13))>0.94) return -1; // white pop
  return b;
}
/* Node-number lookup Sets for a node-range face's parts, cached per model. */
function facePartSets(m){
  if(m._partSets!==undefined) return m._partSets;
  const fp=m.faceParts;
  if(!fp){ m._partSets=null; return null; }
  m._partSets={ outline:new Set(fp.outline), eyesO:new Set(fp.eyesOpen), eyesC:new Set(fp.eyesClosed),
    mouths:Object.fromEntries(Object.entries(fp.mouths).map(([k,v])=>[k,new Set(v)])),
    // ordered outline position (FaceOutline then FaceOutline2 ≈ string order),
    // so gap-time string effects can travel along the outline
    outlineOrder:new Map(fp.outline.map((nn,i)=>[nn,i])), outlineN:fp.outline.length };
  return m._partSets;
}
/* String-effect color for one outline node while its face is between lines —
   the same traveling/twinkle math as nodeFx, over the outline's own order. */
function outlineFxColor(ps, oi, ff){
  const t=S._prevT||0;
  const beat=t*((S.analysis&&S.analysis.bpm)||120)/60;
  const n=Math.max(1, ps.outlineN);
  let b=1;
  switch(ff.eff){
    case 'SingleStrand': case 'Marquee':
      b=0.15+0.85*Math.max(0, Math.cos((oi/n - beat*0.5)*Math.PI*2))**3; break;
    case 'Twinkle':
      b=0.3+0.7*(hashF('ol'+oi, Math.floor(t*5))>0.5?1:0.25); break;
    case 'On': {  // fade ramp from the settings' start/end brightness
      const gs=k=>{ const mm=new RegExp(k+'=(\\d+)').exec(ff.settings||''); return mm?+mm[1]/100:1; };
      b=gs('E_TEXTCTRL_Eff_On_Start')+(gs('E_TEXTCTRL_Eff_On_End')-gs('E_TEXTCTRL_Eff_On_Start'))*(ff.prog||0);
      break; }
  }
  const pal=ff.pal&&ff.pal.length?ff.pal:['#FFD27A'];
  return shade(pal[oi%pal.length], Math.max(0, Math.min(1, b)));
}
/* Per-node color for a singing node-range face: outline in the singer's
   color, eyes white (closed set while blinking), the current viseme's mouth
   nodes bright, everything else the unlit board. */
function faceNodeColor(ps, nn, ff){
  if(ff.gap){  // between lines: outline runs a string effect, the face stays dark
    const oi=ps.outlineOrder.get(nn);
    return oi===undefined ? '#151B3F' : outlineFxColor(ps, oi, ff);
  }
  if(ps.outline.has(nn)) return ff.col;
  if((ff.blink&&ps.eyesC.size?ps.eyesC:ps.eyesO).has(nn)) return '#E9ECFA';
  const mouth=(ps.mouths[ff.vis]&&ps.mouths[ff.vis].size)?ps.mouths[ff.vis]:ps.mouths.rest;
  if(mouth&&mouth.has(nn)) return '#FFF3B0';
  return '#151B3F';
}
function luminanceOf(hex){
  const v=parseInt((hex||'#000').slice(1),16);
  return (0.35*((v>>16)&255)+0.5*((v>>8)&255)+0.15*(v&255))/255;
}
let houseXform=null;   // last house-canvas transform, for hover + drag
let housePts=[];
function drawHouse(canvasId='houseCanvas', litColors=null){
  const c=document.getElementById(canvasId); if(!c) return null;
  const W=c.width=c.offsetWidth;
  const H=c.height = canvasId==='previewCanvas'
    ? Math.max(380, Math.min(860, window.innerHeight-330))
    : Math.max(340, Math.min(600, Math.round(W*0.4)));
  const gs=Math.max(1, Math.min(2.1, W/760));
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const placed=S.models.filter(m=>m.role!=='Skip');
  const hasPos=placed.filter(m=>!isNaN(m.x)&&!isNaN(m.y));
  let get, s=1, houseExt=null;   // whole-layout extent, for house-wide sampling
  if(hasPos.length>=placed.length*0.5 && hasPos.length>1){
    let minX=1e12,maxX=-1e12,minY=1e12,maxY=-1e12;
    hasPos.forEach(m=>{ const e=modelExtent(m);
      minX=Math.min(minX,e.minX); maxX=Math.max(maxX,e.maxX);
      minY=Math.min(minY,e.minY); maxY=Math.max(maxY,e.maxY); });
    houseExt={minX,maxX,minY,maxY};
    const pad=26*gs, padB=canvasId==='previewCanvas'?Math.max(118,60*gs):30*gs;
    s=Math.min((W-2*pad)/Math.max(1,maxX-minX), (H-pad-padB)/Math.max(1,maxY-minY));
    get=m=>isNaN(m.x)?null:[pad+(m.x-minX)*s, H-padB-(m.y-minY)*s];
    if(canvasId==='houseCanvas') houseXform={minX,minY,s,pad,padB,H};
  } else {
    const cols=Math.ceil(Math.sqrt(placed.length));
    get=m=>{ const i=placed.indexOf(m); return [60+(i%cols)*((W-120)/Math.max(1,cols-1)), 60+Math.floor(i/cols)*((H-120)/Math.max(1,Math.ceil(placed.length/cols)-1||1))]; };
    s=1;
    if(canvasId==='houseCanvas') houseXform=null;
  }
  const ptsOut=[];
  const dotR=Math.max(1, Math.min(3, 1.1*gs));
  placed.forEach(m=>{
    const p=get(m); if(!p) return;
    ptsOut.push({m, x:p[0], y:p[1]});
    let col=(litColors && litColors[m.name]) || ROLE_COLOR[m.role] || '#6B76B8';
    const isLit=!litColors || (litColors[m.name] && litColors[m.name]!=='#10152E');
    // single-color strings can only show their own color, at the plan's brightness
    if(m.chan==='single' && m.fixedColor){
      col=shade(m.fixedColor, litColors ? Math.max(0.08, Math.pow(luminanceOf(col),0.55)) : 0.8);
    }
    const nodes=modelNodesXf(m);
    const n=nodes.length;
    // soft glow pass for lit models: an ELLIPSE hugging the prop's real extent
    // (a circle sized by the widest dimension gave wide flat props — forests,
    // rooflines — a giant dome of light). Forests skip it entirely so their
    // ground pixels stay crisp.
    if(litColors && isLit && !m._big && m.role!=='Forest'){
      const e=modelExtent(m);
      const gx=p[0]+((e.minX+e.maxX)/2-m.x)*s, gy=p[1]-((e.minY+e.maxY)/2-m.y)*s;
      const rx=Math.max(8,(e.maxX-e.minX)*s*0.6), ry=Math.max(8,(e.maxY-e.minY)*s*0.75);
      ctx.save(); ctx.translate(gx,gy); ctx.scale(rx,ry);
      const g=ctx.createRadialGradient(0,0,0.1,0,0,1);
      g.addColorStop(0,col+'26'); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.fillRect(-1,-1,2,2);
      ctx.restore();
    }
    if(m._big){ // floods & wall washers: a soft pool of light at every head
      const R=(n>1?13:16)*gs;
      nodes.forEach(([dx,dy],i)=>{
        let cc=col, b=1;
        if(litColors && isLit){ b=nodeFx(m,i,n,col); if(b<0){ cc='#FFFFFF'; b=1; } }
        const px=p[0]+dx*s, py=p[1]-dy*s;
        ctx.globalAlpha=(litColors ? (isLit?0.8:0.3) : 0.6)*(0.45+0.55*b);
        const g=ctx.createRadialGradient(px,py,1,px,py,R);
        g.addColorStop(0,cc); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,R,0,7); ctx.fill();
      });
      ctx.globalAlpha=1;
    } else {
      // node-range singing faces render their parts on the prop's own pixels
      const ff=litColors && m.faceParts && m.customNodes && S._faceFx && S._faceFx[m.name];
      const ps=ff?facePartSets(m):null;
      // screens running shaders/karaoke sample their rendered frame by node
      // position, so the matrix shows the real graphics at its real size
      const sfx=litColors && S._screenFx && S._screenFx[m.name];
      let sE=null,sSpanX=1,sSpanY=1;
      if(sfx){ sE=(sfx.global&&houseExt)?houseExt:modelExtent(m);
               sSpanX=Math.max(1e-6,sE.maxX-sE.minX); sSpanY=Math.max(1e-6,sE.maxY-sE.minY); }
      nodes.forEach(([dx,dy],i)=>{
        let cc=col, b=1;
        if(sfx){
          const u=Math.min(1,Math.max(0,(m.x+dx-sE.minX)/sSpanX));
          const v=Math.min(1,Math.max(0,(m.y+dy-sE.minY)/sSpanY));
          const ix=Math.min(sfx.w-1,Math.round(u*(sfx.w-1)));
          const iy=Math.min(sfx.h-1,Math.round((sfx.flipY?v:(1-v))*(sfx.h-1)));
          const k=(iy*sfx.w+ix)*4;
          cc=`rgb(${sfx.data[k]},${sfx.data[k+1]},${sfx.data[k+2]})`;
        }
        else if(ps) cc=faceNodeColor(ps,i+1,ff);
        else if(litColors && isLit){ b=nodeFx(m,i,n,col); if(b<0){ cc='#FFFFFF'; b=1; } }
        ctx.globalAlpha=(litColors ? (isLit?0.75+0.25*b:0.5) : 0.9);
        ctx.fillStyle=b<1?shade(cc,0.5+0.5*b):cc;
        const px=p[0]+dx*s, py=p[1]-dy*s;
        ctx.fillRect(px-dotR, py-dotR, dotR*2, dotR*2);
      });
      ctx.globalAlpha=1;
    }
    // labels only where they help: the hovered / dragged model
    if(canvasId==='houseCanvas' && S._hoverName===m.name){
      ctx.globalAlpha=0.95; ctx.fillStyle='#E9ECFA';
      ctx.font=Math.round(11*Math.min(gs,1.5))+'px JetBrains Mono'; ctx.textAlign='center';
      const e=modelExtent(m);
      ctx.fillText(m.name, p[0], p[1]-(e.maxY-m.y)*s-6);
      ctx.globalAlpha=1;
    }
  });
  if(canvasId==='houseCanvas') housePts=ptsOut;
  else { S._prevPts=ptsOut; S._prevScale=s; }   // scale: overlays match prop footprints
  return get;
}

/* ---------- hover + drag props on the house canvas ---------- */
function houseHit(c, e){
  const r=c.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  let best=null, bd=26*26;
  housePts.forEach(pt=>{ const d=(pt.x-mx)**2+(pt.y-my)**2; if(d<bd){bd=d;best=pt;} });
  return {best, mx, my};
}
function wireHouseCanvas(){
  const c=document.getElementById('houseCanvas'); if(!c||c._wired) return;
  c._wired=true;
  let drag=null;
  c.addEventListener('mousedown', e=>{
    const {best}=houseHit(c,e);
    if(best && houseXform){ drag=best; }
  });
  window.addEventListener('mousemove', e=>{
    if(drag && houseXform){
      const r=c.getBoundingClientRect();
      const {minX,minY,s,pad,padB,H}=houseXform;
      drag.m.x=(e.clientX-r.left-pad)/s+minX;
      drag.m.y=(H-padB-(e.clientY-r.top))/s+minY;
      S._hoverName=drag.m.name;
      drawHouse();
      return;
    }
    if(e.target!==c) return;
    const {best}=houseHit(c,e);
    const name=best?best.m.name:null;
    if(name!==S._hoverName){ S._hoverName=name; drawHouse(); }
    c.title=best?`${best.m.name} — ${best.m.role} (${best.m.conf||''}) · drag to move · wheel to resize · shift+wheel to rotate · alt+wheel taller/shorter`:'';
    c.style.cursor=best?'grab':'default';
  });
  window.addEventListener('mouseup', ()=>{
    if(drag){ savePosOverride(drag.m); drag=null; }
  });
  // wheel = resize the hovered prop, Shift+wheel = rotate, Alt+wheel = taller/
  // shorter (vertical stretch — lets flat forests grow readable spikes). Saved.
  c.addEventListener('wheel', e=>{
    const {best}=houseHit(c,e);
    if(!best) return;               // not over a prop — let the page scroll
    e.preventDefault();
    const m=best.m;
    const d=(e.deltaY||e.deltaX)>0?1:-1;   // shift+wheel reports deltaX on many mice
    if(e.shiftKey){
      m.userRot=((((m.userRot||0) - d*5) % 360) + 360) % 360;
    } else if(e.altKey){
      m.userScaleY=Math.max(0.2, Math.min(8, (m.userScaleY||1)*(d>0?1/1.07:1.07)));
    } else {
      m.userScale=Math.max(0.2, Math.min(8, (m.userScale||1)*(d>0?1/1.07:1.07)));
    }
    saveXformOverride(m);
    S._hoverName=m.name;
    drawHouse();
  }, {passive:false});
}
/* hover tooltips on the live preview too (no drag there) */
function wirePreviewHover(){
  const c=document.getElementById('previewCanvas'); if(!c||c._wired) return;
  c._wired=true;
  c.addEventListener('mousemove', e=>{
    if(!S.models.length || !S.analysis) return;
    // project on demand: reuse the last house transform shape via a fresh get
    const r=c.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    let best=null, bd=30*30;
    (S._prevPts||[]).forEach(pt=>{ const d=(pt.x-mx)**2+(pt.y-my)**2; if(d<bd){bd=d;best=pt;} });
    c.title=best?`${best.m.name} — ${best.m.role}`:'';
  });
}
