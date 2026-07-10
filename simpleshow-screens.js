/* SimpleShow — screens: original ISF shaders + on-screen karaoke.
   Matrices/screens can run any of ~20 original shaders (exported as ISF .fs
   files xLights' Shader effect loads) and/or karaoke text built from the
   synced lyrics — scrolling, bouncing ball, highlighted, highlighted with
   outline. The in-app preview runs the SAME GLSL through WebGL and the same
   text layout on a 2D canvas, so what you see is what xLights renders.
   Uses globals from the main file at runtime: S, PALETTES, esc, hashF. */

/* ================= the shader collection =================
   One GLSL body per shader serves both the WebGL preview and the ISF export.
   tags drive the section rotation (quiet→calm, verse→mid, build/chorus→hot).
   fixed:true = signature colors; otherwise hue1/hue2 inputs are prefilled
   from the active palette in the preview and exposed as sliders in xLights. */
const SHADER_PRELUDE=`
vec3 hsv(float h,float s,float v){vec3 k=abs(fract(vec3(h)+vec3(0.,.6667,.3333))*6.-3.)-1.;return v*mix(vec3(1.),clamp(k,0.,1.),s);}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise2(p);p*=2.03;a*=.55;}return v;}
`;
const SHADERS=[
{id:'aurora', name:'Aurora Veil', tags:['calm'], fixed:true, inputs:[{name:'speed',def:0.5},{name:'height',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.2+speed*.6);
  vec3 col=vec3(.01,.02,.06);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float x=uv.x*3.+fi*1.7;
    float band=fbm(vec2(x-t*(.6+fi*.3), fi*7.));
    float y0=.25+.45*band+.15*fi*height;
    float d=abs(uv.y-y0);
    float glow=exp(-d*d*60.)* (.6+.4*fbm(vec2(x*2.+t,fi)));
    col+=glow*mix(vec3(.1,.9,.45),vec3(.5,.2,.9),fract(band+fi*.33));
  }
  col+=step(.997,hash21(floor(gl_FragCoord.xy)))*vec3(.8);
  gl_FragColor=vec4(col,1.);
}`},
{id:'embers', name:'Ember Drift', tags:['calm','mid'], fixed:true, inputs:[{name:'speed',def:0.5},{name:'density',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.3+speed*.7);
  vec3 col=mix(vec3(.10,.02,.0),vec3(.02,.0,.02),uv.y);
  col+=vec3(.5,.15,.02)*exp(-uv.y*3.)* (.7+.3*noise2(vec2(uv.x*6.,t)));
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 g=vec2(8.+fi*4.,6.+fi*3.);
    vec2 p=uv*g; p.y-=t*(1.+fi*.8); p.x+=sin(uv.y*8.+t+fi)*.2;
    vec2 id=floor(p); vec2 f=fract(p)-.5;
    float r=hash21(id+fi*9.);
    if(r<.25+density*.4){
      float s=length(f-vec2((r-.5)*.6,0.));
      float tw=.5+.5*sin(t*6.+r*40.);
      col+=exp(-s*s*40.)*tw*mix(vec3(1.,.5,.1),vec3(1.,.85,.3),r);
    }
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'snowdepth', name:'Snowfall Depth', tags:['calm'], fixed:true, inputs:[{name:'speed',def:0.4},{name:'wind',def:0.3}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.3+speed*.5);
  vec3 col=mix(vec3(.02,.04,.12),vec3(.05,.09,.2),1.-uv.y);
  for(int i=0;i<3;i++){
    float fi=float(i); float depth=1.-fi*.28;
    vec2 g=vec2(7.+fi*5., 5.+fi*4.);
    vec2 p=uv*g; p.y+=t*(1.6-fi*.4); p.x+=sin(uv.y*4.+t*.7+fi*2.)*wind;
    vec2 id=floor(p), f=fract(p)-.5;
    float r=hash21(id+fi*31.);
    vec2 o=vec2(r-.5,fract(r*7.)-.5)*.7;
    float d=length(f-o);
    col+=exp(-d*d*(90.+fi*120.))*depth*vec3(.9,.95,1.);
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'fireworks', name:'Fireworks Bloom', tags:['hot'], fixed:true, inputs:[{name:'rate',def:0.5},{name:'trail',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  vec3 col=vec3(.01,.01,.04)*(1.-uv.y*.5);
  float t=TIME*(.5+rate*.8);
  for(int b=0;b<3;b++){
    float fb=float(b);
    float cyc=floor(t+fb*.37); float ph=fract(t+fb*.37);
    vec2 c=vec2(.3+1.1*hash21(vec2(cyc,fb)), .35+.45*hash21(vec2(fb,cyc)));
    vec3 tint=hsv(hash21(vec2(cyc*3.1,fb)),.75,1.);
    for(int i=0;i<24;i++){
      float fi=float(i);
      float a=fi/24.*6.2832+hash21(vec2(cyc,fi))*.3;
      float sp=.25+.15*hash21(vec2(fi,cyc));
      vec2 p=c+vec2(cos(a),sin(a))*sp*ph - vec2(0.,.12*ph*ph);
      float d=length(uv-p);
      col+=tint*exp(-d*d*900.)*(1.-ph)*(1.+trail);
    }
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'candytwist', name:'Candy Twist', tags:['mid','hot'], inputs:[{name:'hue1',def:0.0},{name:'hue2',def:0.93},{name:'speed',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.3+speed*.7);
  float a=atan(uv.y,uv.x), r=length(uv);
  float s=fract((a/6.2832)*6. + r*2.5 - t*.6 + .12*sin(t+r*9.));
  vec3 c1=hsv(hue1,.85,1.), c2=hsv(hue2,.5,1.);
  vec3 col=(s<.33)?c1:(s<.66)?vec3(1.):c2;
  col*= .75+.35*smoothstep(.0,.5,r) - r*.35;
  gl_FragColor=vec4(col,1.);
}`},
{id:'kaleido', name:'Kaleido Bloom', tags:['mid'], inputs:[{name:'hue1',def:0.55},{name:'hue2',def:0.8},{name:'speed',def:0.4}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.2+speed*.5);
  float a=atan(uv.y,uv.x), r=length(uv);
  a=abs(mod(a,6.2832/6.)-6.2832/12.);
  vec2 p=vec2(cos(a),sin(a))*r;
  float v=fbm(p*5.+vec2(t,-t*.7));
  float w=fbm(p*9.-t*.5);
  vec3 col=mix(hsv(hue1,.8,1.),hsv(hue2,.8,1.),v)*smoothstep(.15,.75,v+w*.4);
  col+=vec3(1.,.95,.8)*exp(-r*r*3.)*.4*(1.+.3*sin(t*3.));
  gl_FragColor=vec4(col,1.);
}`},
{id:'lava', name:'Lava Lounge', tags:['calm','mid'], inputs:[{name:'hue1',def:0.02},{name:'hue2',def:0.72},{name:'speed',def:0.35}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.2+speed*.5);
  float f=0.;
  for(int i=0;i<5;i++){
    float fi=float(i);
    vec2 c=vec2(.5+.4*sin(t*(.4+fi*.13)+fi*2.1), .5+.4*cos(t*(.3+fi*.17)+fi*1.3));
    c.x*=RENDERSIZE.x/RENDERSIZE.y;
    f+=.045/max(.001,dot(uv-c,uv-c));
  }
  float m=smoothstep(1.2,2.2,f);
  vec3 col=mix(hsv(hue2,.7,.25),hsv(hue1,.85,1.),m);
  col+=vec3(1.)*smoothstep(3.2,5.,f)*.35;
  gl_FragColor=vec4(col,1.);
}`},
{id:'starwarp', name:'Starfield Warp', tags:['hot'], inputs:[{name:'hue1',def:0.6},{name:'speed',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.4+speed*1.2);
  vec3 col=vec3(0.);
  float a=atan(uv.y,uv.x), r=length(uv)+.05;
  for(int i=0;i<3;i++){
    float fi=float(i);
    float ray=floor((a/6.2832+.5)*48.)+fi*97.;
    float rnd=hash21(vec2(ray,fi));
    float d=fract(rnd*9.+t*(.4+rnd)+r*-1.5);
    float star=exp(-pow((d-.5)*14.,2.))*smoothstep(.05,.4,r);
    col+=star*mix(vec3(1.),hsv(hue1,.7,1.),rnd)*(.4+.6*rnd);
  }
  col+=hsv(hue1,.5,1.)*exp(-r*r*8.)*.5;
  gl_FragColor=vec4(col,1.);
}`},
{id:'bokeh', name:'Bokeh Lights', tags:['calm'], inputs:[{name:'hue1',def:0.12},{name:'hue2',def:0.55},{name:'speed',def:0.3}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.15+speed*.4);
  vec3 col=vec3(.02,.02,.05);
  for(int i=0;i<12;i++){
    float fi=float(i);
    float r1=hash21(vec2(fi,3.7)), r2=hash21(vec2(fi,9.1));
    vec2 c=vec2(fract(r1+t*(.06+r2*.12))*1.9-.2, .15+.7*fract(r2+t*(.04+r1*.09)));
    float rad=.06+.1*r2;
    float d=length(uv-c);
    float disc=smoothstep(rad,rad*.7,d)*(.25+.3*r1);
    col+=disc*mix(hsv(hue1,.7,1.),hsv(hue2,.7,1.),r2);
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'ripple', name:'Ripple Pond', tags:['calm'], inputs:[{name:'hue1',def:0.5},{name:'hue2',def:0.62},{name:'speed',def:0.4}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.4+speed*.8);
  float v=0.;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 c=vec2(.3+.5*hash21(vec2(fi,1.)), .3+.5*hash21(vec2(fi,2.)));
    c+= .12*vec2(sin(t*.3+fi*2.),cos(t*.23+fi));
    c.x*=RENDERSIZE.x/RENDERSIZE.y;
    v+=sin(length(uv-c)*30.-t*3.+fi*2.);
  }
  v/=3.;
  vec3 col=mix(hsv(hue2,.8,.35),hsv(hue1,.6,1.),v*.5+.5);
  col+=vec3(1.)*smoothstep(.85,1.,v)*.3;
  gl_FragColor=vec4(col,1.);
}`},
{id:'rangoli', name:'Rangoli Spin', tags:['mid'], inputs:[{name:'hue1',def:0.08},{name:'hue2',def:0.9},{name:'speed',def:0.3}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.15+speed*.35);
  float a=atan(uv.y,uv.x)+t, r=length(uv);
  float pet=cos(a*8.)*.5+.5;
  float ring=sin(r*22.-t*2.)*.5+.5;
  float m=smoothstep(.35,.65,pet*ring+.15*sin(a*16.-t*3.));
  vec3 col=mix(hsv(hue2,.85,.9),hsv(hue1,.9,1.),m);
  col+=vec3(1.,.85,.4)*exp(-pow((r-.12),2.)*300.)*.8;
  col*=smoothstep(.62,.45,r)+.15;
  gl_FragColor=vec4(col,1.);
}`},
{id:'holi', name:'Holi Splash', tags:['hot'], fixed:true, inputs:[{name:'rate',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.4+rate*.6);
  vec3 col=vec3(.05,.04,.06);
  for(int i=0;i<9;i++){
    float fi=float(i);
    float cyc=floor(t*.5+fi*.31), ph=fract(t*.5+fi*.31);
    vec2 c=vec2(.15+1.4*hash21(vec2(cyc,fi)), .15+.7*hash21(vec2(fi,cyc)));
    float rad=(.12+.22*hash21(vec2(cyc,fi*3.)))*smoothstep(0.,.25,ph);
    float d=length(uv-c)+fbm(uv*14.+fi)*.06;
    float blot=smoothstep(rad,rad*.6,d)*(1.-smoothstep(.6,1.,ph));
    col=mix(col,hsv(hash21(vec2(cyc,fi*7.)),.95,1.),blot);
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'witchlight', name:'Witchlight Fog', tags:['calm','mid'], inputs:[{name:'hue1',def:0.33},{name:'hue2',def:0.78},{name:'speed',def:0.3}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.15+speed*.35);
  vec2 q=vec2(fbm(uv*3.+t*.4), fbm(uv*3.-t*.3));
  float f=fbm(uv*4.+q*1.5);
  vec3 col=mix(vec3(.01,.02,.03), hsv(hue1,.8,.5), smoothstep(.3,.8,f));
  col=mix(col, hsv(hue2,.7,.7), smoothstep(.6,.95,fbm(uv*6.-q*2.+t*.2))*.6);
  float wisp=exp(-pow((uv.y-.4-.25*sin(uv.x*4.+t*2.))*8.,2.));
  col+=hsv(hue1,.5,1.)*wisp*.25;
  col*=1.-.6*length(uv-.5);
  gl_FragColor=vec4(col,1.);
}`},
{id:'heartpulse', name:'Heart Pulse', tags:['mid'], inputs:[{name:'hue1',def:0.98},{name:'hue2',def:0.9},{name:'speed',def:0.5}], glsl:`
void main(){
  vec2 uv=(gl_FragCoord.xy/RENDERSIZE-.5)*2.2; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.5+speed*.8);
  float beat=1.+.14*exp(-fract(t)*4.)*sin(fract(t)*30.);
  vec2 p=uv/beat; p.y-=.1;
  p.y+=.5*sqrt(abs(p.x))*.8;
  float d=length(p)-.62;
  vec3 col=mix(hsv(hue2,.5,.12),vec3(.03),smoothstep(.0,.4,d));
  col=mix(hsv(hue1,.9,1.),col,smoothstep(-.02,.02,d));
  col+=hsv(hue1,.6,1.)*exp(-d*d*30.)*.4;
  gl_FragColor=vec4(col,1.);
}`},
{id:'shamrock', name:'Shamrock Spiral', tags:['mid'], inputs:[{name:'hue1',def:0.36},{name:'hue2',def:0.30},{name:'speed',def:0.35}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.2+speed*.4);
  float a=atan(uv.y,uv.x), r=length(uv);
  float arm=fract(a/6.2832*3.+r*1.8-t*.5);
  float lobe=cos((a-t)*9.)*.5+.5;
  float m=smoothstep(.4,.7,(1.-arm)*lobe+.2);
  vec3 col=mix(hsv(hue2,.9,.25),hsv(hue1,.85,.95),m);
  col+=vec3(1.,.95,.6)*exp(-r*r*14.)*.25*(1.+.4*sin(t*4.));
  gl_FragColor=vec4(col,1.);
}`},
{id:'flagwave', name:'Flag Wave', tags:['calm','mid'], inputs:[{name:'hue1',def:0.0},{name:'hue2',def:0.6},{name:'hue3',def:0.33},{name:'whiteMid',def:1.0}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*.8;
  float wave=sin(uv.x*7.-t*2.)*.05*(uv.x*.8+.2);
  float y=uv.y+wave;
  vec3 c1=hsv(hue1,.9,1.), c3=hsv(hue3,.9,.85);
  vec3 c2=(whiteMid>.5)?vec3(1.):hsv(hue2,.85,1.);
  vec3 col=(y>.6667)?c1:(y>.3333)?c2:c3;
  col*= .8+.35*sin(uv.x*7.-t*2.+1.3);
  gl_FragColor=vec4(col,1.);
}`},
{id:'tinsel', name:'Tinsel Rain', tags:['mid','hot'], inputs:[{name:'hue1',def:0.12},{name:'speed',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.5+speed);
  vec3 col=vec3(.02,.02,.03);
  for(int i=0;i<2;i++){
    float fi=float(i);
    float cols=26.+fi*18.;
    float cx=floor(uv.x*cols);
    float r=hash21(vec2(cx,fi));
    float y=fract(uv.y+t*(.4+r*.8)+r*7.);
    float streak=exp(-pow((y-.5)*4.,2.))*smoothstep(1.,.0,abs(fract(uv.x*cols)-.5)*3.);
    float sparkle=step(.985,hash21(vec2(cx,floor(TIME*12.)+fi)))*2.;
    col+=(streak*.6+sparkle*streak)*hsv(hue1+r*.06,.55,1.)*(.5+.5*r);
  }
  gl_FragColor=vec4(col,1.);
}`},
{id:'nebula', name:'Nebula Drift', tags:['calm'], inputs:[{name:'hue1',def:0.7},{name:'hue2',def:0.55},{name:'speed',def:0.25}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE; float t=TIME*(.1+speed*.25);
  vec2 q=vec2(fbm(uv*2.5+t), fbm(uv*2.5-t*.7));
  vec2 w=uv*3.+q*1.8;
  float f=fbm(w);
  vec3 col=mix(vec3(.01,.01,.04), hsv(hue1,.75,.8), smoothstep(.25,.85,f));
  col=mix(col, hsv(hue2,.6,1.), smoothstep(.55,.95,fbm(w*1.7+t))*.5);
  col+=vec3(1.)*step(.996,hash21(floor(gl_FragCoord.xy)))*.8;
  gl_FragColor=vec4(col,1.);
}`},
{id:'discoprism', name:'Disco Prism', tags:['hot'], inputs:[{name:'hue1',def:0.0},{name:'hue2',def:0.66},{name:'speed',def:0.6}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.4+speed*.9);
  float a=atan(uv.y,uv.x)+t, r=length(uv);
  float w=floor(fract(a/6.2832)*10.);
  vec3 col=hsv(mix(hue1,hue2,fract(w*.37+floor(t*2.)*.21)),.9,1.);
  col*= .55+.45*step(.5,fract(a/6.2832*10.));
  col*= smoothstep(.75,.2,r);
  col+=vec3(1.)*exp(-r*r*40.)*(.5+.5*sin(t*8.));
  gl_FragColor=vec4(col,1.);
}`},
{id:'geotunnel', name:'Geo Tunnel', tags:['hot'], inputs:[{name:'hue1',def:0.5},{name:'hue2',def:0.83},{name:'speed',def:0.5}], glsl:`
void main(){
  vec2 uv=gl_FragCoord.xy/RENDERSIZE-.5; uv.x*=RENDERSIZE.x/RENDERSIZE.y;
  float t=TIME*(.4+speed*.9);
  float ang=t*.2;
  uv=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*uv;
  float d=max(abs(uv.x),abs(uv.y));
  float z=fract(-log(max(d,.02))*1.2+t*.8);
  float ring=smoothstep(.06,.0,abs(z-.5)-.28);
  float edge=smoothstep(.02,.0,abs(abs(uv.x)-abs(uv.y)))*.7;
  vec3 col=ring*hsv(mix(hue1,hue2,fract(floor(-log(max(d,.02))*1.2+t*.8)*.37)),.85,1.);
  col+=edge*hsv(hue2,.6,1.)*smoothstep(.6,.1,d);
  gl_FragColor=vec4(col,1.);
}`},
];

/* ================= ISF export (the .fs pack) ================= */
function shaderToISF(sh){
  const inputs=(sh.inputs||[]).map(i=>({NAME:i.name, TYPE:'float', DEFAULT:i.def, MIN:i.min??0, MAX:i.max??1}));
  const header={DESCRIPTION:`${sh.name} — an original SimpleShow shader`, CREDIT:'SimpleShow',
    CATEGORIES:['SimpleShow'], INPUTS:inputs, ISFVSN:'2'};
  return `/*${JSON.stringify(header,null,1)}*/\n`+SHADER_PRELUDE+sh.glsl.trim()+'\n';
}
/* stored-method zip with real CRC32s, so any unzip tool accepts the pack */
const CRC_TABLE=(()=>{ const t=new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
  return t; })();
function crc32(bytes){
  let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
/* stored-method zip from [{name, data:Uint8Array}] — real CRC32s */
function zipStore(files){
  const enc=new TextEncoder();
  const parts=[], central=[]; let off=0;
  const u16=v=>[v&255,(v>>8)&255], u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255];
  files.forEach(f=>{
    const nameB=enc.encode(f.name), crc=crc32(f.data);
    const local=new Uint8Array([0x50,0x4B,3,4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(nameB.length), ...u16(0)]);
    parts.push(local,nameB,f.data);
    central.push(new Uint8Array([0x50,0x4B,1,2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(nameB.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nameB);
    off+=local.length+nameB.length+f.data.length;
  });
  let cdSize=0; central.forEach(c=>cdSize+=c.length);
  const end=new Uint8Array([0x50,0x4B,5,6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(off), ...u16(0)]);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
function shaderFileName(sh){ return `Shaders/SimpleShow/${sh.name.replace(/[^\w ]/g,'')}.fs`; }
function buildShaderZip(){
  const enc=new TextEncoder();
  return zipStore(SHADERS.map(sh=>({name:shaderFileName(sh), data:enc.encode(shaderToISF(sh))})));
}
function downloadZipBlob(blob, fname){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=fname; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function downloadShaderPack(){ downloadZipBlob(buildShaderZip(),'SimpleShow-Shaders.zip'); }
/* the whole show in proper show-folder layout: xsq at the root, only the
   shaders this sequence actually uses, and a short read-me */
function usedShaderFiles(){
  const used=new Set();
  if(S.sequence&&S.sequence.plan) Object.values(S.sequence.plan).flat().forEach(row=>{
    const m=/Shaders\/SimpleShow\/([^,=]+\.fs)/.exec(row[2]||'');
    if(m) used.add(m[1]);
  });
  return SHADERS.filter(sh=>used.has(shaderFileName(sh).split('/').pop()));
}
function buildShowBundle(){
  if(!S.sequence) return null;
  const enc=new TextEncoder();
  const base=(S.audio&&S.audio.name?S.audio.name.replace(/\.[a-z0-9]+$/i,''):'show');
  const used=usedShaderFiles();
  const files=[{name:`${base}_simpleshow.xsq`, data:enc.encode(buildXSQ())}];
  used.forEach(sh=>files.push({name:shaderFileName(sh), data:enc.encode(shaderToISF(sh))}));
  files.push({name:'README-SimpleShow.txt', data:enc.encode(
`SimpleShow show bundle — ${base}

1. Unzip this whole zip into your xLights SHOW FOLDER (the folder with
   xlights_rgbeffects.xml). Keep the folder structure as-is:
     ${base}_simpleshow.xsq            <- the sequence
${used.length?`     Shaders/SimpleShow/*.fs           <- the ${used.length} shader(s) this show uses\n`:''}2. Open the .xsq in xLights. When it asks for the audio, point it at
   your song file.
3. Render/play. If xLights asks about a missing shader file, browse to
   the Shaders/SimpleShow folder you just unzipped — once per shader.

Made with SimpleShow.`)});
  return zipStore(files);
}
function downloadShowBundle(){
  const blob=buildShowBundle();
  if(!blob){ alert('Generate the show first (step 4).'); return; }
  const base=(S.audio&&S.audio.name?S.audio.name.replace(/\.[a-z0-9]+$/i,''):'show');
  downloadZipBlob(blob, base+'_simpleshow_bundle.zip');
}

/* ================= WebGL preview runtime ================= */
let _glState=null;
function shaderGL(){
  if(_glState!==null) return _glState;
  const canvas=document.createElement('canvas');
  canvas.width=64; canvas.height=40;
  const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});
  if(!gl){ _glState=false; return false; }
  const vs=gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
  gl.compileShader(vs);
  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
  _glState={canvas, gl, vs, programs:{}};
  return _glState;
}
function compileShaderProgram(sh){
  const st=shaderGL(); if(!st) return null;
  if(st.programs[sh.id]!==undefined) return st.programs[sh.id];
  const {gl,vs}=st;
  const uniforms=(sh.inputs||[]).map(i=>`uniform float ${i.name};`).join('');
  const src=`precision mediump float;uniform float TIME;uniform vec2 RENDERSIZE;${uniforms}`+SHADER_PRELUDE+sh.glsl;
  const fs=gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs,src); gl.compileShader(fs);
  if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS)){
    console.warn('shader',sh.id,gl.getShaderInfoLog(fs));
    st.programs[sh.id]=null; return null;
  }
  const pr=gl.createProgram();
  gl.attachShader(pr,vs); gl.attachShader(pr,fs); gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){ st.programs[sh.id]=null; return null; }
  st.programs[sh.id]=pr;
  return pr;
}
/* Render one shader frame; returns {data,w,h} ImageData-ish or null. hue
   inputs come from the active palette unless the shader has fixed colors. */
function renderShaderFrame(sh, t, palette){
  const st=shaderGL(); if(!st) return null;
  const pr=compileShaderProgram(sh); if(!pr) return null;
  const {gl,canvas}=st;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.useProgram(pr);
  const loc=n=>gl.getUniformLocation(pr,n);
  gl.uniform1f(loc('TIME'),t);
  gl.uniform2f(loc('RENDERSIZE'),canvas.width,canvas.height);
  const hues=paletteHues(palette);
  (sh.inputs||[]).forEach((i,k)=>{
    let v=i.def;
    if(!sh.fixed){
      if(i.name==='hue1') v=hues[0];
      else if(i.name==='hue2') v=hues[1];
      else if(i.name==='hue3') v=hues[2]!==undefined?hues[2]:i.def;
    }
    gl.uniform1f(loc(i.name),v);
  });
  const p=gl.getAttribLocation(pr,'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const px=new Uint8Array(canvas.width*canvas.height*4);
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,px);
  return {data:px, w:canvas.width, h:canvas.height, flipY:true};
}
function hexHue(hex){
  const v=parseInt((hex||'#FF0000').slice(1),16);
  const r=((v>>16)&255)/255, g=((v>>8)&255)/255, b=(v&255)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
  if(mx===mn) return 0;
  let h= mx===r ? (g-b)/(mx-mn) : mx===g ? 2+(b-r)/(mx-mn) : 4+(r-g)/(mx-mn);
  return ((h*60+360)%360)/360;
}
function paletteHues(P){
  if(!P) return [0,0.6,0.33];
  const cols=[...(P.A||[]),...(P.C||[])].filter(c=>c&&c!=='#FFFFFF');
  const h1=hexHue(cols[0]||'#FF0000'), h2=hexHue(cols[1]||cols[0]||'#00FF00');
  return [h1, Math.abs(h2-h1)<0.05?(h1+0.33)%1:h2, hexHue(cols[2]||'#FFFFFF')];
}

/* ================= karaoke: layout + preview + export ================= */
/* xLights bitmap fonts have fixed cells, so word X positions are exact */
const KAR_FONTS=[
  {name:'5-5x8', w:5, h:8, adv:6},
  {name:'6-5x6 Thin', w:5, h:6, adv:6},
  {name:'8-8x8 Thin', w:8, h:8, adv:9},
  {name:'10-12x12 Bold', w:12, h:12, adv:13},
];
function screenGrid(m){ // best-guess pixel grid of a matrix prop
  const a=m.parm1||0, b=m.parm2||0;
  let cols=Math.max(a,b)||32, rows=Math.min(a,b)||16;
  if(m.customW&&m.customH){ cols=m.customW; rows=m.customH; }
  return {cols,rows};
}
function karFontFor(m, line){
  const {cols,rows}=screenGrid(m);
  const chars=line.length;
  for(let i=KAR_FONTS.length-1;i>=0;i--){
    const f=KAR_FONTS[i];
    if(f.h<=rows && chars*f.adv<=cols) return {font:f, fits:true};
  }
  return {font:KAR_FONTS[Math.min(1,KAR_FONTS.length-1)], fits:false}; // too wide: scroll it
}
/* per-word char offsets in a line (spaces count one cell) */
function karWordOffsets(line){
  const out=[]; let ch=0;
  line.words.forEach(w=>{ out.push({word:w, chars:ch}); ch+=w.text.length+1; });
  return {offsets:out, total:Math.max(0,ch-1)};
}
const KAR_MODES={scroll:'Scrolling', ball:'Bouncing ball', hilite:'Highlighted', outline:'Highlighted + outline'};
/* Build the xsq placements for one screen. Returns [{layer,effect,settings,pal,s,e}] */
function karPlacements(m, mode, lines, accent, baseLayer){
  const out=[];
  const T=(text,font,x,y,extra)=>
    `E_CHECKBOX_TextToCenter=0,E_CHECKBOX_Text_PixelOffsets=1,E_CHOICE_Text_Count=none,`+
    `E_CHOICE_Text_Dir=${extra&&extra.dir||'none'},E_CHOICE_Text_Effect=normal,E_CHOICE_Text_Font=${font.name},`+
    `E_FILEPICKERCTRL_Text_File=,E_SLIDER_Text_XEnd=${x},E_SLIDER_Text_XStart=${x},`+
    `E_SLIDER_Text_YEnd=${y},E_SLIDER_Text_YStart=${y},E_TEXTCTRL_Text=${text.replace(/,/g,';')},`+
    `E_TEXTCTRL_Text_Speed=${extra&&extra.speed||15}`;
  const {cols}=screenGrid(m);
  lines.forEach(l=>{
    const text=l.text;
    const {font,fits}=karFontFor(m,text);
    const s=l.start, e=l.end;
    if(mode==='scroll' || !fits){
      out.push({layer:baseLayer, effect:'Text', settings:T(text,font,0,0,{dir:'left',speed:Math.max(8,Math.min(30,Math.round(text.length*font.adv/Math.max(1,e-s)/2)))}), pal:['#FFFFFF'], s, e});
      return;
    }
    const x0=Math.max(0,Math.floor((cols-text.length*font.adv)/2));
    out.push({layer:baseLayer, effect:'Text', settings:T(text,font,x0,0), pal:['#FFFFFF'], s, e});
    if(mode==='outline')
      out.push({layer:baseLayer+1, effect:'Text', settings:T(text,font,x0+1,1), pal:['#000000'], s, e});
    const wo=karWordOffsets(l);
    wo.offsets.forEach(({word,chars})=>{
      const wx=x0+chars*font.adv;
      if(mode==='hilite'||mode==='outline'||mode==='ball')
        out.push({layer:baseLayer+2, effect:'Text', settings:T(word.text,font,wx,0), pal:[accent], s:word.start, e:word.end});
      if(mode==='ball'){
        const bx=wx+Math.floor(word.text.length*font.adv/2)-Math.floor(font.adv/2);
        out.push({layer:baseLayer+3, effect:'Text', settings:T('*',font,bx,-font.h), pal:[accent], s:word.start, e:word.end});
      }
    });
  });
  return out;
}
/* preview: draw the same karaoke frame on a 2D canvas at screen resolution */
let _karCanvas=null;
function renderKaraokeFrame(m, mode, t, accent, bg){
  if(!S.lyrics) return null;
  const line=S.lyrics.lines.find(l=>t>=l.start&&t<l.end);
  const {cols,rows}=screenGrid(m);
  if(!_karCanvas) _karCanvas=document.createElement('canvas');
  const c=_karCanvas; c.width=cols; c.height=rows;
  const x=c.getContext('2d');
  if(bg){ x.fillStyle=bg; x.fillRect(0,0,cols,rows); }
  if(line){
    const {font,fits}=karFontFor(m,line.text);
    const scroll=(mode==='scroll'||!fits);
    x.font=`bold ${font.h}px monospace`; x.textBaseline='middle';
    const y=Math.floor(rows/2);
    const wo=karWordOffsets(line);
    let x0;
    if(scroll){
      const total=line.text.length*font.adv;
      const pr=(t-line.start)/Math.max(0.001,line.end-line.start);
      x0=Math.round(cols-(cols+total)*pr);
    } else x0=Math.max(0,Math.floor((cols-line.text.length*font.adv)/2));
    const word=line.words.find(w=>t>=w.start&&t<w.end);
    if(mode==='outline'&&!scroll){ x.fillStyle='#000';
      wo.offsets.forEach(({word:w,chars})=>{ const wx=x0+chars*font.adv;
        for(let ci=0;ci<w.text.length;ci++) x.fillText(w.text[ci],wx+ci*font.adv+1,y+1); }); }
    wo.offsets.forEach(({word:w,chars})=>{
      const wx=x0+chars*font.adv;
      x.fillStyle=(!scroll&&(mode!=='scroll')&&w===word)?accent:'#FFFFFF';
      for(let ci=0;ci<w.text.length;ci++) x.fillText(w.text[ci],wx+ci*font.adv,y);
      if(mode==='ball'&&w===word&&!scroll){
        x.fillStyle=accent;
        const bx=wx+w.text.length*font.adv/2;
        const bounce=Math.abs(Math.sin((t-w.start)/Math.max(0.05,w.end-w.start)*Math.PI));
        x.beginPath(); x.arc(bx,y-font.h+ (1-bounce)*3,1.6,0,7); x.fill();
      }
    });
  }
  const img=x.getImageData(0,0,cols,rows);
  return {data:img.data, w:cols, h:rows, flipY:false};
}

/* ================= per-screen config + UI ================= */
const AUTOSHOW_SCREENS_KEY='autoshow.screens.v1';
function screenConfig(){
  if(S._screenCfg) return S._screenCfg;
  try{ S._screenCfg=JSON.parse(localStorage.getItem(AUTOSHOW_SCREENS_KEY)||'{}'); }
  catch(e){ S._screenCfg={}; }
  return S._screenCfg;
}
function saveScreenConfig(){
  try{ localStorage.setItem(AUTOSHOW_SCREENS_KEY, JSON.stringify(S._screenCfg||{})); }catch(e){}
}
function screenModeOf(m){
  const c=screenConfig()[m.name]||{};
  return {mode:c.mode||'choreo', kar:c.kar||'hilite'};
}
function selectedShaders(){
  const c=screenConfig();
  const sel=Array.isArray(c._shaders)?c._shaders.filter(id=>SHADERS.some(s=>s.id===id)):null;
  return (sel&&sel.length)?sel:SHADERS.map(s=>s.id);
}
function setScreenMode(name,mode){ const c=screenConfig(); (c[name]=c[name]||{}).mode=mode; saveScreenConfig(); renderScreensCard(); }
function setScreenKar(name,kar){ const c=screenConfig(); (c[name]=c[name]||{}).kar=kar; saveScreenConfig(); }
function toggleShaderSel(id){
  const c=screenConfig();
  let sel=Array.isArray(c._shaders)&&c._shaders.length?c._shaders:SHADERS.map(s=>s.id);
  sel=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id];
  c._shaders=sel.length?sel:SHADERS.map(s=>s.id);
  saveScreenConfig(); renderScreensCard();
}
function renderScreensCard(){
  const el=document.getElementById('screensCard'); if(!el) return;
  const screens=S.models.filter(m=>m.role==='Matrix/Screen');
  if(!screens.length){ el.style.display='none'; return; }
  el.style.display='';
  const sel=selectedShaders();
  const rows=screens.map(m=>{
    const {mode,kar}=screenModeOf(m);
    return `<div class="row" style="align-items:center;margin:3px 0">
      <span style="min-width:160px">${esc(m.name)}</span>
      <select onchange="setScreenMode('${esc(m.name)}',this.value)">
        <option value="choreo" ${mode==='choreo'?'selected':''}>Choreography effects</option>
        <option value="shaders" ${mode==='shaders'?'selected':''}>Shader graphics</option>
        <option value="karaoke" ${mode==='karaoke'?'selected':''}>Karaoke words</option>
        <option value="both" ${mode==='both'?'selected':''}>Karaoke over shaders</option>
      </select>
      <select onchange="setScreenKar('${esc(m.name)}',this.value)" ${(mode==='karaoke'||mode==='both')?'':'disabled'}>
        ${Object.entries(KAR_MODES).map(([k,v])=>`<option value="${k}" ${kar===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  const chips=SHADERS.map(sh=>`<label class="chip" style="cursor:pointer;margin:2px;display:inline-block;border-color:${sel.includes(sh.id)?'var(--bulb-gold)':'var(--line)'};opacity:${sel.includes(sh.id)?1:0.45}">
      <input type="checkbox" style="display:none" ${sel.includes(sh.id)?'checked':''} onchange="toggleShaderSel('${sh.id}')">${esc(sh.name)}${sh.fixed?'':' 🎨'}</label>`).join('');
  el.innerHTML=`<h3>Screens &amp; matrices</h3>
    <p class="note">Each screen can run the regular choreography, one of ${SHADERS.length} original shaders (🎨 = follows your palette), the karaoke words, or karaoke over a dimmed shader. <b>For shaders in xLights:</b> download the pack and unzip it into your show folder — the sequence points at <code>Shaders/SimpleShow/…​.fs</code>; if xLights asks, point it there once.</p>
    ${rows}
    <div style="margin-top:8px">${chips}</div>
    <div class="row" style="margin-top:8px;align-items:center">
      <button class="btn small ghost" onclick="downloadShaderPack()">⬇ Download shader pack (.zip)</button>
      <span class="timeline" style="color:var(--ink-dim)">${SHADERS.length} ISF shaders for the xLights Shader effect</span>
    </div>`;
}

/* ================= choreography-time placement builders ================= */
/* seeded shader rotation: tag by section kind, honoring the user's selection */
function shaderForSection(kind, idx, seedF){
  const want=kind==='quiet'?'calm':(kind==='verse'?'mid':'hot');
  const sel=selectedShaders().map(id=>SHADERS.find(s=>s.id===id)).filter(Boolean);
  let pool=sel.filter(s=>s.tags.includes(want));
  if(!pool.length) pool=sel;
  return pool[Math.floor(seedF*9973+idx)%pool.length];
}
function shaderSettings(sh, kind){
  const speed=kind==='chorus'?140:(kind==='build'?120:(kind==='verse'?100:70));
  const sliders=(sh.inputs||[]).map(i=>{
    let v=i.def;
    if(!sh.fixed){
      const hues=paletteHues(PALETTES[S.sequence?S.sequence.style:'traditional']||PALETTES.traditional);
      if(i.name==='hue1') v=hues[0]; else if(i.name==='hue2') v=hues[1]; else if(i.name==='hue3') v=hues[2];
    }
    return `E_SLIDER_SHADERXYZZY_${i.name}=${Math.round(v*100)}`;
  }).join(',');
  return `E_0FILEPICKERCTRL_IFS=Shaders/SimpleShow/${sh.name.replace(/[^\w ]/g,'')}.fs,`+
    (sliders?sliders+',':'')+`E_SLIDER_Shader_Speed=${speed},E_TEXTCTRL_Shader_LeadIn=0`;
}
/* Build all screen placements for the plan. Called from generateShow. */
function screenPlacements(A, P, ms){
  const out={};   // modelName -> effect rows [layer,effect,settings,palette,s,e]
  const screens=S.models.filter(m=>m.role==='Matrix/Screen');
  screens.forEach(m=>{
    const {mode,kar}=screenModeOf(m);
    if(mode==='choreo') return;
    const rows=[];
    const seedF=(typeof hashF==='function')?hashF(m.name,42):0.5;
    if(mode==='shaders'||mode==='both'){
      A.sections.forEach((sec,i)=>{
        const sh=shaderForSection(sec.kind,i,seedF);
        const dim=mode==='both'?',C_SLIDER_Brightness=40':'';
        rows.push([0,'Shader',shaderSettings(sh,sec.kind)+dim,['#FFFFFF'],ms(sec.start),ms(sec.end)]);
      });
    }
    if((mode==='karaoke'||mode==='both') && S.lyrics && S.lyrics.lines.length){
      karPlacements(m,kar,S.lyrics.lines,P.accent,1).forEach(k=>{
        rows.push([k.layer,k.effect,k.settings,k.pal,ms(k.s),ms(k.e)]);
      });
    }
    if(rows.length) out[m.name]=rows;
  });
  return out;
}
/* ============ whole-display canvas moments (rare, one per show) ============
   For one window the entire display becomes a single graphic: a shader, a
   slow rotation, or a color fade rendered across the whole house via the
   all-display group with B_CHOICE_BufferStyle=Per Preview. */
function canvasMoment(A, P, seedF, allGroupName, opts){
  if(!allGroupName) return null;
  if(opts && opts.canvasMoment===false) return null;
  // the last build (the ramp into the final chorus); else the middle quiet
  const builds=A.sections.filter(s=>s.kind==='build');
  let sec=builds[builds.length-1];
  if(!sec){ const qs=A.sections.filter(s=>s.kind==='quiet'&&s.start>0&&s.end<A.sections[A.sections.length-1].end);
            sec=qs[Math.floor(qs.length/2)]; }
  if(!sec || sec.end-sec.start<3) return null;
  const types=['rotate','fade'];
  if(typeof selectedShaders==='function' && selectedShaders().length) types.unshift('shader');
  const type=types[Math.floor(seedF*997)%types.length];
  let row;
  if(type==='shader'){
    const calm=selectedShaders().map(id=>SHADERS.find(s=>s.id===id)).filter(s=>s&&s.tags.includes('calm'));
    const sh=(calm.length?calm:SHADERS)[Math.floor(seedF*7919)%(calm.length||SHADERS.length)];
    row=['Shader', shaderSettings(sh,'quiet')+',B_CHOICE_BufferStyle=Per Preview', ['#FFFFFF'], sh];
  } else if(type==='rotate'){
    row=['Pinwheel','E_SLIDER_Pinwheel_Arms=3,E_SLIDER_Pinwheel_Speed=4,E_CHOICE_Pinwheel_3D=3D,B_CHOICE_BufferStyle=Per Preview', P.C.slice(0,3), null];
  } else {
    row=['ColorWash','E_TEXTCTRL_ColorWash_Cycles=1,B_CHOICE_BufferStyle=Per Preview', P.C.slice(0,3), null];
  }
  return {type, start:sec.start, end:sec.end, effect:row[0], settings:row[1], pal:row[2], shader:row[3], el:allGroupName};
}
/* one shared image per frame during the moment, sampled house-wide */
let _cmCanvas=null;
function canvasMomentImage(cm, t, P){
  if(cm.type==='shader' && cm.shader){
    const img=renderShaderFrame(cm.shader, t, P);
    if(img){ img.global=true; return img; }
  }
  if(!_cmCanvas) _cmCanvas=document.createElement('canvas');
  const c=_cmCanvas; c.width=64; c.height=40;
  const x=c.getContext('2d');
  const pr=(t-cm.start)/Math.max(0.001,cm.end-cm.start);
  if(cm.type==='rotate'){
    x.fillStyle='#05060f'; x.fillRect(0,0,64,40);
    const cx=32, cy=20, ang=t*0.9;
    for(let arm=0;arm<3;arm++){
      const a=ang+arm*Math.PI*2/3;
      const g=x.createLinearGradient(cx,cy,cx+Math.cos(a)*40,cy+Math.sin(a)*40);
      const col=cm.pal[arm%cm.pal.length]||'#FFFFFF';
      g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
      x.strokeStyle=g; x.lineWidth=10; x.beginPath();
      x.moveTo(cx,cy); x.lineTo(cx+Math.cos(a)*46,cy+Math.sin(a)*46); x.stroke();
    }
  } else { // fade: slow crossfade through the palette
    const cols=cm.pal.length?cm.pal:['#FFFFFF'];
    const f=pr*(cols.length-1), i0=Math.min(cols.length-1,Math.floor(f)), i1=Math.min(cols.length-1,i0+1), fr=f-i0;
    const hx=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const a=hx(cols[i0]), b=hx(cols[i1]);
    x.fillStyle=`rgb(${Math.round(a[0]+(b[0]-a[0])*fr)},${Math.round(a[1]+(b[1]-a[1])*fr)},${Math.round(a[2]+(b[2]-a[2])*fr)})`;
    x.fillRect(0,0,64,40);
  }
  const img=x.getImageData(0,0,64,40);
  return {data:img.data, w:64, h:40, flipY:false, global:true};
}

/* preview hook: what should this screen look like right now? */
function screenPreviewFrame(m, t, P){
  const {mode,kar}=screenModeOf(m);
  if(mode==='choreo') return null;
  const A=S.analysis;
  const sec=A?A.sections.find(s=>t>=s.start&&t<s.end):null;
  const kind=sec?sec.kind:'quiet';
  const seedF=(typeof hashF==='function')?hashF(m.name,42):0.5;
  const idx=A?A.sections.indexOf(sec):0;
  let img=null;
  if(mode==='shaders'||mode==='both'){
    const sh=shaderForSection(kind,Math.max(0,idx),seedF);
    img=renderShaderFrame(sh,t,P);
    if(img&&mode==='both'){ // dim the shader under the words
      for(let i=0;i<img.data.length;i+=4){ img.data[i]*=.4; img.data[i+1]*=.4; img.data[i+2]*=.4; }
    }
  }
  if(mode==='karaoke') img=renderKaraokeFrame(m,kar,t,P.accent,'#000');
  else if(mode==='both'){
    const kimg=renderKaraokeFrame(m,kar,t,P.accent,null);
    if(kimg&&img){ // words over the dimmed shader: draw non-black karaoke pixels on top
      // resample karaoke onto the shader grid
      for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){
        const kx=Math.floor(x/img.w*kimg.w), ky=Math.floor((img.flipY?(img.h-1-y):y)/img.h*kimg.h);
        const ki=(ky*kimg.w+kx)*4, ii=(y*img.w+x)*4;
        if(kimg.data[ki]+kimg.data[ki+1]+kimg.data[ki+2]>60){
          img.data[ii]=kimg.data[ki]; img.data[ii+1]=kimg.data[ki+1]; img.data[ii+2]=kimg.data[ki+2];
        }
      }
    } else if(kimg&&!img) img=kimg;
  }
  return img;
}
