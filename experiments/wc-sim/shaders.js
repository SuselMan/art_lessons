// Small fragment programs, one job each (Adreno's compiler has already crashed
// on one big shader in this project — see README, "Грабли").
//
// Grid: one cell per canvas pixel, N×N. All sim passes run at viewport N×N and
// address cells by gl_FragCoord (cell centre = integer + 0.5).
//
// Textures:
//   W  = (w surface water, s capillary water, mb blurred wet-mask, pin + 2·fix)
//        pin = 1 while this cell has been wet and its paper is still damp: the
//        contact line stays where the wash reached, it does not recede.
//        fix = 1 once the cell has dried out completely: pigment that has been
//        through a full drying is bound to the fibres and lifts much less (the
//        difference between a backrun into a damp wash and rewetting a dry one)
//   F  = outflow flux to (−x, +x, −y, +y) — the "virtual pipes"
//   G  = suspended pigment mass, 4 pigment slots
//   D  = deposited pigment mass, 4 pigment slots
//   paper (LUMINANCE_ALPHA, 8-bit) = (raw height, blurred height)

const HEAD = `precision highp float;
uniform vec2 u_px;          // 1/N
uniform float u_n;          // N
uniform sampler2D u_paper;
uniform float u_paperInv;   // 1/paper texture size
float paperRaw(vec2 fc){ return texture2D(u_paper, fc*u_paperInv).r; }
float paperSm(vec2 fc){ return texture2D(u_paper, fc*u_paperInv).a; }
float inb(vec2 q){ return step(0.0,q.x)*step(0.0,q.y)*step(q.x,u_n)*step(q.y,u_n); }
`

// The brush is folded into the water and pigment passes instead of being its
// own pass: WebGL1 can't blend into float targets without EXT_float_blend, so
// a separate splat pass would need a full-screen ping-pong anyway.
const BRUSH = `
uniform vec4 u_seg;     // segment a.xy -> b.xy in cells (this substep)
uniform vec4 u_brush;   // radius, target water level, rate, dryness 0..1
uniform vec4 u_brush2;  // pressure, pigment-exchange rate, on, bristle seed
uniform vec4 u_bpig;    // pigment concentration per slot
float brushFall(vec2 p){
  vec2 a=u_seg.xy, ab=u_seg.zw-u_seg.xy;
  float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.0,1.0);
  float d=length(p-a-ab*t)/u_brush.x;
  return 1.0-smoothstep(0.45,1.0,d);
}
// how much of the paper the hairs actually touch: all of it for a wet brush,
// only the tops of the grain for a starving one (dry brush)
float hash1(float x){ return fract(sin(x*127.1+311.7)*43758.5453); }
float brushContact(vec2 fc){
  float h=paperRaw(fc);
  // bristles: hairs run along the stroke, so a starving brush leaves streaks
  vec2 ab=u_seg.zw-u_seg.xy;
  vec2 nrm=length(ab)>1e-3 ? vec2(-ab.y,ab.x)/length(ab) : vec2(0.0,1.0);
  float across=dot(fc-u_seg.xy,nrm)/max(u_brush.x,1.0)*9.0+u_brush2.w;
  float i0=floor(across), fr=fract(across);
  float hair=mix(hash1(i0),hash1(i0+1.0),smoothstep(0.0,1.0,fr));
  float t0=mix(0.2,0.8-0.3*u_brush2.x,u_brush.w)+(hair-0.5)*0.35*u_brush.w;
  return mix(1.0, smoothstep(t0,t0+0.08,h), u_brush.w);
}
float brushDW(vec2 fc, float w){
  if(u_brush2.z<0.5) return 0.0;
  float f=brushFall(fc);
  if(f<=0.0) return 0.0;
  return max(0.0,u_brush.y-w)*u_brush.z*f*brushContact(fc);
}
`

export const FLUX = HEAD + `
uniform sampler2D u_W, u_F;
uniform vec4 u_flow;   // kFlow, damping, paper-height scale, breach height
uniform vec2 u_mask;   // wEps, sWet
uniform float u_tilt;
uniform float u_wFlow; // films thinner than this are pinned and don't flow
uniform vec2 u_creep;  // damp (pinned, surface-dry) paper conducts once s is between these
float H(vec2 fc, vec4 c){ return c.r + paperSm(fc)*u_flow.z + u_tilt*fc.y*u_px.y; }
float M(vec4 c){ return max(max(step(u_mask.x,c.r), step(u_mask.y,c.g)), mod(c.a,2.0)); }
float pipe(vec2 fc, vec2 dir, float hi, float fold){
  vec2 q=fc+dir;
  vec4 n=texture2D(u_W,q*u_px);
  float dh=hi-H(q,n);
  // surface water only moves into paper that is already wet (the wet-area
  // mask of Curtis); a tall enough bead breaks through anyway
  // standing water or saturated paper conducts fully; paper that is only damp
  // (pinned, no standing water) conducts by how damp it still is. A wash dries
  // unevenly, so new water finds a ragged edge where the paper got too dry to
  // carry it — this is what turns a drop into a backrun
  float open=max(step(u_mask.x,n.r), step(u_mask.y,n.g));
  float creep=mod(n.a,2.0)*smoothstep(u_creep.x,u_creep.y,n.g);
  float ok=max(max(open,creep), step(u_flow.w,dh))*inb(q);
  return ok*max(0.0, u_flow.y*fold + u_flow.x*dh);
}
void main(){
  vec2 fc=gl_FragCoord.xy;
  vec4 c=texture2D(u_W,fc*u_px);
  if(c.r<u_mask.x){ gl_FragColor=vec4(0.0); return; }
  vec4 fo=texture2D(u_F,fc*u_px);
  float hi=H(fc,c);
  vec4 f=vec4(pipe(fc,vec2(-1.0,0.0),hi,fo.x), pipe(fc,vec2(1.0,0.0),hi,fo.y),
              pipe(fc,vec2(0.0,-1.0),hi,fo.z), pipe(fc,vec2(0.0,1.0),hi,fo.w));
  float s=f.x+f.y+f.z+f.w;
  gl_FragColor=f*min(1.0,c.r/(s+1e-9))*smoothstep(u_wFlow*0.5,u_wFlow*1.5,c.r);
}`

export const WATER = HEAD + BRUSH + `
uniform sampler2D u_W, u_F;
uniform vec4 u_cap;    // capMin, capMax, absorb rate, capillary conductance
uniform vec4 u_evap;   // evap surface, edge boost, evap capillary, capillary source threshold
uniform vec4 u_mk;     // wEps, sWet, mask blur k, sPin (paper drier than this releases the pin)
float T(float a, float b){ return u_cap.w*max(0.0,a-b)*step(u_evap.w,a); }
void main(){
  vec2 fc=gl_FragCoord.xy;
  vec2 uv=fc*u_px;
  vec4 c=texture2D(u_W,uv);
  vec4 f=texture2D(u_F,uv);
  vec2 L=fc-vec2(1.0,0.0), R=fc+vec2(1.0,0.0), Dn=fc-vec2(0.0,1.0), Up=fc+vec2(0.0,1.0);
  float inflow = texture2D(u_F,L*u_px).y*inb(L) + texture2D(u_F,R*u_px).x*inb(R)
               + texture2D(u_F,Dn*u_px).w*inb(Dn) + texture2D(u_F,Up*u_px).z*inb(Up);
  float w=c.r+inflow-(f.x+f.y+f.z+f.w);
  w+=brushDW(fc,c.r);
  // absorption into the paper (capillary layer), capacity follows the fibres
  float h=paperRaw(fc);
  float cap=mix(u_cap.x,u_cap.y,h);
  float s=c.g;
  float a=min(u_cap.z,min(w,max(0.0,cap-s)));
  w-=a; s+=a;
  // capillary wicking between neighbours, conservative
  vec4 nl=texture2D(u_W,L*u_px), nr=texture2D(u_W,R*u_px), nd=texture2D(u_W,Dn*u_px), nu=texture2D(u_W,Up*u_px);
  float sl=nl.g*inb(L), sr=nr.g*inb(R), sd=nd.g*inb(Dn), su=nu.g*inb(Up);
  s += T(sl,c.g)+T(sr,c.g)+T(sd,c.g)+T(su,c.g) - T(c.g,sl)-T(c.g,sr)-T(c.g,sd)-T(c.g,su);
  // wet mask and its blur (screened-Poisson blur, one Jacobi sweep per step)
  float pin0=mod(c.a,2.0), fix=floor(c.a*0.5+0.25);
  float pin=pin0;
  if(w>u_mk.x) pin=1.0; else if(s<u_mk.w) pin=0.0;
  if(pin0>0.5 && pin<0.5) fix=1.0;
  float m=max(max(step(u_mk.x,w),step(u_mk.y,s)),pin);
  float mb=mix(0.25*(nl.b+nr.b+nd.b+nu.b), m, u_mk.z);
  float edge=m*clamp(1.0-mb,0.0,1.0);
  // evaporation: faster at the rim of the wet area (Deegan), this is what
  // drives water - and pigment with it - outwards to the edge
  w=max(0.0, w-u_evap.x*(1.0+u_evap.y*edge));
  s=max(0.0, s-u_evap.z*(1.0-step(u_mk.x,w)));
  gl_FragColor=vec4(w,s,mb,pin+2.0*fix);
}`

export const PIG_D = HEAD + `
uniform sampler2D u_W, u_G, u_D;
uniform vec4 u_gran, u_dens, u_stain;  // per pigment slot
uniform vec4 u_ex;      // settle, lift, w0, wDry
uniform float u_wLift;
uniform float u_loose;  // lift multiplier for pigment that has never dried
void main(){
  vec2 fc=gl_FragCoord.xy; vec2 uv=fc*u_px;
  vec4 g=texture2D(u_G,uv), d=texture2D(u_D,uv);
  vec4 wt=texture2D(u_W,uv);
  float w=wt.r;
  float fix=floor(wt.a*0.5+0.25);
  float h=paperRaw(fc);
  // settling out of suspension: heavy (dens) pigments fall faster, granulating
  // ones prefer the valleys of the grain (1-gran*h), thin water settles faster
  vec4 down=g*clamp(u_ex.x*u_dens*(1.0-u_gran*h)/(w+u_ex.z),0.0,1.0);
  if(w<u_ex.w) down=g;
  // lifting back into the water: only under standing water, less for staining
  // pigments, more on the peaks for granulating ones
  float wet=smoothstep(u_ex.w,u_wLift,w);
  vec4 up=min(d, d*u_ex.y*mix(u_loose,1.0,fix)*wet*(1.0+(h-1.0)*u_gran)/u_stain);
  gl_FragColor=max(vec4(0.0), d+down-up);
}`

export const PIG_G = HEAD + BRUSH + `
uniform sampler2D u_W, u_F, u_G, u_D, u_Dn;
uniform float u_kDiff;
vec4 conc(vec4 g, float w){ return g/max(w,1e-5); }
void main(){
  vec2 fc=gl_FragCoord.xy; vec2 uv=fc*u_px;
  vec4 c=texture2D(u_W,uv), f=texture2D(u_F,uv), g=texture2D(u_G,uv);
  vec2 L=fc-vec2(1.0,0.0), R=fc+vec2(1.0,0.0), Dn=fc-vec2(0.0,1.0), Up=fc+vec2(0.0,1.0);
  vec4 wl=texture2D(u_W,L*u_px), wr=texture2D(u_W,R*u_px), wd=texture2D(u_W,Dn*u_px), wu=texture2D(u_W,Up*u_px);
  vec4 cl=conc(texture2D(u_G,L*u_px),wl.r), cr=conc(texture2D(u_G,R*u_px),wr.r),
       cd=conc(texture2D(u_G,Dn*u_px),wd.r), cu=conc(texture2D(u_G,Up*u_px),wu.r);
  vec4 ci=conc(g,c.r);
  // pigment rides the same pipes as the water: mass-conserving upwind transport
  vec4 gn = g - (f.x+f.y+f.z+f.w)*ci
          + texture2D(u_F,L*u_px).y*inb(L)*cl + texture2D(u_F,R*u_px).x*inb(R)*cr
          + texture2D(u_F,Dn*u_px).w*inb(Dn)*cd + texture2D(u_F,Up*u_px).z*inb(Up)*cu;
  // Brownian mixing inside standing water (wet-in-wet softness)
  float e=1e-3;
  gn += u_kDiff*( (cl-ci)*min(c.r,wl.r)*step(e,wl.r)*inb(L) + (cr-ci)*min(c.r,wr.r)*step(e,wr.r)*inb(R)
                + (cd-ci)*min(c.r,wd.r)*step(e,wd.r)*inb(Dn) + (cu-ci)*min(c.r,wu.r)*step(e,wu.r)*inb(Up) )*step(e,c.r);
  // settle / lift exchange computed by the D pass
  gn -= texture2D(u_Dn,uv)-texture2D(u_D,uv);
  // brush: new water arrives with the brush's paint; hairs also swap paint
  // with the puddle they're dragged through (charge-in, and a thirsty brush lifts)
  float dw=brushDW(fc,c.r);
  gn += dw*u_bpig;
  if(u_brush2.z>0.5){
    float fb=brushFall(fc)*brushContact(fc);
    gn += fb*u_brush2.y*(u_bpig*(c.r+dw)-gn);
  }
  gl_FragColor=max(vec4(0.0),gn);
}`

// One texel per 16×16 tile: is anything still moving here?
export const TILE_SCAN = `precision highp float;
uniform sampler2D u_W, u_G;
uniform vec2 u_px;
uniform vec3 u_thr;  // w, s, g thresholds
void main(){
  vec2 base=floor(gl_FragCoord.xy)*16.0;
  float wet=0.0;
  for(int j=0;j<16;j++) for(int i=0;i<16;i++){
    vec2 uv=(base+vec2(float(i),float(j))+0.5)*u_px;
    vec4 w=texture2D(u_W,uv); vec4 g=texture2D(u_G,uv);
    wet=max(wet, max(step(u_thr.x,w.r), max(step(u_thr.y,w.g), step(u_thr.z,g.x+g.y+g.z+g.w))));
  }
  gl_FragColor=vec4(wet,0.0,0.0,1.0);
}`

export const DRY_ALL = HEAD + `
uniform sampler2D u_G, u_D;
void main(){ vec2 uv=gl_FragCoord.xy*u_px; gl_FragColor=texture2D(u_D,uv)+texture2D(u_G,uv); }`

// Display: Kubelka–Munk. All pigments in a cell are treated as one mixed layer
// (sum of K and S weighted by mass) over the paper. Suspended pigment is shown
// too, so a wet wash looks like paint and not like an empty puddle.
export const DISPLAY = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_W, u_G, u_D, u_paper;
uniform float u_paperInv, u_n, u_thick, u_view, u_shade;
uniform vec3 u_K0,u_K1,u_K2,u_K3,u_S0,u_S1,u_S2,u_S3;
uniform vec3 u_paperCol;
vec3 sinh3(vec3 x){ vec3 e=exp(x); return 0.5*(e-1.0/e); }
vec3 cosh3(vec3 x){ vec3 e=exp(x); return 0.5*(e+1.0/e); }
void main(){
  vec2 fc=v_uv*u_n;
  vec4 wt=texture2D(u_W,v_uv);
  vec4 g=texture2D(u_G,v_uv), d=texture2D(u_D,v_uv);
  if(u_view>0.5){
    if(u_view<1.5){ gl_FragColor=vec4(vec3(1.0)-vec3(wt.r*2.0,wt.r*1.2,wt.r*0.4),1.0); return; }
    if(u_view<2.5){ gl_FragColor=vec4(vec3(1.0)-vec3(wt.g*4.0),1.0); return; }
    if(u_view<3.5){ float m=wt.b; gl_FragColor=vec4(m,m*0.5,1.0-m,1.0); return; }
    vec4 gg=g*u_thick; gl_FragColor=vec4(1.0-gg.x-gg.w, 1.0-gg.y-gg.w, 1.0-gg.z, 1.0); return;
  }
  vec4 m=(d+g)*u_thick;
  vec3 K=m.x*u_K0+m.y*u_K1+m.z*u_K2+m.w*u_K3;
  vec3 S=m.x*u_S0+m.y*u_S1+m.z*u_S2+m.w*u_S3+vec3(1e-4);
  vec3 a=1.0+K/S;
  vec3 b=sqrt(max(a*a-1.0,vec3(1e-8)));
  vec3 bS=min(b*S,vec3(20.0));
  vec3 sh=sinh3(bS), ch=cosh3(bS);
  vec3 c=a*sh+b*ch;
  vec3 R=sh/c, Tr=b/c;
  // paper: white with a little relief shading from the grain
  float h=texture2D(u_paper,fc*u_paperInv).r;
  float hx=texture2D(u_paper,(fc+vec2(1.0,0.0))*u_paperInv).r;
  float hy=texture2D(u_paper,(fc+vec2(0.0,1.0))*u_paperInv).r;
  float shade=clamp(1.0+u_shade*((hx-h)-(hy-h)),0.85,1.1);
  vec3 Rg=u_paperCol*shade;
  vec3 Rt=R+Tr*Tr*Rg/(1.0-R*Rg);
  // wet paper is a touch darker and more saturated than dry
  float wet=smoothstep(0.0,0.15,wt.r)*0.07+smoothstep(0.0,0.1,wt.g)*0.03;
  Rt*=1.0-wet;
  gl_FragColor=vec4(pow(clamp(Rt,0.0,1.0),vec3(0.95)),1.0);
}`
