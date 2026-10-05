/** Default-off single-pigment concentration exchange; static independent V.
 * Separate lazy program, never part of Adreno field bookkeeping. */
export const WC_CONCENTRATION_DIFFUSE_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_ink, u_density, u_solvent, u_coverage;
uniform vec2 u_resolution;
uniform float u_d, u_radius, u_stencil;
float wet(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return step(0.002, 4.0 * texture2D(u_solvent, uv).a) * texture2D(u_coverage, uv).a;
}
vec4 transfer(vec2 donor, vec2 receiver, float connected) {
  float vd = 4.0 * texture2D(u_solvent, donor).a;
  float vr = 4.0 * texture2D(u_solvent, receiver).a;
  vec4 pd = texture2D(u_density, donor), pr = texture2D(u_density, receiver);
  float cd = 2.0 * pd.b / max(vd, 0.002), cr = 2.0 * pr.b / max(vr, 0.002);
  if (connected <= 0.0 || cd <= cr || pd.b <= 0.0) return vec4(0.0);
  // Mobility reads the same unchanged P for all outputs. The concentration
  // driving term is distinct from solvent advection: no V is modified.
  float gate = connected / (1.0 + 8.0 * max(cd, cr) * max(cd, cr));
  float amount = u_d * gate * min(vd, vr) * (cd - cr) * 0.5;
  vec4 ratio = pd / pd.b;
  vec4 room = (vec4(1.0) - pr) / (8.0 * max(ratio, vec4(0.000001)));
  amount = min(amount, min(pd.b / 8.0, min(min(room.r, room.g), min(room.b, room.a))));
  float share = max(amount, 0.0) / pd.b;
  // Every component is exchanged in the donor's own proportions. Whole-byte
  // pair transfer preserves all RGBA sums; capacity reserves eight faces.
  return floor(texture2D(u_ink, donor) * share * 255.0 + 0.00001) / 255.0;
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 result = texture2D(u_ink, v_uv);
  if (wet(v_uv) > 0.0) for (int k = 0; k < 8; k++) {
    vec2 o;
    if (u_stencil < 0.5) {
      if(k==0)o=vec2(1.,0.);else if(k==1)o=vec2(-1.,0.);else if(k==2)o=vec2(0.,1.);else if(k==3)o=vec2(0.,-1.);
      else if(k==4)o=vec2(1.,1.);else if(k==5)o=vec2(-1.,1.);else if(k==6)o=vec2(1.,-1.);else o=vec2(-1.,-1.);
    } else {
      if(k==0)o=vec2(2.,1.);else if(k==1)o=vec2(-2.,-1.);else if(k==2)o=vec2(1.,2.);else if(k==3)o=vec2(-1.,-2.);
      else if(k==4)o=vec2(-1.,2.);else if(k==5)o=vec2(1.,-2.);else if(k==6)o=vec2(-2.,1.);else o=vec2(2.,-1.);
    }
    o *= u_radius;
    vec2 neighbor = v_uv + o * texel;
    float connected = min(wet(v_uv), wet(neighbor));
    float steps = max(abs(o.x), abs(o.y));
    if (connected > 0.0) for (int j = 1; j < 8; j++) {
      if (float(j) < steps) {
        vec2 location = float(j) * o / steps;
        // Supercover lattice path: floor AND ceil gives the identical set
        // when traversed backwards, including half-integer knight samples.
        connected = min(connected, min(wet(v_uv + floor(location) * texel), wet(v_uv + ceil(location) * texel)));
      }
    }
    result -= transfer(v_uv, neighbor, connected);
    result += transfer(neighbor, v_uv, connected);
  }
  gl_FragColor = result;
}
`
