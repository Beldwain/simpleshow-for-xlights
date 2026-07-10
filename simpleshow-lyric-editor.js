/* SimpleShow — lyric review & editing (supporting file).
   Must sit next to simpleshow-xlights.html; loaded with a plain <script src>.

   Automatic lyric timing won't be perfect, so after generating the show the
   user reviews it on step 5: drag lines along a timeline, nudge them by
   50 ms, split a line apart at any word, reassign which face sings it, and
   pick the face color for that line. Edits live in an editable "lyric doc"
   that REPLACES the automatic layout in buildLyrics, and persist in
   localStorage per song (audio name + duration), so regenerating the show —
   any number of times, any seed — reuses the corrected timing.

   Uses globals from the main file at runtime: S, esc, fmt, buildLyrics,
   generateShow, drawPreviewFrame, renderLyricEditor hooks. */

const AUTOSHOW_LYRICDOC_PREFIX = 'autoshow.lyricdoc.v1.';

/* stable per-face colors — casting is color-coded everywhere */
const FACE_HUES = ['#FF4D5E','#4DA6FF','#3BE07C','#FFC94D','#B84DFF','#FF9F4D','#7FD9FF','#FF8FA3'];
function faceColorOf(name){
  const faces = S.models.filter(m=>m.role==='Singing Face').map(m=>m.name);
  const i = faces.indexOf(name);
  return FACE_HUES[(i<0?0:i)%FACE_HUES.length];
}
function lineColorOf(l){
  if(l.color) return l.color;
  return l.faces && l.faces.length===1 ? faceColorOf(l.faces[0]) : '#FF4D5E';
}

/* ---------- the lyric doc ---------- */
function lyricSongKey(){
  return S.audio ? (S.audio.name+'|'+Math.round(S.audio.duration)) : null;
}
function saveLyricDoc(){
  if(!S.lyricDoc || !lyricSongKey()) return;
  try{ localStorage.setItem(AUTOSHOW_LYRICDOC_PREFIX+lyricSongKey(), JSON.stringify(S.lyricDoc)); }catch(e){}
}
function loadLyricDoc(){
  const key=lyricSongKey(); if(!key) return null;
  try{
    const d=JSON.parse(localStorage.getItem(AUTOSHOW_LYRICDOC_PREFIX+key)||'null');
    if(d && Array.isArray(d.lines)) return d;
  }catch(e){}
  return null;
}
/* the doc only applies while the step-3 lyric text it was built from is
   unchanged — retyping the lyrics goes back to automatic layout */
function activeLyricDoc(raw){
  if(!S.lyricDoc) S.lyricDoc=loadLyricDoc();
  if(S.lyricDoc && S.lyricDoc.raw===raw && S.lyricDoc.songKey===lyricSongKey()) return S.lyricDoc;
  return null;
}
/* first edit snapshots the current automatic layout into an editable doc */
function ensureLyricDoc(){
  const raw=document.getElementById('lyricsBox').value.trim();
  const doc=activeLyricDoc(raw);
  if(doc) return doc;
  S.lyricDoc={ songKey:lyricSongKey(), raw,
    lines: JSON.parse(JSON.stringify((S.lyrics&&S.lyrics.lines)||[])) };
  saveLyricDoc();
  return S.lyricDoc;
}
function resetLyricEdits(){
  const key=lyricSongKey();
  if(key){ try{ localStorage.removeItem(AUTOSHOW_LYRICDOC_PREFIX+key); }catch(e){} }
  S.lyricDoc=null;
  lyricEditSel=-1;
  rebuildFromDoc();
}

/* ---------- edit operations (all shift word & phoneme times too) ---------- */
function shiftLine(l, dt){
  l.start+=dt; l.end+=dt;
  l.words.forEach(w=>{ w.start+=dt; w.end+=dt; w.phones.forEach(p=>{ p.start+=dt; p.end+=dt; }); });
}
function moveDocLine(i, dt){
  const doc=ensureLyricDoc(); const l=doc.lines[i]; if(!l) return;
  dt=Math.max(-l.start, Math.min(S.audio.duration-l.end, dt));
  shiftLine(l, dt);
  saveLyricDoc(); rebuildFromDoc();
}
function splitDocLine(i, wordIdx){
  const doc=ensureLyricDoc(); const l=doc.lines[i];
  if(!l || wordIdx<=0 || wordIdx>=l.words.length) return;
  const w1=l.words.slice(0,wordIdx), w2=l.words.slice(wordIdx);
  const l2={ text:w2.map(w=>w.text).join(' '), start:w2[0].start, end:l.end,
             faces:[...l.faces], color:l.color, words:w2 };
  l.text=w1.map(w=>w.text).join(' ');
  l.end=w1[w1.length-1].end;
  l.words=w1;
  doc.lines.splice(i+1,0,l2);
  lyricEditSel=i+1;
  saveLyricDoc(); rebuildFromDoc();
}
function setDocLineVoice(i, val){
  const doc=ensureLyricDoc(); const l=doc.lines[i]; if(!l) return;
  const faces=S.models.filter(m=>m.role==='Singing Face').map(m=>m.name);
  l.faces = val==='ALL' ? [...faces] : [val];
  l.color = null;   // voice change resets to that voice's color
  saveLyricDoc(); rebuildFromDoc();
}
function setDocLineColor(i, color){
  const doc=ensureLyricDoc(); const l=doc.lines[i]; if(!l) return;
  l.color=color;
  saveLyricDoc(); rebuildFromDoc();
}
/* contract / expand a line's timing: scale the segment around its start so
   the words & phonemes squeeze into less time or stretch into more */
function scaleDocLine(i, f){
  const doc=ensureLyricDoc(); const l=doc.lines[i]; if(!l) return;
  const dur=l.end-l.start; if(dur<=0) return;
  const nd=Math.max(0.3, Math.min(dur*f, S.audio.duration-l.start));
  const k=nd/dur, sc=t=>l.start+(t-l.start)*k;
  l.words.forEach(w=>{ w.start=sc(w.start); w.end=sc(w.end);
    w.phones.forEach(p=>{ p.start=sc(p.start); p.end=sc(p.end); }); });
  l.end=l.start+nd;
  saveLyricDoc(); rebuildFromDoc();
}
/* rebuild lyrics from the doc, re-generate the plan with the SAME seed so
   Faces effects follow the edit, refresh the editor + preview frame */
function rebuildFromDoc(){
  if(!S.analysis) return;
  buildLyrics();
  if(S.sequence) generateShow();
  renderLyricEditor();
  const p=document.getElementById('player');
  if(p && !S.playing) drawPreviewFrame(p.currentTime||0);
}

/* ---------- character face images (xLights matrix-face sets) ----------
   Each singing face can carry a set of per-viseme PNGs named the way xLights
   matrix faces are shipped — "Name_AI_eo.png", "Name_rest_ec.png",
   "Tom Cruise MBP-EO.png" — dropped onto the face's chip below the faces
   preview. Images are downscaled and stored per model in localStorage, so
   they come back on every visit; both the faces preview and the main live
   preview then render the character with its mouth matching the phoneme. */
const AUTOSHOW_FACEART_PREFIX='autoshow.faceart.v1.';
let faceArtCache={};
function faceArtFor(name){
  if(name in faceArtCache) return faceArtCache[name];
  let data=null;
  try{ data=JSON.parse(localStorage.getItem(AUTOSHOW_FACEART_PREFIX+name)||'null'); }catch(e){}
  if(!data){ faceArtCache[name]=null; return null; }
  const imgs={};
  Object.entries(data).forEach(([v,url])=>{ const im=new Image(); im.src=url; imgs[v]=im; });
  faceArtCache[name]=imgs;
  return imgs;
}
function faceArtImage(name, vis, tSec){
  const imgs=faceArtFor(name); if(!imgs) return null;
  let im=null;
  // while waiting, the character stays "alive": rest eyes-open with a short
  // eyes-closed blink every few seconds, phase-offset per face so the whole
  // cast doesn't blink in unison
  if(vis==='rest' && imgs.rest_ec){
    const t=tSec!=null ? tSec : (typeof performance!=='undefined'?performance.now():Date.now())/1000;
    const phase=(t + (typeof hashF==='function'?hashF(name,7)*3.8:0)) % 3.8;
    if(phase<0.18) im=imgs.rest_ec;
  }
  im=im||imgs[vis]||imgs.etc||imgs.rest||Object.values(imgs)[0];
  return (im && im.complete && im.naturalWidth) ? im : null;
}
function parseVisemeFilename(fname){
  const tokens=fname.replace(/\.[a-z0-9]+$/i,'').split(/[\s_-]+/);
  const map={AI:'AI',E:'E',O:'O',U:'U',FV:'FV',F:'FV',L:'L',MBP:'MBP',WQ:'WQ',ETC:'etc',ECT:'etc',REST:'rest'};
  let vis=null, eyes='eo';
  tokens.forEach(tk=>{
    const t=tk.toUpperCase();
    if(t==='EO'||t==='EC'){ eyes=t.toLowerCase(); return; }
    if(map[t]) vis=map[t];
  });
  return vis ? {vis, eyes} : null;
}
/* minimal ZIP reader — enough for face-art packs. Walks the central
   directory, extracts image entries (stored or deflate — inflated with the
   browser's own DecompressionStream), returns them as File objects. */
async function zipImageFiles(file){
  const buf=new Uint8Array(await file.arrayBuffer());
  const dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd=-1;   // end-of-central-directory, scanned back past any zip comment
  for(let i=buf.length-22;i>=Math.max(0,buf.length-22-65558);i--)
    if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; }
  if(eocd<0) return [];
  const count=dv.getUint16(eocd+10,true);
  let off=dv.getUint32(eocd+16,true);
  const out=[];
  for(let k=0;k<count && off+46<=buf.length;k++){
    if(dv.getUint32(off,true)!==0x02014b50) break;
    const method=dv.getUint16(off+10,true);
    const csize=dv.getUint32(off+20,true);
    const nlen=dv.getUint16(off+28,true), elen=dv.getUint16(off+30,true), clen=dv.getUint16(off+32,true);
    const lho=dv.getUint32(off+42,true);
    const name=new TextDecoder().decode(buf.subarray(off+46,off+46+nlen));
    off+=46+nlen+elen+clen;
    const base=name.split('/').pop();
    if(!base || name.endsWith('/') || !/\.(png|jpe?g|gif|webp)$/i.test(base)) continue;
    const lnlen=dv.getUint16(lho+26,true), lelen=dv.getUint16(lho+28,true);
    const start=lho+30+lnlen+lelen;
    const cdata=buf.subarray(start,start+csize);
    let data=null;
    if(method===0) data=cdata;
    else if(method===8){
      try{
        data=new Uint8Array(await new Response(
          new Blob([cdata]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      }catch(e){}
    }
    if(data) out.push(new File([data], base, {type:'image/png'}));
  }
  return out;
}
function downscaleImage(file, maxH){
  return new Promise(res=>{
    const rd=new FileReader();
    rd.onload=()=>{
      const im=new Image();
      im.onload=()=>{
        const h=Math.min(maxH, im.naturalHeight), w=Math.round(im.naturalWidth*h/im.naturalHeight);
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(im,0,0,w,h);
        res(cv.toDataURL('image/png'));
      };
      im.onerror=()=>res(null);
      im.src=rd.result;
    };
    rd.onerror=()=>res(null);
    rd.readAsDataURL(file);
  });
}
async function assignFaceArt(name, files){
  // a .zip of the whole set works too — expanded to its image files first
  const expanded=[];
  for(const f of files){
    if(/\.zip$/i.test(f.name)){
      try{ expanded.push(...await zipImageFiles(f)); }catch(e){}
    } else expanded.push(f);
  }
  const eo={}, ec={};
  for(const f of expanded){
    const p=parseVisemeFilename(f.name); if(!p) continue;
    const url=await downscaleImage(f, 200); if(!url) continue;
    (p.eyes==='ec'?ec:eo)[p.vis]=url;
  }
  const store={...ec, ...eo};   // prefer eyes-open when both exist
  if(ec.rest) store.rest_ec=ec.rest;   // kept separately: the idle BLINK frame
  if(!Object.keys(store).length){
    alert('No face images recognized. Drop the mouth-shape PNGs (or a .zip of them) named like "Character_AI_eo.png" — one image per mouth shape (AI, E, O, U, FV, L, MBP, WQ, etc, rest), _eo eyes open / _ec eyes closed.');
    return;
  }
  try{ localStorage.setItem(AUTOSHOW_FACEART_PREFIX+name, JSON.stringify(store)); }
  catch(e){ alert('Could not save the images (browser storage is full). Try fewer/smaller images or clear another face\'s set.'); return; }
  delete faceArtCache[name];
  renderFaceArtRow();
  drawFacesPreview();
  const p=document.getElementById('player');
  if(p && !S.playing && typeof drawPreviewFrame==='function') drawPreviewFrame(p.currentTime||0);
}
function clearFaceArt(name){
  try{ localStorage.removeItem(AUTOSHOW_FACEART_PREFIX+name); }catch(e){}
  delete faceArtCache[name];
  renderFaceArtRow();
  drawFacesPreview();
}
/* one chip per singing face: drop (or click to pick) its viseme image set */
function renderFaceArtRow(){
  const row=document.getElementById('faceArtRow'); if(!row) return;
  const faces=S.models.filter(m=>m.role==='Singing Face');
  row.innerHTML=faces.map((m,i)=>{
    const imgs=faceArtFor(m.name);
    const n=imgs?Object.keys(imgs).filter(k=>k!=='rest_ec').length:0;
    const blink=imgs&&imgs.rest_ec?' + blink':'';
    return `<span class="chip" data-face="${esc(m.name)}" style="border-color:${faceColorOf(m.name)};padding:5px 10px;cursor:pointer"
      title="Drop this character's mouth-shape PNGs — or a .zip of the whole set — here (Name_AI_eo.png, Name_rest_ec.png, …)">
      <b style="color:${faceColorOf(m.name)}">${esc(m.name)}</b>
      ${n?` · ${n} mouths${blink} <b style="cursor:pointer" onclick="event.stopPropagation();clearFaceArt('${esc(m.name)}')" title="Remove this character's images">✕</b>`
         :' · 🖼 drop face images / .zip'}
      <input type="file" multiple accept="image/*,.zip" style="display:none"></span>`;
  }).join('');
  row.querySelectorAll('.chip').forEach(chip=>{
    const name=chip.dataset.face, inp=chip.querySelector('input');
    chip.addEventListener('click', ()=>inp.click());
    inp.addEventListener('change', ()=>{ if(inp.files.length) assignFaceArt(name,[...inp.files]); });
    chip.addEventListener('dragover', e=>{ e.preventDefault(); chip.style.background='rgba(255,201,77,.15)'; });
    chip.addEventListener('dragleave', ()=>chip.style.background='');
    chip.addEventListener('drop', e=>{
      e.preventDefault(); chip.style.background='';
      const files=[...e.dataTransfer.files];
      if(files.length) assignFaceArt(name, files);
    });
  });
}

/* ---------- the singing-faces preview (step 5, above the timeline) ----------
   Only the faces, big — the direct way to check lip sync while editing. */
function drawFacesPreview(){
  const c=document.getElementById('facesCanvas'); if(!c) return;
  const W=c.width=c.offsetWidth, H=c.height, ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const faces=S.models.filter(m=>m.role==='Singing Face')
                      .sort((a,b)=>(isNaN(a.x)?0:a.x)-(isNaN(b.x)?0:b.x));
  if(!faces.length){
    ctx.fillStyle='#5A6398'; ctx.font='13px JetBrains Mono'; ctx.textAlign='center';
    ctx.fillText('No singing faces in this layout.', W/2, H/2);
    return;
  }
  const p=document.getElementById('player');
  const t=(p&&p.currentTime)||0;
  let curLine=null, word=null, phone=null;
  if(S.lyrics){
    curLine=S.lyrics.lines.find(l=>t>=l.start&&t<l.end);
    if(curLine){
      word=curLine.words.find(x=>t>=x.start&&t<x.end);
      phone=word&&word.phones.find(x=>t>=x.start&&t<x.end);
    }
  }
  const singing=new Set(curLine?curLine.faces:[]);
  const cell=W/faces.length;
  const size=Math.min(cell*0.72, H-58);
  faces.forEach((m,i)=>{
    const cx=cell*(i+0.5), cy=(H-34)/2+6;
    const isSinging=singing.has(m.name);
    const col=(curLine&&curLine.color&&isSinging)?curLine.color:faceColorOf(m.name);
    const vis=isSinging?(phone?phone.v:'MBP'):'rest';
    // glow behind the active singer
    if(isSinging){
      const g=ctx.createRadialGradient(cx,cy,size*0.1,cx,cy,size*0.75);
      g.addColorStop(0,col+'55'); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(cx-size,cy-size,size*2,size*2);
    }
    const art=faceArtImage(m.name, vis);
    ctx.save();
    ctx.globalAlpha=isSinging?1:0.45;
    if(art){
      const h=size, w=h*(art.width/art.height);
      ctx.drawImage(art, cx-w/2, cy-h/2, w, h);
    } else if(typeof drawNodeFace==='function' && drawNodeFace(ctx,m,cx,cy,size,vis,col,t)){
      // node-range face (singing bulbs, coro faces): the prop's real pixels
    } else {
      // fallback cartoon: head + eyes + the viseme mouth
      ctx.fillStyle='#1A2150'; ctx.strokeStyle=col; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(cx,cy,size/2,0,7); ctx.fill(); ctx.stroke();
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(cx-size*0.16,cy-size*0.12,size*0.05,0,7);
      ctx.arc(cx+size*0.16,cy-size*0.12,size*0.05,0,7); ctx.fill();
      if(typeof drawMouth==='function') drawMouth(ctx,cx,cy+size*0.1,vis,size/34);
    }
    ctx.restore();
    // name + who-sings underline, color-coded like everything else
    ctx.fillStyle=isSinging?'#E9ECFA':'#9AA3CE';
    ctx.font=(isSinging?'700 ':'')+'12px JetBrains Mono'; ctx.textAlign='center';
    ctx.fillText(m.name.slice(0,Math.floor(cell/8)), cx, H-18);
    ctx.fillStyle=col; ctx.globalAlpha=isSinging?1:0.5;
    ctx.fillRect(cx-24, H-12, 48, 3);
    ctx.globalAlpha=1;
  });
  // the words being sung right now, under the faces
  if(curLine){
    ctx.font='700 13px JetBrains Mono'; ctx.textAlign='center';
    ctx.fillStyle=(curLine.color)||'#FFC94D';
    const txt=curLine.words.map(w2=>w2===word?'['+w2.text+']':w2.text).join(' ');
    ctx.fillText(txt.slice(0,Math.floor(W/8)), W/2, 14);
  }
}

/* ---------- the editor UI (step 5) ---------- */
let lyricEditSel=-1;
function lyricBlocks(c){
  const W=c.width, H=c.height, dur=S.audio.duration;
  return (S.lyrics?S.lyrics.lines:[]).map((l,i)=>({
    i, l,
    x: l.start/dur*W, w: Math.max(14,(l.end-l.start)/dur*W),
    y: (i%2) ? H*0.53 : H*0.10, h: H*0.37,
  }));
}
function renderLyricEditor(){
  renderFaceArtRow();
  drawLyricEditCanvas();
  renderLineEditorPanel();
}
/* canvas only — safe to call every animation frame (the playhead moves) */
function drawLyricEditCanvas(){
  const c=document.getElementById('lyricEditCanvas'); if(!c) return;
  const W=c.width=c.offsetWidth, H=c.height, ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  if(!S.analysis || !S.lyrics || !S.lyrics.lines.length){ drawFacesPreview(); return; }
  const dur=S.audio.duration;
  // faint section backdrop, like the scrub bar
  const SC={quiet:'#141B3E',verse:'#1C2A60',build:'#4E3B1D',chorus:'#4E1D26'};
  S.analysis.sections.forEach(s=>{ ctx.fillStyle=SC[s.kind]||'#141B3E';
    ctx.fillRect(s.start/dur*W,0,(s.end-s.start)/dur*W,H); });
  lyricBlocks(c).forEach(b=>{
    const col=lineColorOf(b.l);
    ctx.globalAlpha=0.85;
    ctx.fillStyle=col;
    ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.globalAlpha=1;
    if(b.i===lyricEditSel){ ctx.strokeStyle='#FFC94D'; ctx.lineWidth=2; ctx.strokeRect(b.x-1,b.y-1,b.w+2,b.h+2); }
    if(b.w>46){
      ctx.fillStyle='#0B1026'; ctx.font='10px JetBrains Mono'; ctx.textAlign='left';
      ctx.fillText(b.l.text.slice(0,Math.floor(b.w/6.5)), b.x+3, b.y+b.h-4);
    }
  });
  // playhead
  const p=document.getElementById('player');
  const t=(p&&p.currentTime)||0;
  ctx.fillStyle='#FFC94D'; ctx.fillRect(t/dur*W-1,0,2,H);
  drawFacesPreview();   // the singing-faces preview scrubs with the same clock
}
/* selected-line panel — only rebuilt on selection/edit, not per frame */
function renderLineEditorPanel(){
  const panel=document.getElementById('lineEditor'); if(!panel) return;
  if(!S.analysis || !S.lyrics || !S.lyrics.lines.length){
    panel.innerHTML='<span style="color:var(--ink-dim)">No timed lyrics yet — add lyrics in step 3 and generate the show.</span>';
    return;
  }
  const editing=!!activeLyricDoc(document.getElementById('lyricsBox').value.trim());
  const l=S.lyrics.lines[lyricEditSel];
  if(!l){
    panel.innerHTML=`<span style="color:var(--ink-dim)">${editing?'Manual timing active (saved for this song). ':''}Click a line above to edit it.</span>`;
    return;
  }
  const faces=S.models.filter(m=>m.role==='Singing Face').map(m=>m.name);
  const voiceVal=l.faces.length===faces.length&&faces.length>1 ? 'ALL' : (l.faces[0]||'');
  panel.innerHTML=`
    <div style="margin-bottom:6px"><b style="color:${lineColorOf(l)}">♪ ${esc(l.text)}</b>
      <span style="color:var(--ink-dim)"> ${fmt(l.start)}–${fmt(l.end)}</span></div>
    <div class="row" style="gap:8px;margin-bottom:6px">
      <button class="btn small ghost" onclick="moveDocLine(${lyricEditSel},-0.25)">◀◀ −250ms</button>
      <button class="btn small ghost" onclick="moveDocLine(${lyricEditSel},-0.05)">◀ −50ms</button>
      <button class="btn small ghost" onclick="moveDocLine(${lyricEditSel},0.05)">+50ms ▶</button>
      <button class="btn small ghost" onclick="moveDocLine(${lyricEditSel},0.25)">+250ms ▶▶</button>
      <button class="btn small ghost" onclick="scaleDocLine(${lyricEditSel},0.9)" title="Squeeze this line's words into 10% less time">⇥⇤ Contract</button>
      <button class="btn small ghost" onclick="scaleDocLine(${lyricEditSel},1.111)" title="Stretch this line's words over 10% more time">⇤⇥ Expand</button>
      <button class="btn small ghost" onclick="lineToPlayhead(${lyricEditSel})">Start = playhead</button>
      <label class="opt" style="margin:0">Voice <select onchange="setDocLineVoice(${lyricEditSel},this.value)">
        ${faces.map(f=>`<option value="${esc(f)}" ${voiceVal===f?'selected':''}>${esc(f)}</option>`).join('')}
        ${faces.length>1?`<option value="ALL" ${voiceVal==='ALL'?'selected':''}>ALL FACES</option>`:''}
      </select></label>
      <label class="opt" style="margin:0">Color <input type="color" value="${lineColorOf(l)}"
        onchange="setDocLineColor(${lyricEditSel},this.value)"></label>
    </div>
    <div>Split before:
      ${l.words.length>1 ? l.words.slice(1).map((w,k)=>`<button class="chip" style="cursor:pointer;margin:2px"
        onclick="splitDocLine(${lyricEditSel},${k+1})">${esc(w.text)}</button>`).join(' ')
        : '<span style="color:var(--ink-dim)">single word — nothing to split</span>'}
    </div>`;
}
function lineToPlayhead(i){
  const p=document.getElementById('player');
  const l=S.lyrics.lines[i]; if(!l||!p) return;
  moveDocLine(i, (p.currentTime||0)-l.start);
}
/* click = select + seek · drag = move the line */
function wireLyricEditor(){
  const c=document.getElementById('lyricEditCanvas'); if(!c || c._wired) return;
  c._wired=true;
  let dragI=-1, startX=0, moved=false, origStart=0;
  const hit=e=>{
    const r=c.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    return lyricBlocks(c).find(b=>mx>=b.x-2&&mx<=b.x+b.w+2&&my>=b.y&&my<=b.y+b.h);
  };
  c.addEventListener('mousedown', e=>{
    const b=hit(e); if(!b) return;
    dragI=b.i; startX=e.clientX; moved=false; origStart=b.l.start;
    lyricEditSel=b.i; renderLyricEditor();
  });
  window.addEventListener('mousemove', e=>{
    if(dragI<0) return;
    const dt=(e.clientX-startX)/c.width*S.audio.duration;
    if(Math.abs(dt)>0.02) moved=true;
    if(moved){ // live-preview the drag without committing
      const l=S.lyrics.lines[dragI];
      shiftLine(l, (origStart+dt)-l.start);
      drawLyricEditCanvas();
    }
  });
  window.addEventListener('mouseup', e=>{
    if(dragI<0) return;
    const i=dragI; dragI=-1;
    const l=S.lyrics.lines[i];
    if(moved){
      const dt=l.start-origStart;
      shiftLine(l, -dt);            // undo the live preview…
      moveDocLine(i, dt);           // …and commit through the doc
    } else {
      const p=document.getElementById('player');
      if(p&&S.audio){ p.currentTime=Math.max(0,l.start);
        if(!S.playing){ drawPreviewFrame(p.currentTime); } }
      renderLyricEditor();
    }
  });
}
