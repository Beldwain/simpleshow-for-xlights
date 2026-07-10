/* SimpleShow — choreography-first generation (supporting file).
   Must sit next to simpleshow-xlights.html; loaded with a plain <script src>.

   Modeled on how professional sequences are built (measured from three pro
   .xsq files): effects live mostly on MODEL GROUPS, a handful of elements
   carry the show at any moment while everything else rests, and short
   beat-aligned hits/chases/sweeps do the talking. The choreographer picks
   display-level "moves" per section under an energy budget, then compiles
   them into the same plan format the exporter and preview already consume:
   plan[elementName] = [[layer, effect, settings, palette[], startMs, endMs]].
   Element names may now be group names — xLights renders those natively.

   Uses globals from the main file at runtime: S, recipesFor, PALETTES. */

/* ---------- seeded RNG: same seed → identical show ---------- */
function makeRng(seed){
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: n => Math.floor(next()*n),
    pick: arr => arr[Math.floor(next()*arr.length)],
    weighted(pairs){
      let tot=0; for(const [,w] of pairs) tot+=w;
      let r=next()*tot;
      for(const [item,w] of pairs){ r-=w; if(r<=0) return item; }
      return pairs[pairs.length-1][0];
    },
    shuffle(arr){
      const a=[...arr];
      for(let i=a.length-1;i>0;i--){ const j=this.int(i+1); [a[i],a[j]]=[a[j],a[i]]; }
      return a;
    },
  };
}
function newSeed(){ return (Math.random()*0xFFFFFFFF)>>>0; }

/* ---------- prop families ----------
   A family is the unit the choreographer thinks in. Groups from the layout
   become families with `element` = the group name (effects land on the group
   element, one plan key, xLights renders the whole group). Models not owned
   by any accepted group fall back into role families (`element` = null →
   the compiler stamps rows onto each member). Ownership is EXCLUSIVE: an
   owned model never gets direct base effects while its group is targeted —
   that's the double-lighting defense. */
const CHOREO_LINEAR_ROLES = new Set(['Arch','Candy Cane','Icicles','Roof/Outline']);

function famFrom(name, members, element){
  const roles={};
  members.forEach(m=>roles[m.role]=(roles[m.role]||0)+1);
  const role=Object.entries(roles).sort((a,b)=>b[1]-a[1])[0][0];
  const sorted=[...members].sort((a,b)=>(isNaN(a.x)?1e9:a.x)-(isNaN(b.x)?1e9:b.x));
  const xs=members.map(m=>m.x).filter(x=>!isNaN(x));
  return {
    name, element, members:sorted, role,
    cx: xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : NaN,
    nodes: members.reduce((s,m)=>s+((m.parm1||0)*(m.parm2||0)||1),0),
    special: members.filter(m=>m.role==='Special/Accent').length > members.length/2,
    forest:  members.filter(m=>m.role==='Forest').length > members.length/2,
    strandy: members.every(m=>CHOREO_LINEAR_ROLES.has(m.role)),
    anchor:false,
  };
}

function buildFamilies(models, groups){
  // screens configured for shaders/karaoke are placed separately, like faces
  const seqable = models.filter(m=>m.role!=='Skip' && m.role!=='Singing Face' && !m._screenTaken);
  const byName = new Map(seqable.map(m=>[m.name,m]));
  const negated = n => /\bno[nt]?\b|non-|without|exclud/.test((n||'').toLowerCase());
  // group member lists can reference OTHER GROUPS ("All" is usually a list of
  // groups) — expand recursively so coverage math sees actual models
  const gmap=new Map((groups||[]).filter(g=>g.name).map(g=>[g.name,g]));
  const expand=(g,seen)=>{
    const out=[];
    (g.members||[]).forEach(nm=>{
      const n=(nm||'').trim(); if(!n) return;
      if(byName.has(n)) out.push(byName.get(n));
      else if(gmap.has(n) && !seen.has(n)){ seen.add(n); out.push(...expand(gmap.get(n),seen)); }
    });
    return out;
  };
  const cands = (groups||[]).filter(g=>g.name)
    .map(g=>({ name:g.name, members:[...new Set(expand(g,new Set([g.name])))] }))
    .filter(g=>g.members.length>=2);
  // groups covering most of the display are unison-hit targets, not families
  const wholes = cands.filter(g=>g.members.length>seqable.length*0.5)
                      .sort((a,b)=>b.members.length-a.members.length);
  const allGroup = (()=>{ const w=wholes.find(g=>!negated(g.name)); return w?{name:w.name,members:w.members}:null; })();
  const wholeNames = new Set(wholes.map(w=>w.name));
  const owned = new Set();
  const families = [];
  // prop-type groups ("Arches", "Mini Trees", "Peace Forest") are the units
  // pros choreograph with — they pick members before mixed zone groups
  // ("All House", "Third - Left") get whatever is left
  const homog=g=>{
    const c={}; g.members.forEach(m=>c[m.role]=(c[m.role]||0)+1);
    return Math.max(...Object.values(c))/g.members.length;
  };
  cands.filter(g=>!wholeNames.has(g.name) && !negated(g.name))
       .sort((a,b)=>(homog(b)-homog(a)) || (b.members.length-a.members.length))
       .forEach(g=>{
         const fresh=g.members.filter(m=>!owned.has(m.name));
         // subgroups of an accepted group resolve naturally: no fresh members → rejected
         if(fresh.length<2 || fresh.length<g.members.length*0.7) return;
         g.members.forEach(m=>owned.add(m.name));
         families.push(famFrom(g.name, g.members, g.name));
       });
  const byRole={};
  seqable.filter(m=>!owned.has(m.name)).forEach(m=>{ (byRole[m.role]=byRole[m.role]||[]).push(m); });
  Object.entries(byRole).forEach(([role,mem])=>families.push(famFrom(role, mem, null)));
  // anchor: the hero family — mega tree, else matrix, else most pixels
  const pickAnchor =
    families.find(f=>!f.special && f.members.some(m=>m.role==='Mega Tree')) ||
    families.find(f=>!f.special && f.members.some(m=>m.role==='Matrix/Screen')) ||
    [...families].filter(f=>!f.special).sort((a,b)=>b.nodes-a.nodes)[0];
  if(pickAnchor) pickAnchor.anchor=true;
  const owner={};
  families.forEach(f=>{ if(f.element) f.members.forEach(m=>owner[m.name]=f); });
  return {families, allGroup, owner};
}

/* ---------- phrases (moved here from generateShow, unchanged logic) ---------- */
function subdividePhrases(A, intensity){
  const phrases=[];
  A.sections.forEach(sec=>{
    const beatsIn = A.beats.filter(b=>b>=sec.start&&b<sec.end);
    const step = Math.max(4, intensity===3?8:intensity===2?8:16);
    for(let i=0;i<Math.max(1,beatsIn.length);i+=step){
      const s=beatsIn[i]??sec.start, e=beatsIn[i+step]??sec.end;
      if(e-s>0.3) phrases.push({kind:sec.kind,start:s,end:e,idx:phrases.length});
    }
  });
  return phrases;
}

/* ---------- move vocabulary ----------
   Each move emits placements: {fam | elName, layer, effect, settings, pal, s, e}.
   Times in seconds; the compiler snaps to the 50 ms grid.

   Layer stack (matches how the pro sequences stack their group elements):
     0  color bed — a dim wash that holds the family's color under the moves
        (only when layering is on; in "simple" mode moves sit on 0 themselves)
     1  the move — hold textures, chases, sweeps
     2  rhythm — beat pulses stacked over a hold (focus/call features)
     3+ accents — unison hits, shockwave/strobe on bass hits (always white-hot)
   Upper layers carry T_CHOICE_LayerMethod=Max so xLights blends them the way
   the preview does; "rich" adds a sparkle overlay to build/chorus textures. */
const ACCENT_LAYER=3;
function moveLayer(ctx){ return ctx.opts.layerDepth==='simple' ? 0 : 1; }
function fxSettings(ctx, ph, settings, layer, sparkleOk){
  let s=settings;
  if(ctx.opts.layerDepth!=='simple' && layer>=1)
    s+=(s?',':'')+'T_CHOICE_LayerMethod=Max';
  const moodSpark=(typeof MOODS!=='undefined' && MOODS[ctx.opts.mood])?MOODS[ctx.opts.mood].sparkle:1;
  if(sparkleOk && moodSpark>0 && ctx.opts.layerDepth==='rich' && (ph.kind==='build'||ph.kind==='chorus'))
    s+=(s?',':'')+'C_SLIDER_SparkleFrequency='+Math.round(60*moodSpark);
  return s;
}
function choreoPal(ctx, pk, ph){
  const P=ctx.P;
  if(pk==='accent') return [P.accent];
  let pal=P[pk]||P.A;
  if(pk==='A' && ph.idx%2) pal=P.B;   // the A/B phrase alternation, as before
  return pal;
}
/* wall washers / floods are LONG fades, never beat props: every move that
   lands on an all-flood family becomes a slow swell — rise over the front of
   the phrase, fall over the back — with the peak set by the section energy */
function isFloodFam(fam){ return fam.members.length && fam.members.every(m=>m.role==='Flood'); }
function mvFlood(ctx, ph, fam){
  const L=moveLayer(ctx);
  const peak = ph.kind==='quiet'?40 : ph.kind==='verse'?75 : 100;
  const mid=ph.start+(ph.end-ph.start)*0.6;
  const pal=choreoPal(ctx, ph.kind==='chorus'?'C':'A', ph);
  return [
    {fam, layer:L, effect:'On', settings:fxSettings(ctx,ph,`E_TEXTCTRL_Eff_On_Start=0,E_TEXTCTRL_Eff_On_End=${peak}`,L,false), pal, s:ph.start, e:mid},
    {fam, layer:L, effect:'On', settings:fxSettings(ctx,ph,`E_TEXTCTRL_Eff_On_Start=${peak},E_TEXTCTRL_Eff_On_End=0`,L,false), pal, s:mid, e:ph.end},
  ];
}
function mvHold(ctx, ph, fam, kind){
  if(isFloodFam(fam)) return mvFlood(ctx,ph,fam);
  const recs=recipesFor(fam.role, kind||ph.kind, ctx.opts);
  if(!recs.length) return [];
  const [name,settings,pk]=recs[0];
  const L=moveLayer(ctx);
  return [{fam, layer:L, effect:name, settings:fxSettings(ctx,ph,settings,L,true), pal:choreoPal(ctx,pk,ph), s:ph.start, e:ph.end}];
}
function mvPulse(ctx, ph, fam, everyOther, phase, layer){
  if(isFloodFam(fam)) return mvFlood(ctx,ph,fam);
  const beats=ctx.A.beats.filter(b=>b>=ph.start&&b<ph.end);
  const per=60/ctx.A.bpm;
  const isTree=fam.members.some(m=>m.role==='Mega Tree');
  const eff = isTree
    ? ['Shockwave','E_SLIDER_Shockwave_Start_Radius=1,E_SLIDER_Shockwave_End_Radius=100,E_SLIDER_Shockwave_Start_Width=10,E_SLIDER_Shockwave_End_Width=0']
    : ['On',''];
  const L=layer!=null?layer:moveLayer(ctx);
  const out=[];
  beats.forEach((b,i)=>{
    if(everyOther && (i%2)!==(phase||0)) return;
    out.push({fam, layer:L, effect:eff[0], settings:fxSettings(ctx,ph,eff[1],L,false), pal:choreoPal(ctx,'C',ph), s:b, e:b+per*0.5});
  });
  return out;
}
const CHASE_ACROSS_ROLES=new Set(['Mini Tree','Candy Cane']);
function mvChase(ctx, ph, fam){
  const L=moveLayer(ctx);
  if(isFloodFam(fam)) return mvFlood(ctx,ph,fam);   // washers never chase
  if(fam.strandy)
    return [{fam, layer:L, effect:'SingleStrand', settings:fxSettings(ctx,ph,'E_CHOICE_SingleStrand_Colors=Palette,E_SLIDER_Number_Chases=1',L,true), pal:choreoPal(ctx,'A',ph), s:ph.start, e:ph.end}];
  // spinners/wreaths never get linear Bars — their "chase" is a spin
  if(fam.members.length && fam.members.every(m=>m.role==='Spinner/Wreath'))
    return [{fam, layer:L, effect:'Pinwheel', settings:fxSettings(ctx,ph,'E_SLIDER_Pinwheel_Arms=4,E_SLIDER_Pinwheel_Speed=15',L,true), pal:choreoPal(ctx,'C',ph), s:ph.start, e:ph.end}];
  // forests undulate — a "chase" on a forest is a traveling wave, not Bars
  if(fam.members.length && fam.members.every(m=>m.role==='Forest'))
    return [{fam, layer:L, effect:'Wave', settings:fxSettings(ctx,ph,'E_CHOICE_Wave_Type=Sine,E_SLIDER_Wave_Height=60,E_SLIDER_Wave_Speed=20',L,true), pal:choreoPal(ctx,'C',ph), s:ph.start, e:ph.end}];
  // fast sections: a chase ACROSS the props — mini trees / candy canes light
  // one at a time down the yard, the way pros program scale runs
  if((ph.kind==='build'||ph.kind==='chorus') && fam.members.length>=3
     && fam.members.every(m=>CHASE_ACROSS_ROLES.has(m.role))){
    const order=[...fam.members].sort((a,b)=>(a.x||0)-(b.x||0));
    const beats=ctx.A.beats.filter(b=>b>=ph.start&&b<ph.end);
    // big rows step at 8th-note speed so a full run fits inside the phrase
    const times = order.length>8
      ? beats.flatMap((b,i)=>[b,(b+(beats[i+1]??ph.end))/2])
      : beats;
    const out=[];
    times.forEach((t,k)=>{
      const m=order[k%order.length];
      const e=Math.min(ph.end, times[k+1]??ph.end);
      if(e-t<0.05) return;
      const pal=choreoPal(ctx,'C',ph);
      out.push({elName:m.name, layer:L, effect:'On', settings:fxSettings(ctx,ph,'',L,false),
                pal:(typeof palForModel==='function'?palForModel(m,pal):pal), s:t, e:t+(e-t)*0.95});
    });
    if(out.length) return out;
  }
  return [{fam, layer:L, effect:'Bars', settings:fxSettings(ctx,ph,'E_SLIDER_Bars_BarCount=4',L,true), pal:choreoPal(ctx,'C',ph), s:ph.start, e:ph.end}];
}
function mvSweep(ctx, ph, fams, rng){
  // floods swell instead of riding the shimmer sweep
  const floods=fams.filter(isFloodFam);
  const withX=fams.filter(f=>!isFloodFam(f)&&!isNaN(f.cx));
  if(withX.length<2) return fams.flatMap(f=>mvHold(ctx,ph,f));
  const xs=withX.map(f=>f.cx), mid=(Math.min(...xs)+Math.max(...xs))/2;
  const dir=rng.pick(['lr','rl','co']);
  const key=f=> dir==='lr'?f.cx : dir==='rl'?-f.cx : Math.abs(f.cx-mid);
  const order=[...withX].sort((a,b)=>key(a)-key(b));
  const total=Math.min(ph.end-ph.start, 8*60/ctx.A.bpm);   // a sweep spans up to 2 bars
  const L=moveLayer(ctx);
  const out=[];
  for(let t0=ph.start; t0<ph.end-0.5; t0+=total){
    order.forEach((f,i)=>{
      const s=t0+(i/order.length)*total*0.75;
      const e=Math.min(ph.end, s+total*0.5);
      if(e>s) out.push({fam:f, layer:L, effect:'ColorWash', settings:fxSettings(ctx,ph,'E_CHECKBOX_ColorWash_Shimmer=1',L,true), pal:choreoPal(ctx,'C',ph), s, e});
    });
  }
  floods.forEach(f=>out.push(...mvFlood(ctx,ph,f)));
  return out;
}
/* the color bed: a dim wash under a family's moves (layered/rich modes) */
function mvBed(ctx, ph, fam){
  if(ctx.opts.layerDepth==='simple') return [];
  return [{fam, layer:0, effect:'ColorWash', settings:'C_SLIDER_Brightness=30', pal:choreoPal(ctx,'B',ph), s:ph.start, e:ph.end}];
}

/* ---------- the mega-tree spotlight ----------
   The tree is the center of the show, so instead of rolling the same dice as
   everyone else it runs a dedicated program (measured from the pro
   sequences, where the mega tree carries the deepest layer stacks):

     texture layer — a hero effect that upgrades with the music: gentle
       twinkle in quiet, spirals trading with tendrils through verses,
       accelerating spirals in builds, and a rotating Butterfly / Curtain /
       fast-Spirals / Tendril / bottom-up-wipe / Pinwheel feature in choruses
       (with sparkle whenever layering is on, not just in rich);
     rhythm layer  — Shockwave rings stacked on top: every downbeat through
       a build (the ramp you can see), every other downbeat in choruses;
     accent layer  — the existing bass-hit shockwaves ride above all of it.

   Off = the "Mega tree spotlight" step-4 toggle; the tree then behaves like
   any other anchor family. */
const TREE_SHOCK='E_SLIDER_Shockwave_Start_Radius=1,E_SLIDER_Shockwave_End_Radius=100,E_SLIDER_Shockwave_Start_Width=10,E_SLIDER_Shockwave_End_Width=0';
function treeSpotlightOn(ctx, fam){
  return ctx.opts.megaSpotlight!==false && fam && fam.members.some(m=>m.role==='Mega Tree');
}
function treeProgram(ctx, ph, fam){
  const L=moveLayer(ctx), rL=L+1;
  const layered=ctx.opts.layerDepth!=='simple';
  const meth=layered?',T_CHOICE_LayerMethod=Max':'';
  const spark=layered?',C_SLIDER_SparkleFrequency=40':'';
  const out=[];
  const tex=(name,settings,pk,extra)=>out.push({fam, layer:L, effect:name,
    settings:settings+meth+(extra||''), pal:choreoPal(ctx,pk,ph), s:ph.start, e:ph.end});
  const rings=(every,dur)=>ctx.A.downbeats
    .filter(b=>b>=ph.start&&b<ph.end).filter((b,i)=>i%every===0)
    .forEach(b=>out.push({fam, layer:rL, effect:'Shockwave', settings:TREE_SHOCK+meth,
      pal:[ctx.P.accent], s:b, e:Math.min(ph.end,b+dur)}));
  if(ph.kind==='quiet'){
    tex('Twinkle','E_SLIDER_Twinkle_Count=12','B');
  } else if(ph.kind==='verse'){
    // verses trade spirals with tendrils — the two classic mega-tree textures
    const t=[['Spirals','E_SLIDER_Spirals_Count=3,E_SLIDER_Spirals_Movement=10'],
             ['Tendril','E_CHOICE_Tendril_Movement=Vertical Zig Zag,E_SLIDER_Tendril_TrailLength=20']][ph.idx%2];
    tex(t[0],t[1],'A');
  } else if(ph.kind==='build'){
    tex('Spirals','E_SLIDER_Spirals_Count=5,E_SLIDER_Spirals_Movement=25','C',spark);
    rings(1,0.5);   // every downbeat — the audible ramp made visible
  } else {          // chorus: rotate the hero texture per phrase
    const t=[['Butterfly','E_SLIDER_Butterfly_Chunks=4,E_SLIDER_Butterfly_Speed=20'],
             ['Curtain','E_CHOICE_Curtain_Edge=center,E_CHOICE_Curtain_Effect=open then close,E_CHECKBOX_Curtain_Repeat=1'],
             ['Spirals','E_SLIDER_Spirals_Count=4,E_SLIDER_Spirals_Movement=30'],
             ['Tendril','E_CHOICE_Tendril_Movement=Circle,E_SLIDER_Tendril_TrailLength=25'],
             ['Curtain','E_CHOICE_Curtain_Edge=bottom,E_CHOICE_Curtain_Effect=open,E_CHECKBOX_Curtain_Repeat=1'], // a bottom-up wipe
             ['Pinwheel','E_SLIDER_Pinwheel_Arms=6,E_SLIDER_Pinwheel_Speed=20']][ph.idx%6];
    tex(t[0],t[1],'C',spark);
    rings(2,0.6);   // every other downbeat keeps it breathing, not strobing
  }
  return out;
}

/* ---------- the choreographer ---------- */
function choreograph(A, famInfo, ctx, rng){
  const {families, allGroup}=famInfo;
  const specials=families.filter(f=>f.special);
  const normals=families.filter(f=>!f.special);
  if(!normals.length) return [];
  const anchor=normals.find(f=>f.anchor)||normals[0];
  const pool=normals.filter(f=>f!==anchor);
  const mood=(typeof MOODS!=='undefined' && MOODS[ctx.opts.mood])||{energy:0,rest:1,sparkle:1};
  const scale = (ctx.intensity===1?0.7 : ctx.intensity===3?1.3 : 1) * (1+mood.energy*0.25);
  const budget = kind => {
    const n=normals.length;
    const raw = kind==='quiet'?2 : kind==='verse'?Math.ceil(n/3) : kind==='build'?Math.ceil(n/2) : n;
    return Math.max(1, Math.min(n, Math.round(raw*scale)));
  };
  // step-4 move toggles thin the vocabulary; hold always remains available
  const en=ctx.opts.moves||{};
  const allow=mv=>mv==='hold'||en[mv]!==false;
  const MOVES={};
  Object.entries({
    quiet: [['hold',5],['chase',1]],
    verse: [['hold',3],['chase',3],['pulse',2],['sweep',1]],
    build: [['pulse',4],['sweep',3],['chase',2]],
    chorus:[['focus',4],['call',3],['sweep',2],['pulse',2],['chase',2]],
  }).forEach(([k,tab])=>{
    const kept=tab.filter(([mv])=>allow(mv));
    MOVES[k]=kept.length?kept:[['hold',1]];
  });
  const out=[];
  const unison=(t,durS)=>{
    if(ctx.opts.useUnison===false) return;
    if(allGroup) out.push({elName:allGroup.name, layer:ACCENT_LAYER, effect:'On', settings:'', pal:[ctx.P.accent], s:t, e:t+durS});
    else normals.forEach(f=>out.push({fam:f, layer:ACCENT_LAYER, effect:'On', settings:'', pal:[ctx.P.accent], s:t, e:t+durS}));
  };
  let chorusN=-1;
  A.sections.forEach(sec=>{
    if(sec.kind==='chorus') chorusN++;
    const phs=ctx.phrases.filter(p=>p.start>=sec.start-0.01 && p.start<sec.end);
    if(!phs.length) return;
    const b=budget(sec.kind);
    // forests are seasoning, not a main course: featured in quiets, joining
    // only every OTHER chorus (last, when the budget is genuinely full), and
    // sitting out verses and builds entirely — waves read best when rare
    const forestOK = sec.kind==='quiet' || (sec.kind==='chorus' && chorusN%2===0);
    const rampPool = forestOK ? pool : pool.filter(f=>!f.forest);
    const rampOrder=[...rng.shuffle(rampPool.filter(f=>!f.forest)), ...rng.shuffle(rampPool.filter(f=>f.forest))];
    let active;
    if(sec.kind==='quiet'){
      // quiet: the anchor breathes, a forest may glow underneath — nothing else
      active=[anchor];
      const forest=pool.find(f=>f.forest);
      if(b>1 && forest) active.push(forest);
      else if(b>1 && pool.length) active.push(rng.pick(pool));
    } else {
      active=[anchor, ...rampOrder.slice(0, b-1)];
    }
    if(sec.kind==='build'||sec.kind==='chorus') unison(phs[0].start, 0.45);
    phs.forEach((ph,pi)=>{
      let act=active;
      if(sec.kind==='build'){  // the ramp: one more family joins each phrase
        const grow=Math.min(normals.length, budget('verse')+pi);
        act=[anchor, ...rampOrder.slice(0, Math.max(0,grow-1))];
      }
      const others=act.filter(f=>f!==anchor);
      // the color bed: every active family keeps a dim wash under its moves
      act.forEach(f=>out.push(...mvBed(ctx,ph,f)));
      const stackL=moveLayer(ctx)+1;   // pulses stacked OVER a hold on the same family
      // the mega tree runs its own layered program instead of a plain hold —
      // its rhythm layer already pulses, so the anchor pulse fallbacks skip
      const treeProg=treeSpotlightOn(ctx,anchor);
      // even the hero rests: in verses the anchor sits out one phrase in
      // three (bed only) so the mega tree isn't running the entire song
      // mood sets how often even the hero rests: gentle every other phrase,
      // party hardly ever
      const restMod = mood.rest>=1.5?2 : mood.rest<=0.5?5 : 3;
      const anchorRest = sec.kind==='verse' && others.length>0 && ph.idx%restMod===restMod-1;
      const anchorHold=()=>anchorRest?[]:(treeProg?treeProgram(ctx,ph,anchor):mvHold(ctx,ph,anchor));
      const mv=rng.weighted(MOVES[sec.kind]||MOVES.verse);
      if(mv==='hold'){
        out.push(...anchorHold());
        others.forEach(f=>out.push(...mvHold(ctx,ph,f)));
      } else if(mv==='chase'){
        out.push(...anchorHold());
        others.forEach(f=>out.push(...mvChase(ctx,ph,f)));
      } else if(mv==='pulse'){
        out.push(...anchorHold());
        others.forEach(f=>out.push(...mvPulse(ctx,ph,f)));
        if(!others.length && !treeProg) out.push(...mvPulse(ctx,ph,anchor,false,0,stackL));
      } else if(mv==='sweep'){
        out.push(...anchorHold());
        out.push(...(others.length>=2 ? mvSweep(ctx,ph,others,rng)
                                      : others.flatMap(f=>mvChase(ctx,ph,f))));
      } else if(mv==='call'){
        // call-and-response: two halves trade beats; anchor holds underneath
        out.push(...anchorHold());
        const half=Math.ceil(others.length/2);
        others.forEach((f,i)=>out.push(...mvPulse(ctx,ph,f,true,i<half?0:1)));
        if(!others.length && !treeProg) out.push(...mvPulse(ctx,ph,anchor,true,0,stackL));
      } else if(mv==='focus'){
        // one family takes the spotlight per phrase; the rest fall to a dim bed
        const feat=act[pi%act.length];
        if(feat===anchor){
          out.push(...anchorHold());
          if(!treeProg) out.push(...mvPulse(ctx,ph,feat,false,0,stackL));
        } else {
          out.push(...mvHold(ctx,ph,feat));
          out.push(...mvPulse(ctx,ph,feat,false,0,stackL));
        }
        act.filter(f=>f!==feat).forEach(f=>out.push(...(f===anchor?anchorHold():mvHold(ctx,ph,f,'quiet'))));
      }
      // specials ride their existing recipe semantics: ramp in builds, shimmer in choruses
      if(sec.kind==='build'||sec.kind==='chorus')
        specials.forEach(f=>out.push(...mvHold(ctx,ph,f)));
    });
  });
  return out;
}

/* ---------- compile moves → plan (exporter/preview contract) ---------- */
function compileChoreo(placements, famInfo, models, ms){
  const plan={};
  // empty arrays matter: seeded elements render dark (negative space), while
  // a missing key would trip the preview's pre-generation fallback
  models.forEach(m=>{ if(m.role!=='Skip') plan[m.name]=[]; });
  famInfo.families.forEach(f=>{ if(f.element) plan[f.element]=plan[f.element]||[]; });
  if(famInfo.allGroup) plan[famInfo.allGroup.name]=plan[famInfo.allGroup.name]||[];
  placements.forEach(p=>{
    const row=[p.layer, p.effect, p.settings, p.pal, ms(p.s), ms(p.e)];
    if(row[5]<=row[4]) return;
    if(p.elName){ if(plan[p.elName]) plan[p.elName].push(row); return; }
    const f=p.fam;
    if(f.element) plan[f.element].push(row);
    else f.members.forEach(m=>{
      // single-color strings can only show their one color — say so in the xsq
      const pal=typeof palForModel==='function' ? palForModel(m, p.pal) : p.pal;
      plan[m.name].push([row[0], row[1], row[2], pal, row[4], row[5]]);
    });
  });
  return plan;
}

/* ---------- session persistence (roles & vocals persist elsewhere) ---------- */
const AUTOSHOW_SESSION_KEY='autoshow.session.v1';
function saveSession(){
  const g=id=>document.getElementById(id);
  if(!g('lyricsBox')) return;
  const s={
    lyrics:g('lyricsBox').value,
    skipIntro:g('skipIntro').checked, snapOnsets:g('snapOnsets').checked,
    offset:+g('lyricsOffset').value||0,
    style:g('styleSel').value, intensity:+g('intensity').value,
    mood:g('moodSel')?g('moodSel').value:'classic',
    canvasMoment:g('useCanvasMoment')?g('useCanvasMoment').checked:true,
    shock:g('useShockwaves').checked, vu:g('useVU').checked,
    seed:g('seedBox')?g('seedBox').value:'',
    layerDepth:g('layerDepth')?g('layerDepth').value:'layered',
    unison:g('useUnison')?g('useUnison').checked:true,
    megaSpot:g('megaSpotlight')?g('megaSpotlight').checked:true,
    moves:['Sweep','Chase','Pulse','Call','Focus'].reduce((o,k)=>{
      const el=g('mv'+k); if(el) o[k.toLowerCase()]=el.checked; return o; },{}),
  };
  try{ localStorage.setItem(AUTOSHOW_SESSION_KEY, JSON.stringify(s)); }catch(e){}
}
function restoreSession(){
  let s; try{ s=JSON.parse(localStorage.getItem(AUTOSHOW_SESSION_KEY)||'null'); }catch(e){ return; }
  if(!s) return;
  const g=id=>document.getElementById(id);
  if(s.lyrics) g('lyricsBox').value=s.lyrics;
  g('skipIntro').checked = s.skipIntro!==false;
  g('snapOnsets').checked = s.snapOnsets!==false;
  g('lyricsOffset').value = s.offset||0;
  g('lyricsOffsetLabel').textContent = (s.offset||0)+' ms';
  const o2=g('lyricsOffset2');
  if(o2){ o2.value=s.offset||0; g('lyricsOffset2Label').textContent=(s.offset||0)+' ms'; }
  if(s.style && [...g('styleSel').options].some(o=>o.value===s.style)) g('styleSel').value=s.style;
  if(s.mood && g('moodSel')) g('moodSel').value=s.mood;
  if(g('useCanvasMoment')) g('useCanvasMoment').checked = s.canvasMoment!==false;
  if(s.intensity){ g('intensity').value=s.intensity;
    g('intensityLabel').textContent=['','Gentle','Balanced','Full send'][s.intensity]||'Balanced'; }
  g('useShockwaves').checked = s.shock!==false;
  g('useVU').checked = s.vu!==false;
  if(s.layerDepth && g('layerDepth')) g('layerDepth').value=s.layerDepth;
  if(g('useUnison')) g('useUnison').checked = s.unison!==false;
  if(g('megaSpotlight')) g('megaSpotlight').checked = s.megaSpot!==false;
  if(s.moves) Object.entries(s.moves).forEach(([k,v])=>{
    const el=g('mv'+k[0].toUpperCase()+k.slice(1)); if(el) el.checked=v!==false;
  });
  if(s.seed && g('seedBox')) g('seedBox').value=s.seed;
  const note=g('restoreNote');
  if(note && s.lyrics) note.classList.remove('hidden');
}
