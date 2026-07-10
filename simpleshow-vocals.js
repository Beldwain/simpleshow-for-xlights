/* SimpleShow — vocal arrangement & face casting (supporting file).
   Must sit next to simpleshow-xlights.html; loaded with a plain <script src>.

   Real displays don't round-robin lyrics: one face carries the lead (or two
   trade lines as a duet) and the rest come in as backup on the choruses.
   This module owns that casting decision plus the step-3 controls for it.
   Uses globals from the main file at runtime: S, esc(), buildLyrics(). */

const AUTOSHOW_VOCAL_KEY = 'autoshow.vocals.v1';

function loadVocalPrefs(){
  try { return JSON.parse(localStorage.getItem(AUTOSHOW_VOCAL_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function saveVocalPrefs(v){
  try { localStorage.setItem(AUTOSHOW_VOCAL_KEY, JSON.stringify(v)); } catch(e){}
}

/* Lazily initialized arrangement state; leads are re-validated against the
   current face list every time (layouts and roles can change mid-session). */
function vocalState(){
  if(!S.vocal){
    const saved = loadVocalPrefs();
    S.vocal = {
      mode: ['solo','duet','round'].includes(saved.mode) ? saved.mode : 'solo',
      leads: Array.isArray(saved.leads) ? saved.leads : [],
      backup: saved.backup !== false,
    };
  }
  const faces = S.models.filter(m => m.role === 'Singing Face').map(m => m.name);
  const v = S.vocal;
  v.leads = v.leads.filter(f => faces.includes(f));
  if(!v.leads.length && faces.length) v.leads = [faces[0]];
  if(v.mode === 'duet' && v.leads.length < 2){
    const other = faces.find(f => !v.leads.includes(f));
    if(other) v.leads.push(other);
  }
  return v;
}

/* Assigns lines[i].faces in place.
   lines: [{start, faces[]}], faces: all Singing Face names,
   inChorus: t => bool, opts: {mode, leads[], backup} */
function castVocals(lines, faces, inChorus, opts){
  if(!faces.length){ lines.forEach(l => l.faces = []); return; }
  const mode = opts.mode || 'solo';
  const leads = (opts.leads || []).filter(f => faces.includes(f));
  if(!leads.length) leads.push(faces[0]);
  if(mode === 'duet' && leads.length < 2){
    const other = faces.find(f => !leads.includes(f));
    if(other) leads.push(other);
  }
  let i = 0;
  lines.forEach(l => {
    if(inChorus(l.start)){
      // backup singers pile in on the chorus; without them a duet still sings together
      l.faces = opts.backup !== false ? [...faces]
              : mode === 'duet' ? [...leads] : [leads[0]];
      return;
    }
    if(mode === 'round'){ l.faces = [faces[i % faces.length]]; i++; }
    else if(mode === 'duet'){ l.faces = [leads[i % 2]]; i++; }
    else l.faces = [leads[0]];
  });
}

/* Per-voice timing tracks (the pro pattern: one track per character/lead).
   Returns Map leadFaceName -> timing track name; empty in round-robin mode
   (everything binds to the merged Lyrics track there). Single source of
   truth for both the generator (Faces binding) and the exporter. */
function voiceTrackPlan(){
  const v=vocalState();
  const names=new Map();
  if(v.mode==='round') return names;
  const reserved=new Set(['Beats','Bars','Lyrics']);
  v.leads.slice(0, v.mode==='duet'?2:1).forEach(f=>{
    let base='Voice - '+String(f).replace(/,/g,' '), n=base, k=2;
    while(reserved.has(n)) n=base+' ('+(k++)+')';
    reserved.add(n); names.set(f,n);
  });
  return names;
}
/* Which track a face's Faces effect on this line binds to: their own voice
   track for solo/duet lines, the merged Lyrics track for all-faces choruses
   (and always in round-robin mode). */
function voiceTrackFor(line, faceName, names, totalFaces){
  if(!names || !names.has(faceName)) return 'Lyrics';
  if(totalFaces>1 && line.faces.length>=totalFaces) return 'Lyrics';
  return names.get(faceName);
}

function renderVocalControls(){
  const el = document.getElementById('vocalControls');
  if(!el) return;
  const faces = S.models.filter(m => m.role === 'Singing Face').map(m => m.name);
  if(!faces.length){ el.innerHTML = ''; return; }
  const v = vocalState();
  const leadSel = (i, label) => `<label class="opt">${label}
    <select onchange="setVocalLead(${i}, this.value)">${
      faces.map(f => `<option ${f === v.leads[i] ? 'selected' : ''}>${esc(f)}</option>`).join('')
    }</select></label>`;
  el.innerHTML = `
    <label class="opt">Arrangement
      <select onchange="setVocalMode(this.value)">
        <option value="solo" ${v.mode==='solo'?'selected':''}>Solo — one lead, everyone else backs up</option>
        <option value="duet" ${v.mode==='duet'?'selected':''}>Duet — two leads trade lines</option>
        <option value="round" ${v.mode==='round'?'selected':''}>Round robin — every face takes turns</option>
      </select></label>
    ${v.mode === 'solo' ? leadSel(0, 'Lead vocal') : ''}
    ${v.mode === 'duet' ? leadSel(0, 'Duet lead 1') + leadSel(1, 'Duet lead 2') : ''}
    <label class="opt"><input type="checkbox" ${v.backup ? 'checked' : ''}
      onchange="setVocalBackup(this.checked)"> Backup singers join on choruses</label>`;
}

function setVocalMode(mode){ vocalState().mode = mode; vocalChanged(); }
function setVocalLead(i, name){
  const v = vocalState();
  // keep duet leads distinct: if the other slot holds this face, swap them
  const j = v.leads.indexOf(name);
  if(j >= 0 && j !== i) v.leads[j] = v.leads[i];
  v.leads[i] = name;
  vocalChanged();
}
function setVocalBackup(on){ vocalState().backup = on; vocalChanged(); }
function vocalChanged(){
  saveVocalPrefs(S.vocal);
  renderVocalControls();
  if(S.analysis) buildLyrics();
}
