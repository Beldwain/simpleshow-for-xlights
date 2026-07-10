/* SimpleShow — prop identification (supporting file).
   Must sit next to simpleshow-xlights.html; loaded with a plain <script src>.

   Score-based role classification: every signal (xLights DisplayAs type,
   name keywords, face definitions, submodel names, group membership,
   geometry) votes with a weight, the highest-scoring role wins, and the
   margin decides a confidence flag so the step-1 table can point the user
   at exactly the rows worth reviewing. User corrections are remembered in
   localStorage keyed by model name and re-applied on the next run. */

const AUTOSHOW_ROLE_KEY = 'autoshow.roleOverrides.v1';

function loadRoleOverrides(){
  try { return JSON.parse(localStorage.getItem(AUTOSHOW_ROLE_KEY) || '{}') || {}; }
  catch(e){ return {}; }
}
function saveRoleOverride(name, role){
  const o = loadRoleOverrides(); o[name] = role;
  try { localStorage.setItem(AUTOSHOW_ROLE_KEY, JSON.stringify(o)); } catch(e){}
}
function clearRoleOverrides(){
  try { localStorage.removeItem(AUTOSHOW_ROLE_KEY); } catch(e){}
}

/* DisplayAs is a canonical signal — these are literal xLights model types. */
const DISPLAYAS_ROLE = {
  'arches':'Arch', 'candy canes':'Candy Cane', 'icicles':'Icicles',
  'star':'Star/Topper', 'spinner':'Spinner/Wreath', 'wreath':'Spinner/Wreath',
  'circle':'Spinner/Wreath', 'sphere':'Spinner/Wreath',
  'matrix':'Matrix/Screen', 'vert matrix':'Matrix/Screen', 'horiz matrix':'Matrix/Screen',
  'window frame':'Roof/Outline',
};

/* Lexical hints over the lowercase model (or group) name.
   '__tree' resolves to Mega/Mini Tree by node count at scoring time. */
const NAME_HINTS = [
  // "forest" is deliberate naming — it must beat the DisplayAs type, because
  // ground forests are often modeled as Icicles/Custom grids for convenience
  [/forest/,                      'Forest',       7],
  [/sing|face|carol|choir|mouth/, 'Singing Face', 3],
  [/mega ?tree/,                  'Mega Tree',    4],
  [/mini ?tree|mini ?mega/,       'Mini Tree',    4],
  [/\btrees?\b/,                  '__tree',       2],
  [/\barch/,                      'Arch',         3],
  [/icicle/,                      'Icicles',      3],
  [/\bstar|star\b|\btopper/,      'Star/Topper',  3],
  [/matrix|\bp ?5\b|\bp ?10\b|panel|screen|banner|marquee/, 'Matrix/Screen', 3],
  [/window/,                      'Roof/Outline', 2],
  [/spinner|wreath|showstopper|snow ?flake/, 'Spinner/Wreath', 3],
  [/candy|\bcane/,                'Candy Cane',   3],
  [/flood|up ?light|\bwash(er)?s?\b/, 'Flood',    3],
  [/roof|outline|eave|gutter|ridge|fascia|trim|peak|soffit|border/, 'Roof/Outline', 3],
  // yard art typically held for big-moment accents (weak hint — review-flagged)
  [/\b(rein|rain)?deer\b|sleigh|peacock|penguin|angel|nativity|snowman|gingerbread|present|gift|grinch/, 'Special/Accent', 2],
  // DMX control channels & placeholder models shouldn't be sequenced at all
  [/\bnull\b/,                    'Skip',         4],
  [/\b(gobo|prism|shutters?|dimmers?|tilt|pan|zoom|frost|strobe ch|moving ?head|mh)\b/, 'Skip', 4],
];

/* Group names that *exclude* ("All No Matrix", "Not Trees") must not hint. */
const GROUP_NEGATED = /\bno[nt]?\b|non-|without|exclud/;

function nameHints(lower){
  const out = [];
  for(const [re, role, pts] of NAME_HINTS){
    const m = lower.match(re);
    if(m) out.push({role, pts, what: m[0]});
  }
  return out;
}

/* models: [{name, displayAs, parm1, parm2, x, y, hasFaceDef, submodels[]}]
   groups: [{name, members[]}] — group names hint at their members' roles.
   Mutates each model, setting role, conf ('user'|'high'|'medium'|'low'), why. */
function classifyLayout(models, groups){
  const groupHints = {};
  (groups || []).forEach(g => {
    const gName = (g.name || '').toLowerCase();
    if(GROUP_NEGATED.test(gName)) return;
    const hints = nameHints(gName).filter(h => h.role !== 'Skip');
    if(!hints.length) return;
    (g.members || []).forEach(mn => {
      const key = mn.trim();
      if(!key) return;
      (groupHints[key] = groupHints[key] || []).push(
        ...hints.map(h => ({role: h.role, pts: h.pts * 0.7, why: `in group "${g.name}"`})));
    });
  });
  const ys = models.map(m => m.y).filter(y => !isNaN(y));
  const maxY = ys.length ? Math.max(...ys) : NaN;
  models.forEach(m => scoreModelRole(m, groupHints[m.name] || [], maxY));
  const overrides = loadRoleOverrides();
  models.forEach(m => {
    if(overrides[m.name]){
      m.role = overrides[m.name];
      m.conf = 'user';
      m.why = 'saved from a previous session';
    }
  });
}

function scoreModelRole(m, extraHints, maxY){
  const n = (m.name || '').toLowerCase(), d = (m.displayAs || '').toLowerCase();
  const nodes = (m.parm1 || 0) * (m.parm2 || 0);
  const treeRole = nodes >= 400 ? 'Mega Tree' : 'Mini Tree';
  const score = {}, why = {};
  const add = (role, pts, reason) => {
    if(!role || pts <= 0) return;
    if(role === '__tree') role = treeRole;
    score[role] = (score[role] || 0) + pts;
    (why[role] = why[role] || []).push(reason);
  };

  if(d.startsWith('dmx')) add('Skip', 5, `DMX fixture "${m.displayAs}" — SimpleShow can't drive it`);
  if(m.hasFaceDef) add('Singing Face', 8, 'has a face definition');
  const subs = (m.submodels || []).map(s => (s || '').toLowerCase());
  if(subs.some(s => /mouth|eyes?\b/.test(s)))
    add('Singing Face', 4, 'has mouth/eyes submodels');

  if(d.includes('tree')){
    add(treeRole, 4, `tree type with ${nodes || '?'} nodes`);
    add(treeRole === 'Mega Tree' ? 'Mini Tree' : 'Mega Tree', 1, 'tree type');
  }
  const da = DISPLAYAS_ROLE[d];
  if(da) add(da, 5, `xLights type "${m.displayAs}"`);
  if(/poly line|single line/.test(d)){
    add('Roof/Outline', 2, 'line model');
    if(!isNaN(m.y) && !isNaN(maxY) && maxY > 0 && m.y >= 0.7 * maxY)
      add('Roof/Outline', 1, 'sits at the roofline');
  }
  if(nodes === 1) add('Flood', 2, 'single node');

  nameHints(n).forEach(h => add(h.role, h.pts, `name matches "${h.what}"`));
  extraHints.forEach(h => add(h.role, h.pts, h.why));

  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if(!ranked.length || ranked[0][1] < 2){
    m.role = 'Generic Prop'; m.conf = 'low';
    m.why = 'no strong signals — defaulted to Generic Prop';
    return;
  }
  const [role, pts] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 0;
  m.role = role;
  m.conf = (pts >= 5 && pts - second >= 3) ? 'high'
         : (pts >= 3 && pts - second >= 1.5) ? 'medium' : 'low';
  m.why = [...new Set(why[role] || [])].join('; ');
}
