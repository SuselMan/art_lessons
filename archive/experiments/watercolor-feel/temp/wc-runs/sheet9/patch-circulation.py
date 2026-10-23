from pathlib import Path
p=Path('apps/web/src/engine/src/watercolor/brushDrag.ts');s=p.read_text();pos=s.index('/** Sweep contacts')
code='''/** A brush displaces liquid locally: forward beneath the centre, returning
 * around the sides. A compact stream function gives closed circulation instead
 * of a translating velocity mask that evacuates uniform paint. World Y is
 * converted to GL here; the shader takes shared face differences of this field. */
export function brushCirculationField(travel: readonly BrushTravel[], rect: { x: number; y: number; w: number; h: number }, cellPx = 4) {
  const width = Math.max(2, Math.ceil(rect.w / cellPx)), height = Math.max(2, Math.ceil(rect.h / cellPx))
  const sx = rect.w / width, sy = rect.h / height
  const potential = new Float32Array(width * height)
  for (const d of travel) {
    const length = Math.hypot(d.dx, d.dy)
    if (length < 0.01 || d.water <= 0) continue
    const rx = Math.max(d.radius * d.aspect, 0.5), ry = Math.max(d.radius, 0.5)
    const c = Math.cos(d.angle), s = Math.sin(d.angle)
    const ux = d.dx / length, uy = -d.dy / length
    const ex = Math.hypot(rx * c, ry * s), ey = Math.hypot(rx * s, ry * c)
    const x0 = Math.max(0, Math.floor((d.x - ex - rect.x) / sx)), x1 = Math.min(width - 1, Math.ceil((d.x + ex - rect.x) / sx))
    const y0 = Math.max(0, Math.floor((d.y - ey - rect.y) / sy)), y1 = Math.min(height - 1, Math.ceil((d.y + ey - rect.y) / sy))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = rect.x + (x + 0.5) * sx - d.x, py = rect.y + (y + 0.5) * sy - d.y
      const r2 = ((px * c + py * s) / rx) ** 2 + ((-px * s + py * c) / ry) ** 2
      if (r2 >= 1) continue
      const q = -ux * py - uy * px
      potential[(height - 1 - y) * width + x] += q * (1 - r2) ** 2 * length / ry * d.water
    }
  }
  let peak = 0
  for (const value of potential) peak = Math.max(peak, Math.abs(value))
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < potential.length; i++) {
    pixels[i * 4] = Math.round(128 + (peak > 0 ? 127 * potential[i] / peak : 0))
    pixels[i * 4 + 3] = 255
  }
  // Bound derivatives of the actual quantised, bilinearly sampled potential.
  // Both axis bounds include its zero extension outside the patch. Outgoing
  // advection <= .70; four concentration exchanges <= .24: no donor goes negative.
  let gx = 0, gy = 0
  const value = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height ? 0 : (pixels[(y * width + x) * 4] - 128) / 127 * peak
  for (let y = -1; y <= height; y++) for (let x = -1; x <= width; x++) {
    gx = Math.max(gx, Math.abs(value(x + 1, y) - value(x, y)) / sx)
    gy = Math.max(gy, Math.abs(value(x, y + 1) - value(x, y)) / sy)
  }
  const gain = Math.min(0.65, 0.70 / Math.max(gx + gy, 1e-4))
  return { width, height, pixels, potentialScale: peak * gain }
}

'''
s=s[:pos]+code+s[pos:];s=s.replace('NonNullable<ReturnType<typeof brushDragField>>; radius: number','ReturnType<typeof brushCirculationField>; radius: number');s=s.replace('field: brushDragField(group, bounds)!','field: brushCirculationField(group, bounds)');p.write_text(s)
p=Path('apps/web/src/engine/src/raster/shaders.ts');s=p.read_text();i=s.index('export const WC_BRUSH_DRAG_FRAG');s=s[:i]+'''export const WC_BRUSH_DRAG_FRAG = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_paint, u_flow, u_water, u_pigment;
  uniform vec2 u_step;
  uniform vec4 u_flowRect;
  uniform float u_potentialScale;
  float potentialAt(vec2 uv) {
    vec2 local = (uv - u_flowRect.xy) / u_flowRect.zw;
    if (min(min(local.x, local.y), min(1.0-local.x, 1.0-local.y)) < 0.0) return 0.0;
    return (texture2D(u_flow, local).r * 255.0 - 128.0) / 127.0;
  }
  vec2 axis(int k) {
    if (k == 0) return vec2(1.0, 0.0);
    if (k == 1) return vec2(-1.0, 0.0);
    if (k == 2) return vec2(0.0, 1.0);
    return vec2(0.0, -1.0);
  }
  float flux(vec2 from, vec2 to, vec2 direction) {
    if (min(min(to.x, to.y), min(1.0-to.x, 1.0-to.y)) < 0.0 || min(min(from.x, from.y), min(1.0-from.x, 1.0-from.y)) < 0.0) return 0.0;
    vec2 face = (from + to) * 0.5;
    vec2 tangent = vec2(-direction.y, direction.x) * u_step * 0.5;
    // Adjacent cells read the same two corners. Their face velocity has
    // opposite sign, and the four differences telescope to zero divergence.
    float velocity = (potentialAt(face + tangent) - potentialAt(face - tangent)) * u_potentialScale;
    float contact = smoothstep(0.015, 0.15, min(texture2D(u_water, from).b, texture2D(u_water, to).b));
    contact *= step(0.015, texture2D(u_water, face).b);
    float donor = texture2D(u_pigment, from).a;
    float neighbour = texture2D(u_pigment, to).a;
    float mixFraction = 0.06 * max(donor - neighbour, 0.0) / max(donor, 1e-4);
    float active = step(1e-5, abs(velocity));
    float amount = (max(velocity, 0.0) + mixFraction * active) * contact;
    float room = max(0.0, 1.0 - neighbour);
    return min(amount, room / max(4.0 * donor, 1e-4));
  }
  void main() {
    vec4 own = texture2D(u_paint, v_uv), result = own;
    for (int k=0; k<4; k++) {
      vec2 dir = axis(k), neighbour = v_uv + dir * u_step;
      result -= own * flux(v_uv, neighbour, dir);
      result += texture2D(u_paint, neighbour) * flux(neighbour, v_uv, -dir);
    }
    gl_FragColor = max(result, vec4(0.0));
  }
`;
''';p.write_text(s)
p=Path('apps/web/src/engine/index.ts');s=p.read_text().replace("'u_step', 'u_flowRect']","'u_step', 'u_flowRect', 'u_potentialScale']");s=s.replace('gl.uniform2f(this._brushDragUni.u_step,step/field.w,step/field.h)','gl.uniform2f(this._brushDragUni.u_step,step/field.w,step/field.h)\n        gl.uniform1f(this._brushDragUni.u_potentialScale,cf.potentialScale/(step*S))');p.write_text(s)
