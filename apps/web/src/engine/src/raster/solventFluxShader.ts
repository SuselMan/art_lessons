/** Experimental conservative solvent transport. Kept separate from the Adreno
 * bookkeeping shader and compiled only when the diagnostic A/B is enabled. */
export const WC_SOLVENT_FLUX_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_paint, u_volume, u_base, u_gate, u_cost;
uniform vec2 u_texel, u_axis;
uniform float u_stride, u_volumeOutput, u_costScale, u_floorByte, u_paperGain;
float volume(vec2 uv) { return 4.0 * texture2D(u_volume, uv).a; }
float head(vec2 uv) { return max(0.0, volume(uv) - 4.0 * texture2D(u_base, uv).a); }
float wet(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return step(0.015, volume(uv)) * step(0.001, texture2D(u_gate, uv).a);
}
float mobility(vec2 uv) { return 1.0 / (1.0 + 3.0 * texture2D(u_paint, uv).b / max(volume(uv), 0.015)); }
float flow(vec2 donor, vec2 receiver) {
  float connected = wet(donor) * wet(receiver);
  if (connected < 0.5 || head(donor) <= head(receiver)) return 0.0;
  vec2 stepUV = (receiver - donor) / u_stride;
  float previous = floor(255.0 * texture2D(u_cost, donor).r + 0.5);
  float resistance = 0.0;
  for (int i = 1; i <= 16; i++) {
    if (float(i) <= u_stride) {
      vec2 uv = donor + float(i) * stepUV;
      float current = floor(255.0 * texture2D(u_cost, uv).r + 0.5);
      // Integer resistance sum: reversing a face gives exactly the same
      // coefficient, including after RGBA8 quantization.
      resistance += max(abs(current - previous) - u_floorByte, 0.0);
      previous = current;
      if (float(i) < u_stride) connected *= wet(uv);
    }
  }
  float conductivity = 1.0 / (1.0 + u_paperGain * resistance * u_costScale / (255.0 * u_stride));
  float vd = volume(donor), vr = volume(receiver);
  vec4 pd = texture2D(u_paint, donor), pr = texture2D(u_paint, receiver);
  float q = 0.2 * max(head(donor) - head(receiver), 0.0)
    * min(mobility(donor), mobility(receiver)) * connected * conductivity;
  // Two incoming faces split the receiver's volume and every P-channel room.
  q = min(q, 0.5 * max(4.0 - vr, 0.0));
  vec4 room = 0.5 * max(vec4(1.0) - pr, vec4(0.0)) * vd / max(pd, vec4(0.000001));
  q = min(q, min(min(room.r, room.g), min(room.b, room.a)));
  return floor(q * (255.0 / 4.0) + 0.00001) * (4.0 / 255.0);
}
vec4 moved(vec2 donor, float q) {
  return floor(texture2D(u_paint, donor) * q / max(volume(donor), 0.015) * 255.0 + 0.00001) / 255.0;
}
void main() {
  vec2 delta = u_axis * u_texel * u_stride;
  vec2 left = v_uv - delta, right = v_uv + delta;
  float outL = flow(v_uv, left), outR = flow(v_uv, right);
  float inL = flow(left, v_uv), inR = flow(right, v_uv);
  if (u_volumeOutput > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, (volume(v_uv) + inL + inR - outL - outR) / 4.0);
  } else {
    gl_FragColor = texture2D(u_paint, v_uv) + moved(left, inL) + moved(right, inR)
      - moved(v_uv, outL) - moved(v_uv, outR);
  }
}
`
